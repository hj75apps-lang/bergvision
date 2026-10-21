import { supabase } from "@/integrations/supabase/client";

/**
 * Descobre a duração (segundos) de vídeos incorporados por link.
 * - Vimeo: oEmbed público (campo `duration`).
 * - YouTube: IFrame API oficial em um player oculto (getDuration), sem chave.
 * Demais serviços: null (o usuário define manualmente).
 */

type YTPlayer = { getDuration: () => number; destroy: () => void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: (e: { target: YTPlayer }) => void; onError?: () => void };
    },
  ) => YTPlayer;
};

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      if (w.YT) resolve(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      ytApiPromise = null;
      reject(new Error("yt_api_failed"));
    };
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (!/youtube(-nocookie)?\.com$/.test(host)) return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
    return m && m[1] !== "videoseries" ? m[1] : null;
  } catch {
    return null;
  }
}

function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/vimeo\.com$/.test(u.hostname)) return null;
    const v = u.searchParams.get("video");
    if (v && /^\d{5,}$/.test(v)) return v;
    const m = u.pathname.match(/(\d{5,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function youtubeDuration(id: string): Promise<number | null> {
  try {
    const YT = await loadYouTubeApi();
    return await new Promise<number | null>((resolve) => {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:120px;";
      const inner = document.createElement("div");
      host.appendChild(inner);
      document.body.appendChild(host);
      let player: YTPlayer | null = null;
      let done = false;
      const finish = (v: number | null) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        try {
          if (player) player.destroy();
        } catch {
          /* ignore */
        }
        host.remove();
        resolve(v);
      };
      const timer = window.setTimeout(() => finish(null), 10000);
      player = new YT.Player(inner, {
        videoId: id,
        playerVars: { autoplay: 0, mute: 1, controls: 0 },
        events: {
          onReady: (e) => {
            let tries = 0;
            const check = () => {
              const d = e.target.getDuration();
              if (d > 0) return finish(Math.round(d));
              if (++tries > 20) return finish(null);
              window.setTimeout(check, 250);
            };
            check();
          },
          onError: () => finish(null),
        },
      });
    });
  } catch {
    return null;
  }
}

async function vimeoDuration(url: string): Promise<number | null> {
  const id = vimeoId(url);
  const target = id ? `https://vimeo.com/${id}` : url;
  try {
    const res = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target)}&dnt=1`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { duration?: number };
    return typeof data.duration === "number" && data.duration > 0
      ? Math.round(data.duration)
      : null;
  } catch {
    return null;
  }
}

/** Duração de um link de vídeo em segundos, ou null se não for possível detectar. */
export async function getLinkDuration(url: string): Promise<number | null> {
  const yt = youtubeId(url);
  if (yt) return youtubeDuration(yt);
  if (/vimeo\.com/i.test(url)) return vimeoDuration(url);
  return null;
}

/** Duração de uma lista de links tocados em sequência (soma). */
async function linksDuration(urls: string[]): Promise<number | null> {
  const ds = await Promise.all(urls.map(getLinkDuration));
  const known = ds.filter((d): d is number => typeof d === "number");
  if (known.length === 0) return null;
  return known.reduce((a, b) => a + b, 0);
}

/**
 * Duração sugerida para um template: o maior tempo entre os quadros de
 * "vídeo por link" (com vários links, a soma deles). null se não houver.
 */
export async function detectTemplateDuration(templateId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("template_elements")
    .select("content")
    .eq("template_id", templateId);
  if (error || !data) return null;
  let best: number | null = null;
  for (const row of data as Array<{ content: unknown }>) {
    const c = row.content as
      | { widgetType?: string; widgetConfig?: { url?: unknown; urls?: unknown } }
      | null;
    if (!c || c.widgetType !== "iframe" || !c.widgetConfig) continue;
    const cfg = c.widgetConfig;
    const urls =
      Array.isArray(cfg.urls) && cfg.urls.length > 1
        ? (cfg.urls as unknown[]).filter((u): u is string => typeof u === "string")
        : typeof cfg.url === "string" && cfg.url
          ? [cfg.url]
          : [];
    if (urls.length === 0) continue;
    const d = await linksDuration(urls);
    if (d && (best === null || d > best)) best = d;
  }
  return best;
}
