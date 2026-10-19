// Edge Function: widget-rss
//
// POST { url: string, max?: number }
// Requer JWT do Supabase Auth (Authorization: Bearer ...).
//
// Faz proxy do feed RSS/Atom, parseia XML e devolve JSON:
//   { items: [{ title, link, pubDate }] }
// Texto é sempre normalizado (sem HTML) para o Player renderizar seguro.
//
// Deploy:
//   supabase functions deploy widget-rss

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Cache curto na borda + SWR para reduzir chamadas quando vários
      // Players compartilham o mesmo feed. As URLs de imagem retornadas
      // são hotlink direto ao publisher — não armazenamos nada.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      ...CORS,
    },
  });
}

function stripHtml(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? stripHtml(m[1]) : "";
}

function pickLink(block: string): string {
  const rss = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim()) return stripHtml(rss[1]);
  const atom = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return atom ? atom[1] : "";
}

// Extrai a URL da imagem da notícia. Testa, em ordem, os padrões mais
// comuns em feeds de portais (Media RSS, enclosure, itunes, <img> em
// description/content:encoded). Retorna null se nada for encontrado.
function pickImage(block: string): string | null {
  const patterns: RegExp[] = [
    /<media:content[^>]*url="([^"]+)"[^>]*(?:medium="image"|type="image\/[^"]+")/i,
    /<media:content[^>]*(?:medium="image"|type="image\/[^"]+")[^>]*url="([^"]+)"/i,
    /<media:thumbnail[^>]*url="([^"]+)"/i,
    /<enclosure[^>]*url="([^"]+)"[^>]*type="image\/[^"]+"/i,
    /<enclosure[^>]*type="image\/[^"]+"[^>]*url="([^"]+)"/i,
    /<itunes:image[^>]*href="([^"]+)"/i,
    // <img src="..."> dentro de <description> ou <content:encoded> (CDATA ou não)
    /<img[^>]+src=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = block.match(re);
    if (m && m[1]) {
      const url = m[1].trim();
      // Só HTTPS para evitar mixed content no Player.
      if (/^https:\/\//i.test(url)) return url;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey =
    Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "missing_env" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Aceita JWT de usuário do Admin OU device_token da tela pareada.
  const deviceToken = String(body?.device_token ?? "").trim();
  if (deviceToken) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "missing_env" }, 500);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: dev } = await admin
      .from("devices").select("id").eq("token", deviceToken).maybeSingle();
    if (!dev) return json({ error: "invalid_device_token" }, 401);
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing_authorization" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
  }

  const url = String(body?.url ?? "").trim();
  const max = Math.max(1, Math.min(20, Number(body?.max ?? 5) || 5));

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return json({ error: "invalid_url" }, 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return json({ error: "invalid_protocol" }, 400);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BergVision-Widget/1.0 (+https://bergvision.lovable.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
      },
    });
    if (!res.ok) return json({ error: "fetch_failed", status: res.status }, 502);
    const xml = await res.text();

    // Itens de RSS (<item>) ou Atom (<entry>)
    const blocks = [
      ...xml.matchAll(/<item[\s\S]*?<\/item>/gi),
      ...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi),
    ]
      .map((m) => m[0])
      .slice(0, max);

    const items = blocks.map((block) => ({
      title: pick(block, "title") || "—",
      link: pickLink(block),
      pubDate:
        pick(block, "pubDate") ||
        pick(block, "updated") ||
        pick(block, "published") ||
        "",
      image: pickImage(block),
    }));

    return json({ items });
  } catch (e) {
    return json({ error: "fetch_error", detail: (e as Error).message }, 502);
  }
});