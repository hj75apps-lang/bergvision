import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight, Columns2, Copy, Group, Maximize2, MousePointer2, MoveHorizontal, Pause, Play, Plus, Redo2, Scissors,
  SkipBack, SplitSquareHorizontal, Trash2, Undo2, Ungroup, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEditorAssets } from "@/lib/video-editor/use-editor-media";
import { ASSET_DRAG_MIME } from "@/lib/video-editor/media";
import { useVideoTimeline } from "@/lib/video-editor/timeline-store";
import {
  canPlace, fitZoom, formatTimecode, moveClip, rulerStep, sequenceEnd, TRACK_LABEL, tracksCompatible, trimEnd, trimStart,
  type Clip, type TrackKind,
} from "@/lib/video-editor/timeline";
import {
  neighbors, rollEdit, slideEdit, slipEdit, snapToFrame, TOOL_KEY, TOOL_LABEL, type EditTool,
} from "@/lib/video-editor/edit-ops";
import { TimelineClip, type ClipPointerMode } from "./timeline-clip";
import { TimelineTrackHeader } from "./timeline-track";

const HEADER_W = 176;
const ROW_H = 56;
const RULER_H = 28;

type DragMode = "move" | "trim-start" | "trim-end" | "roll" | "slip" | "slide";

type Drag = {
  mode: DragMode;
  x0: number;
  primary: Clip;
  originals: Clip[];
  /** Roll: clipes à esquerda e à direita do ponto de corte. */
  roll?: { left: Clip; right: Clip };
  /** Slide: estado de todos os clipes no início do arraste. */
  slideBase?: Clip[];
  moved: boolean;
};

const TOOL_ICON: Record<EditTool, typeof MousePointer2> = {
  select: MousePointer2,
  razor: Scissors,
  roll: Columns2,
  slip: ArrowLeftRight,
  slide: MoveHorizontal,
};

const TOOL_HINT: Record<EditTool, string> = {
  select: "Selecionar, mover e aparar clipes pelas bordas",
  razor: "Clique num clipe para dividi-lo naquele ponto",
  roll: "Arraste a junção entre dois clipes colados",
  slip: "Arraste para trocar o trecho mostrado, sem mover o clipe",
  slide: "Arraste o clipe entre os vizinhos, ajustando-os",
};

