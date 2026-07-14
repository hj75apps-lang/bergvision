// Edge Function: confirm-pairing
//
// POST { code | pairing_code | pin_code: string(6), name | player_name: string }
//
// Autenticada via JWT do Supabase Auth (Authorization: Bearer <user_jwt>).
// Fluxo:
//   1. Valida o JWT do operador e resolve organization_id + role em `users`.
//   2. Localiza a linha em `pairing_codes` pelo código (case-insensitive),
//      garantindo que esteja `pending` e dentro do prazo (`expires_at`).
//   3. Cria a linha em `players` (organization_id, name, status='offline')
//      compartilhando o mesmo `id` do `devices.id` já criado pelo Player em
//      `request-pairing-code` (contrato: players.id === devices.id).
//   4. Marca a `pairing_codes` como `confirmed` (+ confirmed_at) para que o
//      Player, no próximo `poll-pairing-status`, receba o token e o player_id.
//
// Deploy:
//   supabase functions deploy confirm-pairing
//   (a função valida o JWT explicitamente; pode ficar com --verify-jwt default)

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = new Set(["owner", "admin"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function readEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey =
    Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");

  const missing = [
    !supabaseUrl ? "SUPABASE_URL" : null,
    !serviceRole ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    !anonKey ? "ANON_KEY" : null,
  ].filter(Boolean);

  if (missing.length > 0) return { missing } as const;
  return {
    supabaseUrl: supabaseUrl!,
    serviceRole: serviceRole!,
    anonKey: anonKey!,
  } as const;
}

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{6}$/.test(cleaned)) return null;
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const env = readEnv();
  if ("missing" in env)
    return json({ error: "missing_env", missing: env.missing }, 500);

  // ---- Auth: valida o JWT do operador (Admin logado) ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_authorization" }, 401);

  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user)
    return json(
      { error: "invalid_token", detail: userErr?.message ?? null },
      401,
    );
  const userId = userData.user.id;

  // ---- Body ----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const code = normalizeCode(body?.code ?? body?.pairing_code ?? body?.pin_code);
  if (!code) return json({ error: "invalid_code" }, 400);

  const rawName = String(body?.name ?? body?.player_name ?? "").trim();
  if (!rawName || rawName.length < 2 || rawName.length > 80)
    return json({ error: "invalid_name" }, 400);

  // ---- Admin client (bypassa RLS para gravações confiáveis) ----
  const admin = createClient(env.supabaseUrl, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Org + role do operador
  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("organization_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr)
    return json(
      { error: "profile_lookup_failed", detail: profileErr.message },
      500,
    );
  if (!profile) return json({ error: "user_not_found" }, 404);
  if (!profile.organization_id) return json({ error: "no_organization" }, 403);
  if (!ALLOWED_ROLES.has(String(profile.role)))
    return json({ error: "forbidden_role" }, 403);

  // ---- Localiza o pairing_code ----
  const { data: pairing, error: pairingErr } = await admin
    .from("pairing_codes")
    .select("id, code, status, device_id, expires_at, confirmed_at")
    .eq("code", code)
    .maybeSingle();

  if (pairingErr)
    return json(
      { error: "pairing_lookup_failed", detail: pairingErr.message },
      500,
    );
  if (!pairing) return json({ error: "invalid_code" }, 404);

  const now = Date.now();
  const expires = pairing.expires_at ? new Date(pairing.expires_at).getTime() : 0;
  if (!expires || now > expires)
    return json({ error: "code_expired" }, 410);

  const status = String(pairing.status ?? "").toLowerCase();
  if (status === "confirmed" || pairing.confirmed_at)
    return json({ error: "code_already_used" }, 409);
  if (status && status !== "pending")
    return json({ error: "code_not_pending", detail: status }, 409);
  if (!pairing.device_id)
    return json({ error: "pairing_without_device" }, 500);

  // ---- Cria o player usando o MESMO id do device ----
  // Contrato do backend: players.id === devices.id (pairing_codes.device_id).
  const { data: existingPlayer } = await admin
    .from("players")
    .select("id")
    .eq("id", pairing.device_id)
    .maybeSingle();

  if (!existingPlayer) {
    const { error: insertErr } = await admin.from("players").insert({
      id: pairing.device_id,
      organization_id: profile.organization_id,
      name: rawName,
      status: "offline",
    });
    if (insertErr)
      return json(
        { error: "player_insert_failed", detail: insertErr.message },
        500,
      );
  } else {
    // Se por algum motivo já existia (re-pareamento), apenas atualiza nome/org.
    const { error: updErr } = await admin
      .from("players")
      .update({
        organization_id: profile.organization_id,
        name: rawName,
      })
      .eq("id", pairing.device_id);
    if (updErr)
      return json(
        { error: "player_update_failed", detail: updErr.message },
        500,
      );
  }

  // ---- Marca pairing_code como confirmado ----
  const { error: confErr } = await admin
    .from("pairing_codes")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", pairing.id);

  if (confErr)
    return json(
      { error: "pairing_update_failed", detail: confErr.message },
      500,
    );

  return json({
    ok: true,
    player_id: pairing.device_id,
    organization_id: profile.organization_id,
  });
});