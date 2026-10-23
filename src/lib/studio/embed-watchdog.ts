/**
 * Vigia de vídeos incorporados (YouTube / Vimeo).
 * Escuta os avisos oficiais do player via postMessage e:
 *  - se o vídeo parar de avançar (travado, pausado, carregando sem fim), primeiro
 *    pede "play"; se continuar parado, recarrega o quadro;
 *  - avisa quando o vídeo terminou (para trocar de link na hora certa).
 * Só age depois de receber ao menos um aviso do player — players que não
 * conversam (bloqueados, outros sites) nunca entram em ciclo de recarga.
 * Sem optional chaining (compatibilidade Android 7).
 */
import { useEffect, useRef, type RefObject } from "react";

export type EmbedProvider = "youtube" | "vimeo" | null;

export function embedProvider(url: string): EmbedProvider {
  if (/^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//i.test(url)) return "youtube";
  if (/^https:\/\/player\.vimeo\.com\/video\//i.test(url)) return "vimeo";
  return null;
}

/** Ajusta a URL para o player aceitar comandos e, se pedido, não repetir sozinho. */
export function prepareEmbedUrl(url: string, provider: EmbedProvider, loop: boolean): string {
  if (!provider) return url;
  let out = url;
  if (!loop) out = out.replace(/([?&])loop=1/, "$1loop=0");
  if (provider === "youtube" && !/[?&]enablejsapi=1/.test(out)) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    out += (out.includes("?") ? "&" : "?") + "enablejsapi=1" + (origin ? "&origin=" + encodeURIComponent(origin) : "");
  }
  if (provider === "vimeo" && !/[?&]api=1/.test(out)) out += (out.includes("?") ? "&" : "?") + "api=1";
  return out;
}

const CHECK_MS = 3_000;
const STALL_MS = 15_000;
const GRACE_MS = 25_000;

function parse(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === "object") return data as Record<string, unknown>;
  if (typeof data !== "string" || data.charAt(0) !== "{") return null;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function useEmbedWatchdog(opts: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  provider: EmbedProvider;
  src: string;
  onEnded?: () => void;
  onReload: () => void;
}) {
  const { iframeRef, provider, src } = opts;
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    if (!provider) return;
    let talking = false;
    let lastTime = -1;
    let lastProgress = Date.now();
    let graceUntil = Date.now() + GRACE_MS;
    let nudged = false;
    let ended = false;

    const post = (msg: unknown) => {
      const el = iframeRef.current;
      if (!el || !el.contentWindow) return;
      el.contentWindow.postMessage(provider === "youtube" ? JSON.stringify(msg) : msg, "*");
    };
    const subscribeVimeo = () => {
      ["timeupdate", "ended", "pause", "play"].forEach((v) => post({ method: "addEventListener", value: v }));
    };
    const progress = (t: number) => {
      talking = true;
      if (t !== lastTime) {
        lastTime = t;
        lastProgress = Date.now();
        nudged = false;
        ended = false;
      }
    };
    const finish = () => {
      if (ended) return;
      ended = true;
      lastProgress = Date.now();
      if (cb.current.onEnded) cb.current.onEnded();
    };

    const onMessage = (e: MessageEvent) => {
      const el = iframeRef.current;
      if (!el || e.source !== el.contentWindow) return;
      const d = parse(e.data);
      if (!d) return;
      if (provider === "youtube") {
        const info = d.info as Record<string, unknown> | number | undefined;
        if (d.event === "onStateChange" && info === 0) return finish();
        if (info && typeof info === "object") {
          if (typeof info.currentTime === "number") progress(info.currentTime);
          if (info.playerState === 0) finish();
          else if (typeof info.playerState === "number") talking = true;
        }
      } else {
        if (d.event === "ready") {
          talking = true;
          subscribeVimeo();
        } else if (d.event === "timeupdate") {
          const data = d.data as Record<string, unknown> | undefined;
          if (data && typeof data.seconds === "number") progress(data.seconds);
        } else if (d.event === "ended") finish();
      }
    };
    window.addEventListener("message", onMessage);

    // YouTube só começa a mandar avisos depois do "listening".
    const handshake = () => {
      if (provider === "youtube") post({ event: "listening", id: 1, channel: "widget" });
      else subscribeVimeo();
    };
    const el = iframeRef.current;
    if (el) el.addEventListener("load", handshake);
    const hs = window.setInterval(() => {
      if (!talking) handshake();
    }, 1_000);

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!talking || ended || now < graceUntil) return;
      if (typeof document !== "undefined" && document.hidden) {
        lastProgress = now;
        return;
      }
      if (now - lastProgress < STALL_MS) return;
      if (!nudged) {
        nudged = true;
        lastProgress = now;
        if (provider === "youtube") post({ event: "command", func: "playVideo", args: [] });
        else post({ method: "play" });
        return;
      }
      graceUntil = now + GRACE_MS;
      talking = false;
      cb.current.onReload();
    }, CHECK_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      if (el) el.removeEventListener("load", handshake);
      window.clearInterval(hs);
      window.clearInterval(timer);
    };
  }, [provider, src, iframeRef]);
}
