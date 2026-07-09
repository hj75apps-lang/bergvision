import { create } from "zustand";
import type { TemplateElement } from "./types";

type Snapshot = TemplateElement[];

type HistoryState = {
  templateId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  /** Reset history when switching templates. */
  reset: (templateId: string | null) => void;
  /** Push a "before" snapshot ahead of a mutation. Clears future. */
  push: (before: Snapshot) => void;
  /** Undo returns the previous snapshot to apply; caller passes current state. */
  undo: (current: Snapshot) => Snapshot | null;
  /** Redo returns the next snapshot to apply. */
  redo: (current: Snapshot) => Snapshot | null;
};

const cloneSnap = (s: Snapshot): Snapshot => s.map((e) => ({ ...e }));
const MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  templateId: null,
  past: [],
  future: [],
  reset: (templateId) => set({ templateId, past: [], future: [] }),
  push: (before) =>
    set((s) => {
      const past = [...s.past, cloneSnap(before)];
      if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
      return { past, future: [] };
    }),
  undo: (current) => {
    const { past, future } = get();
    if (past.length === 0) return null;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [...future, cloneSnap(current)],
    });
    return cloneSnap(prev);
  },
  redo: (current) => {
    const { past, future } = get();
    if (future.length === 0) return null;
    const next = future[future.length - 1];
    set({
      past: [...past, cloneSnap(current)],
      future: future.slice(0, -1),
    });
    return cloneSnap(next);
  },
}));

/**
 * Diff two snapshots and return the operations needed to transform `current`
 * into `target`. Callers apply these against the DB and TanStack Query cache.
 */
export function diffSnapshots(
  current: Snapshot,
  target: Snapshot,
): {
  toInsert: TemplateElement[];
  toUpdate: TemplateElement[];
  toDeleteIds: string[];
} {
  const curMap = new Map(current.map((e) => [e.id, e]));
  const tgtMap = new Map(target.map((e) => [e.id, e]));
  const toInsert: TemplateElement[] = [];
  const toUpdate: TemplateElement[] = [];
  const toDeleteIds: string[] = [];

  for (const t of target) {
    const c = curMap.get(t.id);
    if (!c) {
      toInsert.push(t);
    } else if (!shallowEqualElement(c, t)) {
      toUpdate.push(t);
    }
  }
  for (const c of current) {
    if (!tgtMap.has(c.id)) toDeleteIds.push(c.id);
  }
  return { toInsert, toUpdate, toDeleteIds };
}

function shallowEqualElement(a: TemplateElement, b: TemplateElement): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.z_index === b.z_index &&
    (a.opacity ?? 1) === (b.opacity ?? 1) &&
    (a.locked ?? false) === (b.locked ?? false) &&
    (a.visible ?? true) === (b.visible ?? true) &&
    (a.name ?? "") === (b.name ?? "") &&
    JSON.stringify(a.content ?? {}) === JSON.stringify(b.content ?? {})
  );
}