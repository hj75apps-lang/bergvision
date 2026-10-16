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
    if (showcase && !/\/video\/\d+/.test(u.pathname)) {
      return `https://vimeo.com/showcase/${showcase[1]}/embed`;
    }
    const fromVideo = u.pathname.match(/\/video\/(\d{5,})/);
    if (fromVideo) {
      const h = u.searchParams.get("h");
      return `https://player.vimeo.com/video/${fromVideo[1]}?autoplay=1&muted=1&loop=1&background=1${h ? `&h=${h}` : ""}`;
    }
    const m = u.pathname.match(/(\d{5,})(?:\/([\w]+))?/);
    if (!m) return null;
    const h = u.searchParams.get("h") ?? m[2];
    return `https://player.vimeo.com/video/${m[1]}?autoplay=1&muted=1&loop=1&background=1${h ? `&h=${h}` : ""}`;
  }

  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/);
    const id = m?.[1] ?? u.searchParams.get("id");
    if (!id) return null;
    return `https://drive.google.com/file/d/${id}/preview`;
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