export function VideoTimeline() {
  const s = useVideoTimeline();
  const { data: assets = [] } = useEditorAssets();
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [height, setHeight] = useState(320);

  const end = sequenceEnd(s.clips);
  const contentMs = Math.max(end + 10000, 60000);
  const contentW = (contentMs / 1000) * s.zoom;
  const xToMs = (x: number) => (x / s.zoom) * 1000;

  const lockedTracks = useMemo(() => new Set(s.tracks.filter((t) => t.locked).map((t) => t.id)), [s.tracks]);
  const trackKind = useCallback((id: string) => s.tracks.find((t) => t.id === id)?.kind, [s.tracks]);

  /* ---------- reprodução (move o cursor) ---------- */
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = useVideoTimeline.getState();
      const next = st.playhead + (now - last);
      last = now;
      const stop = sequenceEnd(st.clips);
      if (next >= stop) { st.setPlayhead(stop); st.setPlaying(false); return; }
      st.setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  /* ---------- arrastar / aparar clipes ---------- */
  const onClipPointerDown = useCallback((e: React.PointerEvent, clip: Clip, part: ClipPointerMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useVideoTimeline.getState();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (st.tool === "select" && additive) { st.select(clip.id, true); return; }
    if (lockedTracks.has(clip.trackId)) { st.select(clip.id); return; }

    if (st.tool === "razor") {
      const rect = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-track-id]")?.getBoundingClientRect();
      if (!rect) return;
      st.splitAt(clip.id, snapToFrame(((e.clientX - rect.left) / st.zoom) * 1000));
      return;
    }

    st.select(clip.id);
    let mode: DragMode = part;
    let roll: Drag["roll"];
    if (st.tool === "slip") mode = "slip";
    else if (st.tool === "slide") mode = "slide";
    else if (st.tool === "roll") {
      // no corpo do clipe, usa a borda mais próxima
      let side = part;
      if (side === "move") {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        side = e.clientX - r.left < r.width / 2 ? "trim-start" : "trim-end";
      }
      const nb = neighbors(st.clips, clip);
      if (side === "trim-start" && nb.prev && !lockedTracks.has(nb.prev.trackId)) roll = { left: nb.prev, right: clip };
      else if (side === "trim-end" && nb.next) roll = { left: clip, right: nb.next };
      if (roll) mode = "roll";
      else { toast.info("Roll precisa de dois clipes colados na mesma trilha."); return; }
    } else if (part === "move") {
      if (!st.selected.includes(clip.id)) st.select(clip.id);
    }
    const sel = useVideoTimeline.getState().selected;
    const ids = mode === "move" ? (sel.includes(clip.id) ? sel : [clip.id]) : [clip.id];
    dragRef.current = {
      mode, x0: e.clientX, primary: clip, moved: false, roll,
      originals: st.clips.filter((c) => ids.includes(c.id) && !lockedTracks.has(c.trackId)),
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [lockedTracks]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x0;
      if (!d.moved && Math.abs(dx) < 3 && d.mode === "move" && Math.abs(e.movementY) < 3) return;
      const st = useVideoTimeline.getState();
      if (!d.moved) st.checkpoint();
      d.moved = true;
      const dms = (dx / st.zoom) * 1000;
      if (d.mode === "roll" && d.roll) {
        const [l, r] = rollEdit(d.roll.left, d.roll.right, dms);
        st.setClips(st.clips.map((c) => (c.id === l.id ? l : c.id === r.id ? r : c)));
        return;
      }
      if (d.mode === "slip") {
        // arrastar para a direita mostra conteúdo anterior (o conteúdo "anda" junto)
        const n = slipEdit(d.primary, -dms);
        st.setClips(st.clips.map((c) => (c.id === n.id ? n : c)));
        return;
      }
      if (d.mode === "slide") {
        const base = st.clips.map((c) => {
          const o = d.originals.find((x) => x.id === c.id);
          return o ?? c;
        });
        // vizinhos calculados a partir do estado original do arraste
        const origin = d.slideBase ?? base;
        d.slideBase = origin;
        const r = slideEdit(origin, d.primary, dms);
        const patch = new Map<string, Clip>([[r.clip.id, r.clip]]);
        if (r.prev) patch.set(r.prev.id, r.prev);
        if (r.next) patch.set(r.next.id, r.next);
        st.setClips(origin.map((c) => patch.get(c.id) ?? c));
        return;
      }
      let targetTrack = d.primary.trackId;
      if (d.mode === "move" && d.originals.length === 1) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-track-id]");
        const tid = el?.dataset.trackId;
        const tk = tid ? st.tracks.find((t) => t.id === tid) : undefined;
        const from = st.tracks.find((t) => t.id === d.primary.trackId);
        if (tk && from && !tk.locked && tracksCompatible(from.kind, tk.kind)) targetTrack = tk.id;
      }
      const byId = new Map(d.originals.map((c) => [c.id, c]));
      const minStart = Math.min(...d.originals.map((c) => c.start));
      const shift = Math.max(dms, -minStart);
      st.setClips(st.clips.map((c) => {
        const o = byId.get(c.id);
        if (!o) return c;
        if (d.mode === "trim-start") return trimStart(o, o.start + dms);
        if (d.mode === "trim-end") return trimEnd(o, o.start + o.duration + dms);
        return moveClip(o, o.start + shift, d.originals.length === 1 ? targetTrack : o.trackId);
      }));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /* ---------- soltar mídia da biblioteca ---------- */
  const dropOnTrack = (e: React.DragEvent, trackId: string, kind: TrackKind) => {
    const id = e.dataTransfer.getData(ASSET_DRAG_MIME);
    if (!id) return;
    e.preventDefault();
    const asset = assetMap.get(id);
    if (!asset) return;
    if (lockedTracks.has(trackId)) { toast.error("Esta trilha está bloqueada."); return; }
    if (!canPlace(asset.kind, kind)) { toast.error(`Esse arquivo não pode ir para uma trilha de ${TRACK_LABEL[kind].toLowerCase()}.`); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    s.addClip(asset, trackId, xToMs(e.clientX - rect.left));
  };

  /* ---------- régua ---------- */
  const step = rulerStep(s.zoom);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= contentMs && out.length < 2000; t += step) out.push(t);
    return out;
  }, [contentMs, step]);
  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    s.setPlayhead(xToMs(e.clientX - rect.left));
  };

  /* ---------- atalhos ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role=dialog]"))) return;
      const st = useVideoTimeline.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Delete" || e.key === "Backspace") { if (st.selected.length) { e.preventDefault(); st.deleteSelected(); } }
      else if (mod && e.key.toLowerCase() === "c") { if (st.selected.length) { e.preventDefault(); st.copy(); } }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); st.paste(); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); st.duplicate(); }
      else if (e.key === " ") { e.preventDefault(); st.setPlaying(!st.playing); }
      else if (e.key === "Home") { e.preventDefault(); st.setPlayhead(0); }
      else if (e.key === "End") { e.preventDefault(); st.setPlayhead(sequenceEnd(st.clips)); }
      else if (e.key === "+" || e.key === "=") st.setZoom(st.zoom * 1.25);
      else if (e.key === "-") st.setZoom(st.zoom / 1.25);
      else if (e.key === "Escape") st.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- redimensionar painel ---------- */
  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = height;
    const move = (ev: PointerEvent) => setHeight(Math.min(800, Math.max(180, h0 - (ev.clientY - y0))));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const fit = () => {
    const w = (scrollRef.current?.clientWidth ?? 800) - HEADER_W;
    s.setZoom(fitZoom(s.clips, w));
    scrollRef.current?.scrollTo({ left: 0 });
  };

  const playheadX = (s.playhead / 1000) * s.zoom;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar linha do tempo"
        onPointerDown={startResize}
        className="h-2 cursor-ns-resize bg-border/30 hover:bg-primary/40 touch-none"
      />
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Início" onClick={() => s.setPlayhead(0)}><SkipBack className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={s.playing ? "Pausar" : "Reproduzir"} onClick={() => s.setPlaying(!s.playing)} disabled={!s.clips.length}>
          {s.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="min-w-[150px] font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimecode(s.playhead)} / {formatTimecode(end)}
        </span>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Duplicar" disabled={!s.selected.length} onClick={s.duplicate}><Copy className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Excluir clipe" disabled={!s.selected.length} onClick={s.deleteSelected}><Trash2 className="h-4 w-4" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 rounded-lg"><Plus className="mr-1 h-4 w-4" />Trilha</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(Object.keys(TRACK_LABEL) as TrackKind[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => s.addTrack(k)}>{TRACK_LABEL[k]}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Diminuir zoom" onClick={() => s.setZoom(s.zoom / 1.25)}><ZoomOut className="h-4 w-4" /></Button>
          <input
            type="range" min={0} max={100} aria-label="Zoom"
            value={Math.round((Math.log(s.zoom / 2) / Math.log(300)) * 100)}
            onChange={(e) => s.setZoom(2 * Math.pow(300, Number(e.target.value) / 100))}
            className="w-24 accent-primary"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Aumentar zoom" onClick={() => s.setZoom(s.zoom * 1.25)}><ZoomIn className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 rounded-lg" onClick={fit} disabled={!s.clips.length}><Maximize2 className="mr-1 h-4 w-4" />Ajustar</Button>
        </div>
      </div>

      <div ref={scrollRef} className="relative overflow-auto" style={{ height }} onPointerDown={() => s.select(null)}>
        <div className="relative" style={{ width: HEADER_W + contentW, minWidth: "100%" }}>
          {/* régua */}
          <div className="sticky top-0 z-30 flex border-b border-border/60 bg-card" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-border/60 bg-card" style={{ width: HEADER_W }} />
            <div className="relative cursor-pointer" style={{ width: contentW }} onPointerDown={(e) => { e.stopPropagation(); scrub(e); }}
              onPointerMove={(e) => { if (e.buttons === 1) scrub(e); }}>
              {ticks.map((t) => (
                <div key={t} className="absolute inset-y-0 border-l border-border/70" style={{ left: (t / 1000) * s.zoom }}>
                  <span className="absolute left-1 top-0.5 whitespace-nowrap font-mono text-[10px] text-muted-foreground">{formatTimecode(t)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* trilhas */}
          {s.tracks.map((tr, i) => (
            <div key={tr.id} className="flex border-b border-border/40" style={{ height: ROW_H }}>
              <div className="sticky left-0 z-20 shrink-0 border-r border-border/60 bg-card" style={{ width: HEADER_W }} onPointerDown={(e) => e.stopPropagation()}>
                <TimelineTrackHeader
                  track={tr} first={i === 0} last={i === s.tracks.length - 1}
                  onChange={(p) => s.updateTrack(tr.id, p)}
                  onMove={(d) => s.moveTrack(tr.id, d)}
                  onRemove={() => s.removeTrack(tr.id)}
                />
              </div>
              <div
                data-track-id={tr.id}
                className={cn("relative", tr.locked && "bg-muted/30", !tr.visible && "opacity-40")}
                style={{ width: contentW }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes(ASSET_DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(e) => dropOnTrack(e, tr.id, tr.kind)}
              >
                {s.clips.filter((c) => c.trackId === tr.id).map((c) => (
                  <TimelineClip
                    key={c.id} clip={c} asset={assetMap.get(c.assetId)} zoom={s.zoom}
                    selected={s.selected.includes(c.id)} locked={tr.locked} onPointerDown={onClipPointerDown}
                  />
                ))}
              </div>
            </div>
          ))}
          {!s.tracks.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma trilha. Use “+ Trilha” para criar.</p>
          )}

          {/* cursor de reprodução */}
          <div className="pointer-events-none absolute top-0 bottom-0 z-40 w-px bg-destructive" style={{ left: HEADER_W + playheadX }}>
            <div className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-destructive" />
          </div>
        </div>
      </div>
      {!s.clips.length && (
        <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          Arraste arquivos da biblioteca para uma trilha. Shift ou Ctrl + clique seleciona vários clipes.
        </p>
      )}
    </div>
  );
}

