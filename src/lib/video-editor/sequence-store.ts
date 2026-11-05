import { create } from "zustand";
import { duplicateSequence, makeSequence, uniqueName, type Sequence, type SequenceSettings } from "./sequences";
import type { Clip, Track } from "./timeline";

/**
 * Sequências do editor de vídeo. Salvas automaticamente neste navegador,
 * separadas por organização (a gravação no servidor entra na Fase 7).
 */
type State = {
  orgKey: string | null;
  sequences: Sequence[];
  activeId: string | null;
  hydrate: (orgId: string) => void;
  create: (settings?: SequenceSettings) => Sequence;
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => Sequence | null;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  updateSettings: (id: string, settings: SequenceSettings) => void;
  saveContent: (id: string, tracks: Track[], clips: Clip[]) => void;
};

const KEY = (org: string) => `bv:video-sequences:${org}`;

function persist(s: Pick<State, "orgKey" | "sequences" | "activeId">) {
  if (!s.orgKey || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY(s.orgKey), JSON.stringify({ sequences: s.sequences, activeId: s.activeId }));
  } catch { /* cota cheia: mantém em memória */ }
}

export const useSequences = create<State>((set, get) => {
  const apply = (patch: Partial<State>) => { set(patch); persist(get()); };
  return {
    orgKey: null,
    sequences: [],
    activeId: null,
    hydrate: (orgId) => {
      if (get().orgKey === orgId) return;
      let sequences: Sequence[] = [];
      let activeId: string | null = null;
      try {
        const raw = localStorage.getItem(KEY(orgId));
        if (raw) {
          const p = JSON.parse(raw) as { sequences?: Sequence[]; activeId?: string };
          sequences = Array.isArray(p.sequences) ? p.sequences : [];
          activeId = p.activeId ?? null;
        }
      } catch { /* dados inválidos: começa vazio */ }
      if (!sequences.length) sequences = [makeSequence("Sequência 1")];
      if (!sequences.some((s) => s.id === activeId)) activeId = sequences[0].id;
      set({ orgKey: orgId, sequences, activeId });
      persist(get());
    },
    create: (settings) => {
      const names = get().sequences.map((s) => s.name);
      const seq = makeSequence(uniqueName(`Sequência ${names.length + 1}`, names), settings);
      apply({ sequences: [...get().sequences, seq], activeId: seq.id });
      return seq;
    },
    rename: (id, name) => {
      const n = name.trim();
      if (!n) return;
      apply({ sequences: get().sequences.map((s) => (s.id === id ? { ...s, name: n, updatedAt: Date.now() } : s)) });
    },
    duplicate: (id) => {
      const src = get().sequences.find((s) => s.id === id);
      if (!src) return null;
      const copy = duplicateSequence(src, uniqueName(`Cópia de ${src.name}`, get().sequences.map((s) => s.name)));
      apply({ sequences: [...get().sequences, copy], activeId: copy.id });
      return copy;
    },
    remove: (id) => {
      let sequences = get().sequences.filter((s) => s.id !== id);
      if (!sequences.length) sequences = [makeSequence("Sequência 1")];
      const activeId = sequences.some((s) => s.id === get().activeId) ? get().activeId : sequences[0].id;
      apply({ sequences, activeId });
    },
    setActive: (activeId) => apply({ activeId }),
    updateSettings: (id, settings) =>
      apply({ sequences: get().sequences.map((s) => (s.id === id ? { ...s, settings, updatedAt: Date.now() } : s)) }),
    saveContent: (id, tracks, clips) =>
      apply({ sequences: get().sequences.map((s) => (s.id === id ? { ...s, tracks, clips, updatedAt: Date.now() } : s)) }),
  };
});
