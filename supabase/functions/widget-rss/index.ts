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

// ---------- Suporte a APIs JSON ----------

function getPath(obj: any, path: string): any {
  if (!path) return obj;
  let cur = obj;
  for (const k of path.split(".").filter(Boolean)) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function toText(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(" - ");
  if (typeof v === "object") return "";
  return stripHtml(String(v));
}

function findArray(data: any, depth = 0): any[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object" || depth > 2) return null;
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  for (const v of Object.values(data)) {
    const r = findArray(v, depth + 1);
    if (r) return r;
  }
  return null;
}

const TITLE_KEYS = ["title", "titulo", "headline", "name", "nome", "text", "texto", "descricao", "description"];
const IMAGE_KEYS = ["image", "imagem", "urlToImage", "thumbnail", "image_url", "img"];
const DATE_KEYS = ["pubDate", "publishedAt", "date", "data", "dataApuracao", "published", "updated"];
const LINK_KEYS = ["link", "url"];

function firstKey(item: any, keys: string[]): string {
  for (const k of keys) {
    const t = toText(item?.[k]);
    if (t) return t;
  }
  return "";
}

function autoTitle(item: any): string {
  if (item == null || typeof item !== "object") return toText(item);
  const t = firstKey(item, TITLE_KEYS);
  if (t) return t;
  // Sem campo de título: monta "campo: valor" com os primeiros valores simples.
  return Object.entries(item)
    .filter(([, v]) => v != null && (typeof v !== "object" || Array.isArray(v)))
    .map(([k, v]) => [k, toText(v)] as const)
    .filter(([, v]) => v && v.length <= 120)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
}

function jsonItems(data: any, body: any, max: number) {
  const itemsPath = String(body?.json_items_path ?? "").trim().slice(0, 200);
  const template = String(body?.json_title_template ?? "").trim().slice(0, 300);
  const imageField = String(body?.json_image_field ?? "").trim().slice(0, 200);
  const dateField = String(body?.json_date_field ?? "").trim().slice(0, 200);

  let list: any[];
  const base = itemsPath ? getPath(data, itemsPath) : null;
  if (Array.isArray(base)) list = base;
  else if (base && typeof base === "object") list = [base];
  else list = findArray(data) ?? (data && typeof data === "object" ? [data] : []);

  return list.slice(0, max).map((item) => {
    const title = template
      ? template.replace(/\{([^}]+)\}/g, (_, p) => toText(getPath(item, p.trim()))).trim()
      : autoTitle(item);
    let image: string | null = imageField
      ? toText(getPath(item, imageField))
      : firstKey(item, IMAGE_KEYS);
    if (image && !/^https:\/\//i.test(image)) image = null;
    return {
      title: (title || "—").slice(0, 500),
      link: firstKey(item, LINK_KEYS),
      pubDate: dateField ? toText(getPath(item, dateField)) : firstKey(item, DATE_KEYS),
      image: image || null,
      summary: "",
    };
  });
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
  const max = Math.max(1, Math.min(30, Number(body?.max ?? body?.limit ?? 10) || 10));

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
    const buf = new Uint8Array(await res.arrayBuffer());
    const headerCs = /charset=["']?([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1];
    const prolog = new TextDecoder("windows-1252").decode(buf.slice(0, 300));
    const declCs = /encoding=["']([\w-]+)["']/i.exec(prolog)?.[1];
    let charset = (declCs || headerCs || "utf-8").toLowerCase();
    let xml: string;
    try {
      xml = new TextDecoder(charset, { fatal: charset === "utf-8" }).decode(buf);
    } catch {
      charset = "windows-1252";
      xml = new TextDecoder(charset).decode(buf);
    }
    if (xml.includes("\uFFFD")) {
      try { xml = new TextDecoder("windows-1252").decode(buf); } catch { /* keep */ }
    }

    // API JSON (ex.: resultados de loterias, APIs REST de notícias)
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    const trimmed = xml.replace(/^\uFEFF/, "").trim();
    if (ctype.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      let data: any;
      try {
        data = JSON.parse(trimmed);
      } catch {
        return json({ error: "invalid_json_feed" }, 502);
      }
      return json({
        feedTitle: "",
        fetchedAt: new Date().toISOString(),
        items: jsonItems(data, body, max),
      });
    }

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
      summary: (pick(block, "description") || pick(block, "summary") || pick(block, "content")).slice(0, 280),
    }));
    const head = xml.split(/<item|<entry/i)[0];
    const feedTitle = pick(head, "title");

    return json({ feedTitle, fetchedAt: new Date().toISOString(), items });
  } catch (e) {
    return json({ error: "fetch_error", detail: (e as Error).message }, 502);
  }
});