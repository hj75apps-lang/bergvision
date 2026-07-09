export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_MIME = ["video/mp4", "video/webm"] as const;
export const IMAGE_MAX = 10 * 1024 * 1024; // 10 MB
export const VIDEO_MAX = 500 * 1024 * 1024; // 500 MB

export type MediaKind = "image" | "video";

export function detectKind(file: File): MediaKind | null {
  const t = file.type.toLowerCase();
  if ((IMAGE_MIME as readonly string[]).includes(t)) return "image";
  if ((VIDEO_MIME as readonly string[]).includes(t)) return "video";
  return null;
}

export function validateFile(file: File): { kind: MediaKind } | { error: string } {
  const kind = detectKind(file);
  if (!kind) {
    return {
      error:
        "Formato não suportado. Use imagens JPG, PNG ou WEBP; vídeos MP4 ou WEBM.",
    };
  }
  if (kind === "image" && file.size > IMAGE_MAX) {
    return { error: "Imagem excede o limite de 10 MB." };
  }
  if (kind === "video" && file.size > VIDEO_MAX) {
    return { error: "Vídeo excede o limite de 500 MB." };
  }
  return { kind };
}

export function slugifyFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const cleanBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "arquivo";
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  return cleanBase + cleanExt;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export async function extractImageMeta(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractVideoMeta(file: File): Promise<{
  width: number;
  height: number;
  duration: number;
  thumbnail: Blob | null;
}> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;

    // Seek para 0.1s para capturar o primeiro frame renderizado
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = Math.min(0.1, Math.max(0, duration - 0.05));
      } catch {
        resolve();
      }
      setTimeout(() => resolve(), 1500);
    });

    let thumbnail: Blob | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx && width && height) {
        ctx.drawImage(video, 0, 0, width, height);
        thumbnail = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8),
        );
      }
    } catch {
      thumbnail = null;
    }

    return { width, height, duration, thumbnail };
  } finally {
    URL.revokeObjectURL(url);
  }
}