import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TemplateElement } from "@/lib/studio/types";
import { elementEnd, parseElementAnimation } from "@/lib/studio/element-animation";
import { TIMELINE_MAX, TIMELINE_MIN, useTimelineStore } from "@/lib/studio/timeline-store";

type Props = {
  elements: TemplateElement[];
  selectedIds: string[];
  disabled: boolean;
  onSelect: (id: string) => void;
  onContentChange: (id: string, content: Record<string, unknown>) => void;
};

type Drag = { elId: string; kfId: string; t: number } | null;

const fmt = (t: number) => t.toFixed(1) + "s";

export function TimelinePanel({ elements, selectedIds, disabled, onSelect, onContentChange }: Props) {
  const [open, setOpen] = useState(true);
  const { time, playing, duration, play, pause, stop, seek, tick, setDuration } = useTimelineStore();
  const anchor = useTimelineStore((s) => s.anchor);
  const epoch = useTimelineStore((s) => s.epoch);
  const [drag, setDrag] = useState<Drag>(null);
  const [durText, setDurText] = useState(String(duration));
  const rulerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDurText(String(duration)), [duration]);

  // Avança o indicador enquanto reproduz; volta ao início ao chegar no fim.
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const t = anchor + (now - started) / 1000;
      if (t >= duration) {
        useTimelineStore.setState((s) => ({ time: 0, anchor: 0, epoch: s.epoch + 1 }));
        return;
      }
      tick(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, anchor, epoch, duration, tick]);

  const timeFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    return Math.round(p * duration * 10) / 10;
  };

  const commitDuration = () => {
    const n = Number(durText.replace(",", "."));
    if (!Number.isFinite(n) || n < TIMELINE_MIN || n > TIMELINE_MAX) {
      setDurText(String(duration));
      return;
    }
    setDuration(n);
  };

  const rows = [...elements].sort((a, b) => (b.z_index ?? 0) - (a.z_index ?? 0));
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;

  const finishDrag = () => {
    if (!drag) return;
    const el = elements.find((e) => e.id === drag.elId);
    if (el) {
      const c = (el.content ?? {}) as Record<string, unknown>;
      const raw = (c.elementAnimation ?? {}) as Record<string, unknown>;
      const a = parseElementAnimation(raw);
      const clash = a.keyframes.some((k) => k.id !== drag.kfId && k.t === drag.t);
      if (!clash) {
        const keyframes = a.keyframes.map((k) => (k.id === drag.kfId ? { ...k, t: drag.t } : k));
        console.log("[Timeline:moveKeyframe]", { el: drag.elId, kf: drag.kfId, t: drag.t });
        onContentChange(el.id, { ...c, elementAnimation: { ...raw, keyframes } });
      }
    }
    setDrag(null);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur" aria-label="Linha do tempo">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">Linha do tempo</span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={playing ? "Pausar" : "Reproduzir"}
            onClick={() => (playing ? pause() : play())}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Parar" onClick={stop}>
            <Square className="h-3.5 w-3.5" />
          </Button>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {fmt(time)} / {fmt(duration)}
        </span>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          Duração total (s)
          <Input value={durText} onChange={(e) => setDurText(e.target.value)} onBlur={commitDuration}
            onKeyDown={(e) => e.key === "Enter" && commitDuration()} className="h-7 w-16 text-xs" inputMode="decimal" />
        </label>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={open ? "Recolher linha do tempo" : "Abrir linha do tempo"}
          onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {open && (
        <div className="max-h-64 overflow-auto px-3 py-2"
          onPointerMove={(e) => {
            if (!drag) return;
            const track = (e.target as HTMLElement).closest("[data-track]") as HTMLElement | null;
            if (track) setDrag({ ...drag, t: timeFromX(e.clientX, track) });
          }}
          onPointerUp={finishDrag}
          onPointerLeave={finishDrag}
        >
          <div className="grid grid-cols-[minmax(80px,140px)_1fr] gap-x-2 gap-y-1">
            <div />
            <div ref={rulerRef} data-track className="relative h-5 cursor-pointer select-none border-b border-border/60"
              onPointerDown={(e) => seek(timeFromX(e.clientX, e.currentTarget))}>
              {Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i)
                .filter((i) => duration <= 30 || i % 5 === 0)
                .map((i) => (
                  <span key={i} className="absolute top-0 -translate-x-1/2 text-[9px] text-muted-foreground" style={{ left: pct(i) }}>
                    {i}
                  </span>
                ))}
              <div className="pointer-events-none absolute -bottom-px top-0 w-px bg-primary" style={{ left: pct(time) }} />
            </div>
            {rows.length === 0 && (
              <p className="col-span-2 py-4 text-center text-xs text-muted-foreground">
                Adicione componentes para ver as trilhas.
              </p>
            )}
            {rows.map((el) => {
              const a = parseElementAnimation((el.content as Record<string, unknown> | null)?.elementAnimation);
              const start = a.delay;
              const end = elementEnd(a, duration);
              const selected = selectedIds.includes(el.id);
              const name = el.name || ((el.content as Record<string, unknown> | null)?.name as string) || el.element_type;
              return (
                <div key={el.id} className="contents">
                  <button type="button" onClick={() => onSelect(el.id)}
                    className={cn("truncate rounded-md px-1.5 py-1 text-left text-[11px] transition-all duration-200 focus-visible:ring-1 focus-visible:ring-primary",
                      selected ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent/50")}>
                    {name}
                  </button>
                  <div data-track className="relative h-7 rounded-md bg-muted/30"
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) {
                        onSelect(el.id);
                        seek(timeFromX(e.clientX, e.currentTarget));
                      }
                    }}>
                    <div className={cn("pointer-events-none absolute inset-y-1 rounded", selected ? "bg-primary/40" : "bg-primary/20")}
                      style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
                    {a.entrance !== "none" && (
                      <div className="pointer-events-none absolute inset-y-1 rounded-l bg-primary/50"
                        style={{ left: pct(start), width: pct(a.entranceDuration) }} title="Entrada" />
                    )}
                    {a.exit !== "none" && a.exitAt !== null && (
                      <div className="pointer-events-none absolute inset-y-1 rounded-r bg-destructive/40"
                        style={{ left: pct(a.exitAt), width: pct(a.exitDuration) }} title="Saída" />
                    )}
                    {a.keyframes.map((k) => {
                      const t = drag && drag.kfId === k.id && drag.elId === el.id ? drag.t : k.t;
                      return (
                        <button key={k.id} type="button" aria-label={`Keyframe em ${fmt(t)}`} disabled={disabled}
                          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-background bg-primary transition-transform duration-200 hover:scale-125 focus-visible:ring-1 focus-visible:ring-primary"
                          style={{ left: pct(t), touchAction: "none" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelect(el.id);
                            setDrag({ elId: el.id, kfId: k.id, t: k.t });
                          }} />
                      );
                    })}
                    <div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: pct(time) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
