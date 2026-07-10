// Edge Function: get-preview-data
//
// GET /?token=<uuid>   (público — o token opaco É a credencial)
//
// Devolve o mesmo payload que usePlayerConfigData usa em modo 'live',
// consumido pelo Player renderizado dentro do iframe do Admin.
//
// Deploy manual:
//   supabase functions deploy get-preview-data --no-verify-jwt
//
// Env obrigatórias (default do runtime Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Opcional:
//   MEDIA_BUCKET (default: "media")

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEDIA_BUCKET = Deno.env.get("MEDIA_BUCKET") ?? "media";
const SIGNED_URL_TTL_SECONDS = 60 * 15; // 15 min

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------- Media helpers ----------------

type MediaFile = {
  id: string;
  name: string | null;
  type: string | null;
  storage_path: string | null;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

async function fetchMediaMap(ids: string[]): Promise<Map<string, MediaFile>> {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return new Map();
  const { data, error } = await admin
    .from("media_files")
    .select(
      "id, name, type, storage_path, thumbnail_path, width, height, duration",
    )
    .in("id", clean);
  if (error) throw error;
  const map = new Map<string, MediaFile>();
  for (const m of (data ?? []) as MediaFile[]) map.set(m.id, m);
  return map;
}

async function signPath(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function signMediaMap(
  media: Map<string, MediaFile>,
): Promise<Map<string, MediaFile & { url: string | null; thumbnail_url: string | null }>> {
  const out = new Map<string, MediaFile & { url: string | null; thumbnail_url: string | null }>();
  await Promise.all(
    [...media.values()].map(async (m) => {
      const [url, thumbnail_url] = await Promise.all([
        signPath(m.storage_path),
        signPath(m.thumbnail_path),
      ]);
      out.set(m.id, { ...m, url, thumbnail_url });
    }),
  );
  return out;
}

// ---------------- Playlist ----------------

async function loadPlaylist(playlistId: string) {
  const [{ data: playlist, error: pErr }, { data: items, error: iErr }] =
    await Promise.all([
      admin
        .from("playlists")
        .select("*")
        .eq("id", playlistId)
        .maybeSingle(),
      admin
        .from("playlist_items")
        .select("*")
        .eq("playlist_id", playlistId)
        .order("position"),
    ]);
  if (pErr) throw pErr;
  if (iErr) throw iErr;
  if (!playlist) return null;

  const mediaIds = (items ?? [])
    .map((it: any) => it.media_file_id)
    .filter(Boolean);
  const media = await signMediaMap(await fetchMediaMap(mediaIds));

  const enriched = (items ?? []).map((it: any) => ({
    ...it,
    media_file: it.media_file_id ? media.get(it.media_file_id) ?? null : null,
  }));

  return { ...(playlist as any), items: enriched };
}

// ---------------- Template ----------------

function collectPlaylistIdsFromZones(zones: any[]): string[] {
  return zones
    .filter((z) => (z.content_type ?? z.type) === "playlist")
    .map((z) => z.playlist_id)
    .filter(Boolean);
}

function collectPlaylistIdsFromElements(elements: any[]): string[] {
  return elements
    .filter((e) => e.element_type === "playlist")
    .map((e) => (e.content as any)?.playlistId)
    .filter(Boolean);
}

function collectMediaIdsFromZones(zones: any[]): string[] {
  return zones
    .map((z) => z.media_file_id)
    .filter(Boolean);
}

function collectMediaIdsFromElements(elements: any[]): string[] {
  const ids: string[] = [];
  for (const el of elements) {
    if (el.element_type === "image" || el.element_type === "logo" || el.element_type === "video") {
      const id = (el.content as any)?.mediaFileId;
      if (id) ids.push(id);
    }
  }
  return ids;
}

async function loadTemplate(templateId: string) {
  const { data: template, error: tErr } = await admin
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!template) return null;

  const type = (template as any).type ?? "grid";

  // Zones (grid) OU elements (canvas)
  const [zonesRes, elementsRes] =
    type === "canvas"
      ? [{ data: [], error: null } as any, await admin
          .from("template_elements")
          .select("*")
          .eq("template_id", templateId)
          .order("z_index")]
      : [await admin
          .from("template_zones")
          .select("*")
          .eq("template_id", templateId)
          .order("zone_index"), { data: [], error: null } as any];

  if (zonesRes.error) throw zonesRes.error;
  if (elementsRes.error) throw elementsRes.error;
  const zones: any[] = zonesRes.data ?? [];
  const elements: any[] = elementsRes.data ?? [];

  // Playlists referenciadas
  const playlistIds = Array.from(
    new Set([
      ...collectPlaylistIdsFromZones(zones),
      ...collectPlaylistIdsFromElements(elements),
    ]),
  );
  const playlists = await Promise.all(playlistIds.map((id) => loadPlaylist(id)));
  const playlistMap = new Map<string, any>();
  for (const p of playlists) if (p) playlistMap.set(p.id, p);

  // Mídias diretas (fora das playlists — playlists já resolveram as próprias)
  const directMediaIds = Array.from(
    new Set([
      ...collectMediaIdsFromZones(zones),
      ...collectMediaIdsFromElements(elements),
      (template as any).background_media_id,
    ].filter(Boolean) as string[]),
  );
  const media = await signMediaMap(await fetchMediaMap(directMediaIds));

  const backgroundMediaId = (template as any).background_media_id ?? null;
  const background_media = backgroundMediaId
    ? media.get(backgroundMediaId) ?? null
    : null;

  // Enriquecimento
  const enrichedZones = zones.map((z) => {
    const contentType = z.content_type ?? z.type;
    if (contentType === "playlist" && z.playlist_id) {
      return { ...z, playlist: playlistMap.get(z.playlist_id) ?? null };
    }
    if (z.media_file_id) {
      return { ...z, media_file: media.get(z.media_file_id) ?? null };
    }
    // widget: mantém widget_config como está (sem segredos, por design)
    return z;
  });

  const enrichedElements = elements.map((el) => {
    if (el.element_type === "playlist") {
      const pid = (el.content as any)?.playlistId;
      return { ...el, playlist: pid ? playlistMap.get(pid) ?? null : null };
    }
    if (el.element_type === "image" || el.element_type === "logo" || el.element_type === "video") {
      const mid = (el.content as any)?.mediaFileId;
      return { ...el, media_file: mid ? media.get(mid) ?? null : null };
    }
    // widget/shape/text — payload inalterado
    return el;
  });

  return {
    template,
    background_media,
    zones: enrichedZones,
    elements: enrichedElements,
  };
}

// ---------------- Handler ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token || token.length < 16 || token.length > 128)
    return json({ error: "invalid_token" }, 400);

  const { data: session, error: sErr } = await admin
    .from("preview_sessions")
    .select("token, organization_id, scope, target_id, expires_at, created_by")
    .eq("token", token)
    .maybeSingle();

  if (sErr) return json({ error: "session_lookup_failed" }, 500);
  if (!session) return json({ error: "not_found" }, 404);

  const expiresAt = new Date((session as any).expires_at);
  if (!isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now())
    return json({ error: "preview_expired" }, 410);

  try {
    const scope = (session as any).scope as string;
    const targetId = (session as any).target_id as string;
    const expiresIso = (session as any).expires_at as string;

    if (scope === "template") {
      const payload = await loadTemplate(targetId);
      if (!payload) return json({ error: "template_not_found" }, 404);
      return json({
        mode: "live",
        scope,
        session: { expires_at: expiresIso },
        ...payload,
      });
    }

    if (scope === "player") {
      const { data: player, error: pErr } = await admin
        .from("players")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();
      if (pErr) return json({ error: "player_lookup_failed" }, 500);
      if (!player) return json({ error: "player_not_found" }, 404);
      const templateId = (player as any).current_template_id;
      if (!templateId)
        return json({
          mode: "live",
          scope,
          session: { expires_at: expiresIso },
          player,
          template: null,
          background_media: null,
          zones: [],
          elements: [],
        });
      const payload = await loadTemplate(templateId);
      if (!payload) return json({ error: "template_not_found" }, 404);
      return json({
        mode: "live",
        scope,
        session: { expires_at: expiresIso },
        player,
        ...payload,
      });
    }

    if (scope === "playlist") {
      const playlist = await loadPlaylist(targetId);
      if (!playlist) return json({ error: "playlist_not_found" }, 404);
      return json({
        mode: "live",
        scope,
        session: { expires_at: expiresIso },
        playlist,
      });
    }

    return json({ error: "invalid_scope" }, 400);
  } catch (e) {
    return json(
      { error: "internal_error", detail: (e as Error)?.message ?? String(e) },
      500,
    );
  }
});