import { create } from "zustand";
import {
  clipFromAsset, defaultTracks, duplicateClips, makeTrack, MAX_ZOOM, MIN_ZOOM, pasteClips, sequenceEnd, uid,
  type Clip, type Track, type TrackKind,
} from "./timeline";
import { expandGroups, rippleDelete, splitAtPlayhead, splitClip, type EditTool } from "./edit-ops";
import type { EditorAsset } from "./media";

type Snapshot = { tracks: Track[]; clips: Clip[] };
const HISTORY_LIMIT = 100;

/** Estado do editor de vídeo (somente nesta sessão; salvar vem na Fase 4). */
type State = {
  tracks: Track[];
  clips: Clip[];
  selected: string[];
  clipboard: Clip[];
  zoom: number;
  playhead: number;
  playing: boolean;
  tool: EditTool;
  /** Ripple delete fecha o espaço em todas as trilhas (mantém sincronismo). */
  rippleAllTracks: boolean;
  past: Snapshot[];
  future: Snapshot[];
  /** Salva o estado atual no histórico antes de uma mudança. */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setTool: (t: EditTool) => void;
  setRippleAllTracks: (v: boolean) => void;
  addTrack: (kind: TrackKind) => void;
  updateTrack: (id: string, patch: Partial<Omit<Track, "id" | "kind">>) => void;
  removeTrack: (id: string) => void;
  moveTrack: (id: string, dir: -1 | 1) => void;
  addClip: (asset: EditorAsset, trackId: string, start: number) => void;
  /** Troca os clipes sem registrar histórico (use checkpoint antes). */
  setClips: (clips: Clip[]) => void;
  select: (id: string | null, additive?: boolean) => void;
  selectMany: (ids: string[]) => void;
  selectAll: () => void;
  deleteSelected: () => void;
  rippleDeleteSelected: () => void;
  splitAt: (clipId: string, at: number) => void;
  splitAtPlayhead: () => number;
  group: () => void;
  ungroup: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  setZoom: (z: number) => void;
  setPlayhead: (ms: number) => void;
  setPlaying: (p: boolean) => void;
  /** Carrega uma sequência (zera seleção e histórico). */
  load: (tracks: Track[], clips: Clip[]) => void;
};

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const lockedSet = (tracks: Track[]) => new Set(tracks.filter((t) => t.locked).map((t) => t.id));

