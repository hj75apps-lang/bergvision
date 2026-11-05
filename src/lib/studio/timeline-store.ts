import { create } from "zustand";

/**
 * Estado da linha do tempo do Studio (somente editor, não persistido).
 * ElementBody lê `playing`, `anchor` e `epoch` — nunca `time` — para
 * não re-renderizar a cada quadro.
 */
type TimelineState = {
  /** Tempo atual do indicador (s). */
  time: number;
  playing: boolean;
  /** Tempo (s) a partir do qual a reprodução atual começou. */
  anchor: number;
  /** Incrementa para reiniciar as animações CSS. */
  epoch: number;
  /** Duração total da linha do tempo (s). */
  duration: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
  tick: (t: number) => void;
  setDuration: (d: number) => void;
};

export const TIMELINE_MIN = 1;
export const TIMELINE_MAX = 120;

export const useTimelineStore = create<TimelineState>((set, get) => ({
  time: 0,
  playing: true,
  anchor: 0,
  epoch: 0,
  duration: 10,
  play: () => {
    const { time, duration, epoch } = get();
    const start = time >= duration ? 0 : time;
    set({ playing: true, anchor: start, time: start, epoch: epoch + 1 });
  },
  pause: () => set({ playing: false }),
  stop: () => set((s) => ({ playing: false, time: 0, anchor: 0, epoch: s.epoch + 1 })),
  seek: (t) =>
    set((s) => {
      const time = Math.max(0, Math.min(s.duration, t));
      return s.playing
        ? { time, anchor: time, epoch: s.epoch + 1 }
        : { time };
    }),
  tick: (t) => set({ time: t }),
  setDuration: (d) =>
    set((s) => {
      const duration = Math.max(TIMELINE_MIN, Math.min(TIMELINE_MAX, Math.round(d * 10) / 10));
      return { duration, time: Math.min(s.time, duration) };
    }),
}));
