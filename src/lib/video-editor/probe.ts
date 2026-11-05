import type { AssetKind } from "./media";

export type Probe = { duration_ms: number | null; width: number | null; height: number | null; thumb: Blob | null };

function canvasThumb(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const scale = Math.min(1, 320 / Math.max(w, h || 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.8));
}

/** Lê duração, resolução e gera miniatura no navegador. Nunca lança erro. */
export async function probeFile(file: File, kind: AssetKind): Promise<Probe> {
  const empty: Probe = { duration_ms: null, width: null, height: null, thumb: null };
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image" || kind === "graphic") {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { duration_ms: null, width: img.naturalWidth, height: img.naturalHeight, thumb: await canvasThumb(img, img.naturalWidth, img.naturalHeight) };
    }
    if (kind === "audio") {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.src = url;
      await new Promise<void>((res, rej) => { a.onloadedmetadata = () => res(); a.onerror = () => rej(); });
      return { ...empty, duration_ms: Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : null };
    }
    if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(); });
      const base = { duration_ms: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null, width: v.videoWidth || null, height: v.videoHeight || null };
      try {
        v.currentTime = Math.min(1, (v.duration || 0) / 2);
        await new Promise<void>((res, rej) => { v.onseeked = () => res(); v.onerror = () => rej(); setTimeout(rej, 5000); });
        return { ...base, thumb: await canvasThumb(v, v.videoWidth, v.videoHeight) };
      } catch {
        return { ...base, thumb: null };
      }
    }
    return empty;
  } catch {
    return empty;
  } finally {
    URL.revokeObjectURL(url);
  }
}
