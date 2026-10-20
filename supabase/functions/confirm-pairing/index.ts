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

// =====================================================================
// Novo código de pareamento para player existente (re-pareamento)
//
// Admin: POST { action: "repair", player_id }  (JWT owner/admin)
//   -> { ok, code, pairing_id, expires_at }
// Tela:  POST { action: "repair_status", device_token }
//   -> { repair_requested, code?, pairing_id?, expires_at?, repaired?, expired? }
// Ao confirmar o código (fluxo normal deste endpoint), o mesmo device e
// device_token são reaproveitados — a tela não perde a credencial.
// =====================================================================
const REPAIR_TTL_MS = 15 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

type Env = { supabaseUrl: string; serviceRole: string; anonKey: string };

async function handleRepairStatus(env: Env, deviceToken: string) {
  if (!deviceToken) return json({ error: "missing_device_token" }, 400);
  const admin = createClient(env.supabaseUrl, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: dev } = await admin
    .from("devices")
    .select("id, metadata")
    .eq("token", deviceToken)
    .maybeSingle();
  if (!dev) return json({ error: "invalid_device_token" }, 401);
  const meta = (dev.metadata ?? {}) as Record<string, any>;
  const rp = meta.repair as
    | { pairing_id: string; code: string; expires_at: string }
    | undefined;
  if (!rp) return json({ repair_requested: false });

  const { data: pc } = await admin
    .from("pairing_codes")
    .select("id, status, confirmed_at, expires_at")
    .eq("id", rp.pairing_id)
    .maybeSingle();
  const confirmed =
    !!pc && (String(pc.status).toLowerCase() === "confirmed" || !!pc.confirmed_at);
  const expired = !pc || new Date(pc.expires_at).getTime() < Date.now();
  if (confirmed || expired) {
    const { repair: _r, ...rest } = meta;
    await admin.from("devices").update({ metadata: rest }).eq("id", dev.id);
    return json({ repair_requested: false, repaired: confirmed, expired: !confirmed });
  }
  return json({
    repair_requested: true,
    code: rp.code,
    pairing_id: rp.pairing_id,
    expires_at: rp.expires_at,
  });
}

async function handleRepairRequest(env: Env, userId: string, body: any) {
  const playerId = String(body?.player_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(playerId))
    return json({ error: "invalid_player_id" }, 400);
  const admin = createClient(env.supabaseUrl, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("users")
    .select("organization_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.organization_id) return json({ error: "no_organization" }, 403);
  if (!ALLOWED_ROLES.has(String(profile.role)))
    return json({ error: "forbidden_role" }, 403);

  const { data: player } = await admin
    .from("players")
    .select("id, organization_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player || player.organization_id !== profile.organization_id)
    return json({ error: "player_not_found" }, 404);

  const { data: dev } = await admin
    .from("devices")
    .select("id, token, metadata")
    .eq("id", playerId)
    .maybeSingle();
  if (!dev) return json({ error: "device_not_found" }, 404);

  await admin
    .from("pairing_codes")
    .update({ status: "expired" })
    .eq("device_id", dev.id)
    .eq("status", "pending");

  const expiresAt = new Date(Date.now() + REPAIR_TTL_MS).toISOString();
  let inserted: { id: string; code: string } | null = null;
  let lastErr: string | null = null;
  for (let i = 0; i < 5 && !inserted; i++) {
    const { data, error } = await admin
      .from("pairing_codes")
      .insert({
        code: randomCode(),
        status: "pending",
        device_id: dev.id,
        device_token: dev.token,
        expires_at: expiresAt,
      })
      .select("id, code")
      .single();
    if (!error && data) inserted = data as { id: string; code: string };
    else lastErr = error?.message ?? null;
  }
  if (!inserted) return json({ error: "code_generation_failed", detail: lastErr }, 500);

  const meta = (dev.metadata ?? {}) as Record<string, unknown>;
  await admin
    .from("devices")
    .update({
      metadata: {
        ...meta,
        repair: {
          pairing_id: inserted.id,
          code: inserted.code,
          expires_at: expiresAt,
          requested_at: new Date().toISOString(),
          requested_by: userId,
        },
      },
    })
    .eq("id", dev.id);

  return json({ ok: true, code: inserted.code, pairing_id: inserted.id, expires_at: expiresAt });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const env = readEnv();
  if ("missing" in env)
    return json({ error: "missing_env", missing: env.missing }, 500);

  let preBody: any;
  try {
    preBody = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // ---- Ação da TELA: consultar se o Admin pediu novo código ----
  // POST { action: "repair_status", device_token }
  if (preBody?.action === "repair_status") {
    return await handleRepairStatus(env, String(preBody?.device_token ?? "").trim());
  }

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
  const body = preBody;

  // ---- Ação: gerar novo código para um player existente (Admin) ----
  if (body?.action === "repair") {
    return await handleRepairRequest(env, userId, body);
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
  // ---- Cria o device (o Player recebe id + token no poll-pairing-status) ----
  let deviceId: string | null = pairing.device_id ?? null;
  let deviceToken: string | null = null;
  if (!deviceId) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    deviceToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: dev, error: devErr } = await admin
      .from("devices")
      .insert({ token: deviceToken, metadata: { confirmed_by: userId } })
      .select("id")
      .single();
    if (devErr || !dev)
      return json(
        { error: "device_insert_failed", detail: devErr?.message ?? null },
        500,
      );
    deviceId = dev.id as string;
  }

  // ---- Cria o player usando o MESMO id do device ----
  // Contrato do backend: players.id === devices.id.
  const { data: existingPlayer } = await admin
    .from("players")
    .select("id")
    .eq("id", deviceId)
    .maybeSingle();

  if (!existingPlayer) {
    const { error: insertErr } = await admin.from("players").insert({
      id: deviceId,
      organization_id: profile.organization_id,
      auth_user_id: userId,
      name: rawName,
      status: "offline",
    });
    if (insertErr)
      return json(
        { error: "player_insert_failed", detail: insertErr.message },
        500,
      );
  } else {
    const { error: updErr } = await admin
      .from("players")
      .update({ organization_id: profile.organization_id, name: rawName })
      .eq("id", deviceId);
    if (updErr)
      return json(
        { error: "player_update_failed", detail: updErr.message },
        500,
      );
  }

  // ---- Marca pairing_code como confirmado ----
  const update: Record<string, unknown> = {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    device_id: deviceId,
  };
  if (deviceToken) update.device_token = deviceToken;
  const { error: confErr } = await admin
    .from("pairing_codes")
    .update(update)
    .eq("id", pairing.id);

  if (confErr)
    return json(
      { error: "pairing_update_failed", detail: confErr.message },
      500,
    );

  return json({
    ok: true,
    player_id: deviceId,
    organization_id: profile.organization_id,
  });
});