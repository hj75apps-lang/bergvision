export type AssetKind = "video" | "audio" | "image" | "graphic" | "text" | "other";

export type EditorAsset = {
  id: string;
  folder_id: string | null;
  name: string;
  kind: AssetKind;
  mime_type: string | null;
  size_bytes: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  storage_path: string;
  thumbnail_path: string | null;
  created_at: string;
};

export type EditorFolder = { id: string; name: string };

export const KIND_LABEL: Record<AssetKind, string> = {
  video: "Vídeos",
  audio: "Áudios",
  image: "Imagens",
  graphic: "Gráficos",
  text: "Textos",
  other: "Outros",
};

const EXT_KIND: Record<string, AssetKind> = {
  mp4: "video", mov: "video", webm: "video",
  mp3: "audio", wav: "audio", aac: "audio",
  png: "image", jpg: "image", jpeg: "image",
  gif: "graphic",
};

export const ACCEPT = Object.keys(EXT_KIND).map((e) => `.${e}`).join(",");
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Classifica pelo nome; retorna null se o formato não é suportado. */
export function kindOf(name: string): AssetKind | null {
  return EXT_KIND[extOf(name)] ?? null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

export function aspectLabel(w: number | null, h: number | null): string {
  if (!w || !h) return "";
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

export function filterAssets(
  list: EditorAsset[],
  opts: { query: string; kind: AssetKind | "all"; folder: string | "all" | "none" },
): EditorAsset[] {
  const q = opts.query.trim().toLowerCase();
  return list.filter((a) =>
    (opts.kind === "all" || a.kind === opts.kind) &&
    (opts.folder === "all" || (opts.folder === "none" ? !a.folder_id : a.folder_id === opts.folder)) &&
    (!q || a.name.toLowerCase().includes(q)));
}

/** MIME usado para arrastar uma mídia até a timeline (Fase 2). */
export const ASSET_DRAG_MIME = "application/x-berg-asset";
