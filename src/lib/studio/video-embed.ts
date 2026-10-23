/**
 * Converte links públicos de vídeo (YouTube, Vimeo, Google Drive, Dailymotion,
 * Loom, Streamable, Facebook) em URLs de incorporação próprias para iframe,
 * já com autoplay/mute/loop para telas de mídia indoor.
 * Retorna null quando o link não é de um serviço de vídeo conhecido.
 */
export function toVideoEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
      id = m?.[1] ?? null;
    }
    const list = u.searchParams.get("list");
    if (!id && list) {
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1&mute=1&loop=1&controls=0&playsinline=1`;
    }
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&rel=0&modestbranding=1&playsinline=1`;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const showcase = u.pathname.match(/^\/showcase\/(\d+)/);
    const videoParam = u.searchParams.get("video");
    if (showcase && videoParam && /^\d{5,}$/.test(videoParam)) {
      return `https://player.vimeo.com/video/${videoParam}?autoplay=1&muted=1&loop=1&autopause=0&playsinline=1&title=0&byline=0&portrait=0&dnt=1`;
    }
    if (showcase && !/\/video\/\d+/.test(u.pathname)) {
      return `https://vimeo.com/showcase/${showcase[1]}/embed`;
    }
    const fromVideo = u.pathname.match(/\/video\/(\d{5,})/);
    if (fromVideo) {
      const h = u.searchParams.get("h");
      return `https://player.vimeo.com/video/${fromVideo[1]}?autoplay=1&muted=1&loop=1&autopause=0&playsinline=1&title=0&byline=0&portrait=0&dnt=1${h ? `&h=${h}` : ""}`;
    }
    // ID numérico precisa ser um segmento inteiro do caminho (evita pegar
    // números de "user12345678"). Links "bonitos" sem ID vão para o oEmbed.
    const m = u.pathname.match(/(?:^|\/)(\d{5,})(?:\/([0-9a-f]{6,}))?\/?$/i);
    if (!m) return null;
    const h = u.searchParams.get("h") ?? m[2];
    return `https://player.vimeo.com/video/${m[1]}?autoplay=1&muted=1&loop=1&autopause=0&playsinline=1&title=0&byline=0&portrait=0&dnt=1${h ? `&h=${h}` : ""}`;
  }

  if (host === "drive.google.com" || host === "docs.google.com") {
    // Aceita /file/d/ID/view, /file/u/0/d/ID, open?id=ID e uc?id=ID.
    // Sempre usa o player oficial (/preview): respeita as permissões do arquivo
    // e faz streaming progressivo, sem baixar o vídeo inteiro.
    const m = u.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
    const id = m ? m[1] : u.searchParams.get("id");
    if (!id || !/^[\w-]{10,}$/.test(id)) return null;
    const rk = u.searchParams.get("resourcekey");
    return `https://drive.google.com/file/d/${id}/preview${rk ? `?resourcekey=${encodeURIComponent(rk)}` : ""}`;
  }

  if (host === "dailymotion.com" || host === "dai.ly") {
    const id = host === "dai.ly" ? u.pathname.slice(1) : u.pathname.match(/\/video\/([\w]+)/)?.[1];
    if (!id) return null;
    return `https://www.dailymotion.com/embed/video/${id}?autoplay=1&mute=1&loop=1&controls=0`;
  }

  if (host === "loom.com") {
    const id = u.pathname.match(/\/(?:share|embed)\/([\w]+)/)?.[1];
    if (!id) return null;
    return `https://www.loom.com/embed/${id}?autoplay=1&hide_owner=true&hideEmbedTopBar=true`;
  }

  if (host === "streamable.com") {
    const id = u.pathname.replace(/^\/(?:e\/)?/, "").split("/")[0];
    if (!id) return null;
    return `https://streamable.com/e/${id}?autoplay=1&muted=1&loop=1`;
  }

  if (host === "facebook.com" || host === "fb.watch") {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&autoplay=true&mute=true`;
  }

  return null;
}

/** Hosts de players de vídeo que exigem same-origin + referrer para funcionar. */
export function isVideoEmbedHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return /(youtube(-nocookie)?\.com|vimeo\.com|drive\.google\.com|dailymotion\.com|loom\.com|streamable\.com|facebook\.com)$/.test(
      h,
    );
  } catch {
    return false;
  }
}

/** Link de página do Vimeo que precisa ser resolvido pelo oEmbed oficial. */
export function needsVimeoOEmbed(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    return host === "vimeo.com" && toVideoEmbedUrl(url) === null;
  } catch {
    return false;
  }
}

/**
 * Resolve qualquer link público do Vimeo (inclusive URLs personalizadas sem ID)
 * pela API pública oEmbed do Vimeo, que permite chamadas do navegador.
 */
export async function resolveVimeoEmbed(url: string): Promise<string | null> {
  const trimmed = url.trim();
  // Fallback: qualquer ID numérico longo no caminho (links de canal, grupo,
  // review, álbum com vídeo...) — usado quando o oEmbed não responde.
  const fallback = (): string | null => {
    try {
      const u = new URL(trimmed);
      const ids = u.pathname.match(/\d{6,}/g);
      const id = ids ? ids[ids.length - 1] : null;
      return id ? toVideoEmbedUrl(`https://vimeo.com/${id}`) : null;
    } catch {
      return null;
    }
  };
  try {
    const res = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(trimmed)}&dnt=1`,
    );
    if (!res.ok) return fallback();
    const data = (await res.json()) as {
      html?: string;
      video_id?: number;
      domain_status_code?: number;
    };
    // 403 = dono restringiu a incorporação a domínios específicos: o player
    // do Vimeo mostraria "não pode ser reproduzido aqui".
    if (data.domain_status_code === 403) return null;
    const src = data.html?.match(/src="([^"]+)"/)?.[1];
    if (src) {
      const embed = toVideoEmbedUrl(src.replace(/&amp;/g, "&"));
      if (embed) return embed;
    }
    if (data.video_id) return toVideoEmbedUrl(`https://vimeo.com/${data.video_id}`);
    return fallback();
  } catch {
    return fallback();
  }
}
