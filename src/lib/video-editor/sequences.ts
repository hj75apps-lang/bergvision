import { defaultTracks, uid, type Clip, type Track } from "./timeline";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type FrameRate = 24 | 25 | 30 | 50 | 60;
export type SampleRate = 44100 | 48000;

export type SequenceSettings = {
  width: number;
  height: number;
  aspect: AspectRatio;
  fps: FrameRate;
  sampleRate: SampleRate;
};

export type Sequence = {
  id: string;
  name: string;
  settings: SequenceSettings;
  tracks: Track[];
  clips: Clip[];
  updatedAt: number;
};

export const RESOLUTION_PRESETS = [
  { label: "1920 × 1080 (Full HD)", width: 1920, height: 1080 },
  { label: "1280 × 720 (HD)", width: 1280, height: 720 },
  { label: "3840 × 2160 (4K)", width: 3840, height: 2160 },
] as const;
export const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3"];
export const FRAME_RATES: FrameRate[] = [24, 25, 30, 50, 60];
export const SAMPLE_RATES: SampleRate[] = [44100, 48000];
export const MIN_DIM = 16;
export const MAX_DIM = 7680;

export const DEFAULT_SETTINGS: SequenceSettings = {
  width: 1920, height: 1080, aspect: "16:9", fps: 30, sampleRate: 48000,
};

const ASPECT_VALUE: Record<AspectRatio, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:3": 4 / 3 };

export const clampDim = (n: number) => Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(n) || MIN_DIM));

/** Mantém a largura do lado maior e recalcula a altura para a proporção (dimensões pares). */
export function applyAspect(s: SequenceSettings, aspect: AspectRatio): SequenceSettings {
  const long = Math.max(s.width, s.height);
  const r = ASPECT_VALUE[aspect];
  const even = (n: number) => Math.max(MIN_DIM, Math.round(n / 2) * 2);
  const [width, height] = r >= 1 ? [long, even(long / r)] : [even(long * r), long];
  return { ...s, aspect, width: clampDim(width), height: clampDim(height) };
}

/** Proporção mais próxima de uma resolução personalizada. */
export function nearestAspect(width: number, height: number): AspectRatio {
  const r = width / height;
  return ASPECTS.reduce((best, a) =>
    Math.abs(ASPECT_VALUE[a] - r) < Math.abs(ASPECT_VALUE[best] - r) ? a : best, ASPECTS[0]);
}

export function makeSequence(name: string, settings: SequenceSettings = DEFAULT_SETTINGS): Sequence {
  return { id: uid(), name, settings: { ...settings }, tracks: defaultTracks(), clips: [], updatedAt: Date.now() };
}

/** Cópia independente: novos ids de trilhas, clipes e grupos. */
export function duplicateSequence(seq: Sequence, name: string): Sequence {
  const trackMap = new Map(seq.tracks.map((t) => [t.id, uid()]));
  const groupMap = new Map<string, string>();
  const clips = seq.clips.map((c) => ({
    ...c,
    id: uid(),
    trackId: trackMap.get(c.trackId) ?? c.trackId,
    groupId: c.groupId ? (groupMap.get(c.groupId) ?? groupMap.set(c.groupId, uid()).get(c.groupId)) : undefined,
  }));
  return {
    id: uid(), name, settings: { ...seq.settings },
    tracks: seq.tracks.map((t) => ({ ...t, id: trackMap.get(t.id) as string })),
    clips, updatedAt: Date.now(),
  };
}

/** Nome único: "Sequência 2", "Cópia de X (2)"... */
export function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}
