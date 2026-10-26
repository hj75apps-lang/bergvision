// Raspagem de páginas HTML de notícias (ex.: https://www3.seduc.mt.gov.br/noticias).
// Agrupa links por endereço e extrai título (texto do link, alt ou title da
// imagem) e foto (img dentro do link). Saída sempre em texto puro.

export interface ScrapedItem {
  title: string;
  link: string;
  pubDate: string;
  image: string | null;
  summary: string;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decode(m[2] ?? m[3] ?? "") : "";
}

function abs(u: string, base: string): string | null {
  if (!u || /^(javascript:|mailto:|tel:|data:|#)/i.test(u)) return null;
  try {
    const r = new URL(u, base);
    if (r.protocol !== "https:" && r.protocol !== "http:") return null;
    return r.toString();
  } catch {
    return null;
  }
}

function cleanTitle(t: string): string {
  return t
    .replace(/^(navegar para a notícia|ir à notícia|ir para a notícia|leia mais:?|saiba mais:?)\s*/i, "")
    .trim();
}

function isHeadline(t: string): boolean {
  return t.length >= 20 && t.length <= 300 && t.split(" ").length >= 4;
}

function imgSrc(tag: string, base: string): string | null {
  const srcset = attr(tag, "data-srcset") || attr(tag, "srcset");
  const candidates = [
    attr(tag, "data-src"),
    attr(tag, "data-lazy-src"),
    attr(tag, "data-original"),
    srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : "",
    attr(tag, "src"),
  ];
  for (const c of candidates) {
    const u = abs(c, base);
    if (!u) continue;
    if (/logo|icon|sprite|avatar|pixel|blank|spacer/i.test(u)) continue;
    // Só HTTPS para evitar mixed content no Player.
    return u.replace(/^http:\/\//i, "https://");
  }
  return null;
}

export function scrapeHtml(html: string, pageUrl: string, max: number): ScrapedItem[] {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, "");

  const page = abs(pageUrl, pageUrl) ?? pageUrl;
  const byLink = new Map<string, { order: number; title: string; image: string | null }>();
  let order = 0;

  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const open = `<a ${m[1]}>`;
    const href = abs(attr(open, "href"), page);
    if (!href) continue;
    const noHash = href.split("#")[0];
    if (noHash === page.split("#")[0]) continue;
    const inner = m[2];

    const textTitle = cleanTitle(decode(inner));
    const imgTag = inner.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const altTitle = imgTag ? cleanTitle(attr(imgTag, "alt")) : "";
    const attrTitle = cleanTitle(attr(open, "title"));
    const title = [textTitle, altTitle, attrTitle].find(isHeadline) ?? "";
    const image = imgTag ? imgSrc(imgTag, page) : null;

    const cur = byLink.get(noHash);
    if (!cur) {
      if (!title && !image) continue;
      byLink.set(noHash, { order: order++, title, image });
    } else {
      if (!cur.title && title) cur.title = title;
      if (!cur.image && image) cur.image = image;
    }
  }

  let list = [...byLink.entries()]
    .filter(([, v]) => v.title)
    .sort((a, b) => a[1].order - b[1].order);
  const withImg = list.filter(([, v]) => v.image);
  if (withImg.length >= 3) list = withImg;

  const seen = new Set<string>();
  const out: ScrapedItem[] = [];
  for (const [link, v] of list) {
    const key = v.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: v.title.slice(0, 500), link, pubDate: "", image: v.image, summary: "" });
    if (out.length >= max) break;
  }
  return out;
}
