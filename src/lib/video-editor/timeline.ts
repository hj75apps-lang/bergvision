import type { AssetKind, EditorAsset } from "./media";

export type TrackKind = "video" | "audio" | "image" | "title" | "graphic" | "overlay";

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  visible: boolean;
  muted: boolean;
  locked: boolean;
};

/** Tempos em milissegundos. `inPoint` = ponto de entrada no arquivo original. */
export type Clip = {
  id: string;
  trackId: string;
  assetId: string;
  start: number;
  duration: number;
  inPoint: number;
  /** Duração do arquivo (null = imagem/gráfico, pode esticar livremente). */
  sourceDuration: number | null;
  /** Clipes com o mesmo grupo são selecionados e movidos juntos. */
  groupId?: string;
};

export const TRACK_LABEL: Record<TrackKind, string> = {
  video: "Vídeo", audio: "Áudio", image: "Imagens", title: "Títulos", graphic: "Gráficos", overlay: "Sobreposição",
};

export const MIN_CLIP_MS = 100;
export const DEFAULT_STILL_MS = 5000;
export const FPS = 30;
export const MIN_ZOOM = 2; // px por segundo
export const MAX_ZOOM = 600;

const COMPAT: Record<AssetKind, TrackKind[]> = {
  video: ["video", "overlay"],
  audio: ["audio"],
  image: ["image", "video", "overlay", "graphic"],
  graphic: ["graphic", "overlay", "video", "image"],
  text: ["title", "overlay"],
  other: [],
};

export function canPlace(asset: AssetKind, track: TrackKind): boolean {
  return COMPAT[asset].includes(track);
}

/** Trilhas compatíveis entre si para mover clipes já existentes. */
export function tracksCompatible(a: TrackKind, b: TrackKind): boolean {
  if (a === b) return true;
  if (a === "audio" || b === "audio") return false;
  return true;
}

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function makeTrack(kind: TrackKind, existing: Track[]): Track {
  const n = existing.filter((t) => t.kind === kind).length + 1;
  return { id: uid(), name: `${TRACK_LABEL[kind]} ${n}`, kind, visible: true, muted: false, locked: false };
}

export function defaultTracks(): Track[] {
  const out: Track[] = [];
  for (const k of ["title", "overlay", "graphic", "image", "video", "video", "audio", "audio"] as TrackKind[]) out.push(makeTrack(k, out));
  return out;
}

export function clipFromAsset(asset: EditorAsset, trackId: string, start: number): Clip {
  const src = asset.kind === "video" || asset.kind === "audio" ? asset.duration_ms ?? null : null;
  return { id: uid(), trackId, assetId: asset.id, start: Math.max(0, Math.round(start)), duration: src ?? DEFAULT_STILL_MS, inPoint: 0, sourceDuration: src };
}

export function moveClip(c: Clip, start: number, trackId = c.trackId): Clip {
  return { ...c, start: Math.max(0, Math.round(start)), trackId };
}

/** Redimensiona a borda esquerda: muda início e ponto de entrada, mantém o fim. */
export function trimStart(c: Clip, newStart: number): Clip {
  const end = c.start + c.duration;
  let s = Math.min(Math.round(newStart), end - MIN_CLIP_MS);
  s = Math.max(s, 0);
  let inPoint = c.inPoint + (s - c.start);
  if (c.sourceDuration != null && inPoint < 0) { s -= inPoint; inPoint = 0; }
  if (c.sourceDuration == null) inPoint = 0;
  return { ...c, start: s, inPoint, duration: end - s };
}

/** Redimensiona a borda direita: limitada ao fim do arquivo original. */
export function trimEnd(c: Clip, newEnd: number): Clip {
  let d = Math.max(MIN_CLIP_MS, Math.round(newEnd) - c.start);
  if (c.sourceDuration != null) d = Math.min(d, c.sourceDuration - c.inPoint);
  return { ...c, duration: d };
}

export function sequenceEnd(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

/** Zoom (px/s) para caber a sequência inteira em `widthPx`. */
export function fitZoom(clips: Clip[], widthPx: number): number {
  const end = sequenceEnd(clips);
  if (end <= 0 || widthPx <= 0) return 50;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (widthPx * 0.95) / (end / 1000)));
}

/** Cola clipes copiados a partir de `at`, preservando distâncias relativas. */
export function pasteClips(copied: Clip[], at: number): Clip[] {
  if (!copied.length) return [];
  const base = Math.min(...copied.map((c) => c.start));
  // cópias formam grupos novos, sem se juntar aos grupos originais
  const groupMap = new Map<string, string>();
  const regroup = (g?: string) => {
    if (!g) return undefined;
    if (!groupMap.has(g)) groupMap.set(g, uid());
    return groupMap.get(g);
  };
  return copied.map((c) => ({ ...c, id: uid(), groupId: regroup(c.groupId), start: Math.max(0, Math.round(at + c.start - base)) }));
}

export function duplicateClips(list: Clip[]): Clip[] {
  if (!list.length) return [];
  const end = Math.max(...list.map((c) => c.start + c.duration));
  return pasteClips(list, end);
}

/** Intervalo de marcação da régua (ms) conforme zoom, ~80px entre marcas. */
export function rulerStep(zoom: number): number {
  const steps = [1000 / FPS, 100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
  return steps.find((s) => (s / 1000) * zoom >= 80) ?? steps[steps.length - 1];
}

/** Formato mm:ss:ff (frames a 30 fps). */
export function formatTimecode(ms: number): string {
  const totalFrames = Math.round((Math.max(0, ms) / 1000) * FPS);
  const f = totalFrames % FPS;
  const s = Math.floor(totalFrames / FPS);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}