export const useVideoTimeline = create<State>((set, get) => {
  /** Aplica uma mudança registrando o estado anterior no histórico. */
  const commit = (patch: Partial<State>) => set((s) => ({
    ...patch,
    past: [...s.past, { tracks: s.tracks, clips: s.clips }].slice(-HISTORY_LIMIT),
    future: [],
  }));

  return {
    tracks: defaultTracks(),
    clips: [],
    selected: [],
    clipboard: [],
    zoom: 50,
    playhead: 0,
    playing: false,
    tool: "select",
    rippleAllTracks: false,
    past: [],
    future: [],
    checkpoint: () => set((s) => ({
      past: [...s.past, { tracks: s.tracks, clips: s.clips }].slice(-HISTORY_LIMIT),
      future: [],
    })),
    undo: () => set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      const ids = new Set(prev.clips.map((c) => c.id));
      return {
        ...prev,
        past: s.past.slice(0, -1),
        future: [{ tracks: s.tracks, clips: s.clips }, ...s.future].slice(0, HISTORY_LIMIT),
        selected: s.selected.filter((id) => ids.has(id)),
      };
    }),
    redo: () => set((s) => {
      const next = s.future[0];
      if (!next) return {};
      const ids = new Set(next.clips.map((c) => c.id));
      return {
        ...next,
        future: s.future.slice(1),
        past: [...s.past, { tracks: s.tracks, clips: s.clips }].slice(-HISTORY_LIMIT),
        selected: s.selected.filter((id) => ids.has(id)),
      };
    }),
    setTool: (tool) => set({ tool }),
    setRippleAllTracks: (rippleAllTracks) => set({ rippleAllTracks }),
    addTrack: (kind) => {
      const s = get();
      const t = makeTrack(kind, s.tracks);
      // insere logo após a última trilha do mesmo tipo
      const last = s.tracks.map((x) => x.kind).lastIndexOf(kind);
      const tracks = [...s.tracks];
      tracks.splice(last < 0 ? tracks.length : last + 1, 0, t);
      commit({ tracks });
    },
    updateTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
    removeTrack: (id) => {
      const s = get();
      commit({
        tracks: s.tracks.filter((t) => t.id !== id),
        clips: s.clips.filter((c) => c.trackId !== id),
        selected: s.selected.filter((cid) => s.clips.find((c) => c.id === cid)?.trackId !== id),
      });
    },
    moveTrack: (id, dir) => {
      const s = get();
      const i = s.tracks.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.tracks.length) return;
      const tracks = [...s.tracks];
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      commit({ tracks });
    },
    addClip: (asset, trackId, start) => {
      const c = clipFromAsset(asset, trackId, start);
      commit({ clips: [...get().clips, c], selected: [c.id] });
    },
    setClips: (clips) => set({ clips }),
    select: (id, additive) => set((s) => {
      if (!id) return { selected: [] };
      const group = expandGroups(s.clips, [id]);
      if (!additive) return { selected: group };
      const on = s.selected.includes(id);
      return { selected: on ? s.selected.filter((x) => !group.includes(x)) : [...new Set([...s.selected, ...group])] };
    }),
    selectMany: (ids) => set((s) => ({ selected: expandGroups(s.clips, ids) })),
    selectAll: () => set((s) => {
      const locked = lockedSet(s.tracks);
      return { selected: s.clips.filter((c) => !locked.has(c.trackId)).map((c) => c.id) };
    }),
    deleteSelected: () => {
      const s = get();
      const locked = lockedSet(s.tracks);
      const clips = s.clips.filter((c) => !s.selected.includes(c.id) || locked.has(c.trackId));
      if (clips.length !== s.clips.length) commit({ clips, selected: [] });
    },
    rippleDeleteSelected: () => {
      const s = get();
      const clips = rippleDelete(s.clips, s.selected, lockedSet(s.tracks), s.rippleAllTracks);
      if (clips !== s.clips) commit({ clips, selected: [] });
    },
    splitAt: (clipId, at) => {
      const s = get();
      const c = s.clips.find((x) => x.id === clipId);
      if (!c || lockedSet(s.tracks).has(c.trackId)) return;
      const r = splitClip(c, at);
      if (!r) return;
      const clips = s.clips.flatMap((x) => (x.id === clipId ? r : [x]));
      commit({ clips, selected: [r[1].id] });
    },
    splitAtPlayhead: () => {
      const s = get();
      const r = splitAtPlayhead(s.clips, s.playhead, s.selected, lockedSet(s.tracks));
      if (r.created.length) commit({ clips: r.clips });
      return r.created.length;
    },
    group: () => {
      const s = get();
      if (s.selected.length < 2) return;
      const g = uid();
      commit({ clips: s.clips.map((c) => (s.selected.includes(c.id) ? { ...c, groupId: g } : c)) });
    },
    ungroup: () => {
      const s = get();
      if (!s.clips.some((c) => s.selected.includes(c.id) && c.groupId)) return;
      commit({ clips: s.clips.map((c) => (s.selected.includes(c.id) ? { ...c, groupId: undefined } : c)) });
    },
    copy: () => set((s) => ({ clipboard: s.clips.filter((c) => s.selected.includes(c.id)) })),
    paste: () => {
      const s = get();
      const valid = new Set(s.tracks.filter((t) => !t.locked).map((t) => t.id));
      const pasted = pasteClips(s.clipboard.filter((c) => valid.has(c.trackId)), s.playhead);
      if (pasted.length) commit({ clips: [...s.clips, ...pasted], selected: pasted.map((c) => c.id) });
    },
    duplicate: () => {
      const s = get();
      const locked = lockedSet(s.tracks);
      const dup = duplicateClips(s.clips.filter((c) => s.selected.includes(c.id) && !locked.has(c.trackId)));
      if (dup.length) commit({ clips: [...s.clips, ...dup], selected: dup.map((c) => c.id) });
    },
    setZoom: (z) => set({ zoom: clampZoom(z) }),
    setPlayhead: (ms) => set({ playhead: Math.max(0, ms) }),
    setPlaying: (p) => set((s) => ({ playing: p, playhead: p && s.playhead >= sequenceEnd(s.clips) ? 0 : s.playhead })),
    load: (tracks, clips) => set({
      tracks, clips, selected: [], past: [], future: [], playhead: 0, playing: false,
    }),
  };
});
