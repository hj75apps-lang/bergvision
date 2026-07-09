// Edge Function: create-preview-token
//
// POST { scope: 'template' | 'player' | 'playlist', target_id: uuid }
//
// Autenticada via JWT do Supabase Auth (Authorization: Bearer ...).
// Cria uma linha em preview_sessions e devolve { token, expires_at }.
// Regras:
//  - viewer NÃO pode gerar preview (403)
//  - target_id precisa pertencer à mesma organization_id do chamador (403)
//
// Deploy manual (fora do Lovable):
//   supabase functions deploy create-preview-token --no-verify-jwt
// (a verificação de JWT é feita explicitamente aqui, usando o service_role
//  para checar org/role sem depender de RLS)

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = new Set(["owner", "admin", "editor"]);
const SCOPE_TO_TABLE: Record<string, string> = {
  template: "templates",
  player: "players",
  playlist: "playlists",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ---- Auth: valida o JWT do chamador ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_authorization" }, 401);

  // Cliente escoped ao usuário só para extrair auth.uid via getUser.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
  const userId = userData.user.id;

  // ---- Body ----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const scope = String(body?.scope ?? "");
  const targetId = String(body?.target_id ?? "");
  const table = SCOPE_TO_TABLE[scope];
  if (!table) return json({ error: "invalid_scope" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(targetId))
    return json({ error: "invalid_target_id" }, 400);

  // ---- Admin client (bypassa RLS para checagens confiáveis) ----
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Org + role do chamador
  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("organization_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) return json({ error: "profile_lookup_failed" }, 500);
  if (!profile) return json({ error: "user_not_found" }, 404);
  if (!profile.organization_id) return json({ error: "no_organization" }, 403);
  if (!ALLOWED_ROLES.has(String(profile.role)))
    return json({ error: "forbidden_role" }, 403);

  // Target pertence à mesma org?
  const { data: target, error: targetErr } = await admin
    .from(table)
    .select("id, organization_id")
    .eq("id", targetId)
    .maybeSingle();

  if (targetErr) return json({ error: "target_lookup_failed" }, 500);
  if (!target) return json({ error: "target_not_found" }, 404);
  if (target.organization_id !== profile.organization_id)
    return json({ error: "forbidden_target" }, 403);

  // ---- Insere a sessão de preview (expires_at usa o default de 15 min) ----
  const { data: session, error: insertErr } = await admin
    .from("preview_sessions")
    .insert({
      organization_id: profile.organization_id,
      scope,
      target_id: targetId,
      created_by: userId,
    })
    .select("id, expires_at")
    .single();

  if (insertErr || !session)
    return json(
      { error: "insert_failed", detail: insertErr?.message ?? null },
      500,
    );

  return json({ token: session.id, expires_at: session.expires_at });
});