import { create } from "zustand";
import {
  clipFromAsset, defaultTracks, duplicateClips, makeTrack, MAX_ZOOM, MIN_ZOOM, pasteClips, sequenceEnd,
  type Clip, type Track, type TrackKind,
} from "./timeline";
import type { EditorAsset } from "./media";

/** Estado do editor de vídeo (Fase 2: somente nesta sessão; salvar vem na Fase 4). */
type State = {
  tracks: Track[];
  clips: Clip[];
  selected: string[];
  clipboard: Clip[];
  zoom: number;
  playhead: number;
  playing: boolean;
  addTrack: (kind: TrackKind) => void;
  updateTrack: (id: string, patch: Partial<Omit<Track, "id" | "kind">>) => void;
  removeTrack: (id: string) => void;
  moveTrack: (id: string, dir: -1 | 1) => void;
  addClip: (asset: EditorAsset, trackId: string, start: number) => void;
  setClips: (clips: Clip[]) => void;
  select: (id: string | null, additive?: boolean) => void;
  selectMany: (ids: string[]) => void;
  deleteSelected: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  setZoom: (z: number) => void;
  setPlayhead: (ms: number) => void;
  setPlaying: (p: boolean) => void;
};

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const useVideoTimeline = create<State>((set, get) => ({
  tracks: defaultTracks(),
  clips: [],
  selected: [],
  clipboard: [],
  zoom: 50,
  playhead: 0,
  playing: false,
  addTrack: (kind) => set((s) => {
    const t = makeTrack(kind, s.tracks);
    // insere logo após a última trilha do mesmo tipo
    const last = s.tracks.map((x) => x.kind).lastIndexOf(kind);
    const tracks = [...s.tracks];
    tracks.splice(last < 0 ? tracks.length : last + 1, 0, t);
    return { tracks };
  }),
  updateTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  removeTrack: (id) => set((s) => ({
    tracks: s.tracks.filter((t) => t.id !== id),
    clips: s.clips.filter((c) => c.trackId !== id),
    selected: s.selected.filter((cid) => s.clips.find((c) => c.id === cid)?.trackId !== id),
  })),
  moveTrack: (id, dir) => set((s) => {
    const i = s.tracks.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.tracks.length) return {};
    const tracks = [...s.tracks];
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    return { tracks };
  }),
  addClip: (asset, trackId, start) => {
    const c = clipFromAsset(asset, trackId, start);
    set((s) => ({ clips: [...s.clips, c], selected: [c.id] }));
  },
  setClips: (clips) => set({ clips }),
  select: (id, additive) => set((s) => {
    if (!id) return { selected: [] };
    if (!additive) return { selected: [id] };
    return { selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] };
  }),
  selectMany: (ids) => set({ selected: ids }),
  deleteSelected: () => set((s) => {
    const locked = new Set(s.tracks.filter((t) => t.locked).map((t) => t.id));
    return { clips: s.clips.filter((c) => !s.selected.includes(c.id) || locked.has(c.trackId)), selected: [] };
  }),
  copy: () => set((s) => ({ clipboard: s.clips.filter((c) => s.selected.includes(c.id)) })),
  paste: () => {
    const s = get();
    const valid = new Set(s.tracks.filter((t) => !t.locked).map((t) => t.id));
    const pasted = pasteClips(s.clipboard.filter((c) => valid.has(c.trackId)), s.playhead);
    if (pasted.length) set({ clips: [...s.clips, ...pasted], selected: pasted.map((c) => c.id) });
  },
  duplicate: () => {
    const s = get();
    const locked = new Set(s.tracks.filter((t) => t.locked).map((t) => t.id));
    const dup = duplicateClips(s.clips.filter((c) => s.selected.includes(c.id) && !locked.has(c.trackId)));
    if (dup.length) set({ clips: [...s.clips, ...dup], selected: dup.map((c) => c.id) });
  },
  setZoom: (z) => set({ zoom: clampZoom(z) }),
  setPlayhead: (ms) => set({ playhead: Math.max(0, ms) }),
  setPlaying: (p) => set((s) => ({ playing: p, playhead: p && s.playhead >= sequenceEnd(s.clips) ? 0 : s.playhead })),
}));
