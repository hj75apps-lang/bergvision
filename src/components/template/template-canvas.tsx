// Shared canvas renderer for templates. Used by:
//   - Gallery cards (readonly, no interaction)
//   - Configure-content dialog (readonly + highlight selected zone)
//   - Visual layout editor (interactive: click to select, drag to move,
//     resize handles when selected)
//
// Same component, three modes ⇒ one visual source of truth.

import { useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  aspectRatioCss,
  clampZoneRect,
  snapPct,
  zoneColor,
  zonesWithReferenceFallback,
  zoneWithFallback,
  zonesOverlap,
  type Template,
  type Zone,
} from "@/lib/template-utils";

export type CanvasMode = "preview" | "highlight" | "edit";

type Props = {
  template: Pick<Template, "aspect_ratio" | "canvas_width" | "canvas_height" | "allow_overlap"> &
    Partial<Pick<Template, "name" | "slug">>;
  zones: Zone[];
  mode?: CanvasMode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (zones: Zone[]) => void;
  onCommit?: (zones: Zone[]) => void; // fires on pointer-up after drag/resize
  snap?: number;
  className?: string;
  showLabels?: boolean;
};

type DragState = {
  zoneId: string;
  mode: "move" | "resize";
  handle?: string;
  startPointerX: number;
  startPointerY: number;
  startRect: { pos_x: number; pos_y: number; width_pct: number; height_pct: number };
  canvasRect: DOMRect;
};

const HANDLES: Array<{ key: string; cursor: string; style: React.CSSProperties }> = [
  { key: "nw", cursor: "nwse-resize", style: { top: -6, left: -6 } },
  { key: "n", cursor: "ns-resize", style: { top: -6, left: "50%", transform: "translateX(-50%)" } },
  { key: "ne", cursor: "nesw-resize", style: { top: -6, right: -6 } },
  { key: "e", cursor: "ew-resize", style: { top: "50%", right: -6, transform: "translateY(-50%)" } },
  { key: "se", cursor: "nwse-resize", style: { bottom: -6, right: -6 } },
  { key: "s", cursor: "ns-resize", style: { bottom: -6, left: "50%", transform: "translateX(-50%)" } },
  { key: "sw", cursor: "nesw-resize", style: { bottom: -6, left: -6 } },
  { key: "w", cursor: "ew-resize", style: { top: "50%", left: -6, transform: "translateY(-50%)" } },
];

function PreviewReferencePattern({ index }: { index: number }) {
  const variant = index % 4;

  if (variant === 1) {
    return (
      <div className="pointer-events-none grid h-full w-full grid-cols-3 gap-1 opacity-70">
        <div className="rounded-sm bg-white/18" />
        <div className="rounded-sm bg-white/10" />
        <div className="rounded-sm bg-white/18" />
      </div>
    );
  }

  if (variant === 2) {
    return (
      <div className="pointer-events-none flex h-full w-full flex-col justify-end gap-1 opacity-70">
        <div className="h-1.5 w-2/3 rounded-full bg-white/20" />
        <div className="h-1.5 w-1/2 rounded-full bg-white/14" />
        <div className="h-1.5 w-5/6 rounded-full bg-white/18" />
      </div>
    );
  }

  if (variant === 3) {
    return (
      <div className="pointer-events-none grid h-full w-full place-items-center opacity-70">
        <div className="h-8 w-8 rounded-full border border-white/25 bg-white/10" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none flex h-full w-full flex-col gap-1 opacity-70">
      <div className="h-2 w-1/3 rounded-full bg-white/20" />
      <div className="mt-auto grid grid-cols-4 gap-1">
        <div className="h-5 rounded-sm bg-white/16" />
        <div className="h-5 rounded-sm bg-white/10" />
        <div className="h-5 rounded-sm bg-white/16" />
        <div className="h-5 rounded-sm bg-white/10" />
      </div>
    </div>
  );
}

export function TemplateCanvas({
  template,
  zones,
  mode = "preview",
  selectedId,
  onSelect,
  onChange,
  onCommit,
  snap = 1,
  className,
  showLabels,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const isEdit = mode === "edit";
  const isPreview = mode === "preview";

  const normalized = useMemo(
    () => (isPreview ? zonesWithReferenceFallback(template, zones) : zones.map(zoneWithFallback)),
    [isPreview, template, zones],
  );
  const renderLabels = showLabels ?? !isPreview;

  const overlapMap = useMemo(() => {
    if (template.allow_overlap || isPreview) return new Map<string, boolean>();
    const m = new Map<string, boolean>();
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        if (zonesOverlap(normalized[i], normalized[j])) {
          m.set(normalized[i].id, true);
          m.set(normalized[j].id, true);
        }
      }
    }
    return m;
  }, [normalized, template.allow_overlap, isPreview]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !onChange) return;
      const dxPct = ((e.clientX - drag.startPointerX) / drag.canvasRect.width) * 100;
      const dyPct = ((e.clientY - drag.startPointerY) / drag.canvasRect.height) * 100;
      let next = { ...drag.startRect };
      if (drag.mode === "move") {
        next.pos_x = drag.startRect.pos_x + dxPct;
        next.pos_y = drag.startRect.pos_y + dyPct;
      } else {
        const h = drag.handle ?? "";
        if (h.includes("e")) next.width_pct = drag.startRect.width_pct + dxPct;
        if (h.includes("s")) next.height_pct = drag.startRect.height_pct + dyPct;
        if (h.includes("w")) {
          next.width_pct = drag.startRect.width_pct - dxPct;
          next.pos_x = drag.startRect.pos_x + dxPct;
        }
        if (h.includes("n")) {
          next.height_pct = drag.startRect.height_pct - dyPct;
          next.pos_y = drag.startRect.pos_y + dyPct;
        }
      }
      next = clampZoneRect({
        pos_x: snapPct(next.pos_x, snap),
        pos_y: snapPct(next.pos_y, snap),
        width_pct: snapPct(next.width_pct, snap),
        height_pct: snapPct(next.height_pct, snap),
      });
      onChange(
        normalized.map((z) =>
          z.id === drag.zoneId
            ? {
                ...z,
                pos_x: next.pos_x,
                pos_y: next.pos_y,
                width_pct: next.width_pct,
                height_pct: next.height_pct,
              }
            : z,
        ),
      );
    },
    [normalized, onChange, snap],
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    if (drag && onCommit) onCommit(normalized);
  }, [normalized, onCommit, onPointerMove]);

  const startDrag = (
    e: React.PointerEvent,
    zone: Zone,
    dragMode: "move" | "resize",
    handle?: string,
  ) => {
    if (!isEdit || !onChange) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSelect?.(zone.id);
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      zoneId: zone.id,
      mode: dragMode,
      handle,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startRect: {
        pos_x: zone.pos_x ?? 0,
        pos_y: zone.pos_y ?? 0,
        width_pct: zone.width_pct ?? 100,
        height_pct: zone.height_pct ?? 100,
      },
      canvasRect: rect,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      ref={canvasRef}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border/60 bg-neutral-900",
        isEdit && "cursor-crosshair",
        className,
      )}
      style={{ aspectRatio: aspectRatioCss(template) }}
      onPointerDown={(e) => {
        if (isEdit && e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      {/* Snap grid — subtle background lines every 10% for visual feedback */}
      {isEdit && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,.05) 1px, transparent 1px)," +
              "linear-gradient(to bottom, rgba(255,255,255,.05) 1px, transparent 1px)",
            backgroundSize: "10% 10%",
          }}
        />
      )}

      {normalized
        .slice()
        .sort((a, b) => a.z_index - b.z_index)
        .map((z, i) => {
          const selected = selectedId === z.id;
          const overlapping = overlapMap.get(z.id) === true;
          return (
            <div
              key={z.id}
              className={cn(
                "absolute flex flex-col justify-between rounded-md p-1.5 text-[10px] font-medium text-white/90 transition-shadow",
                isEdit && "cursor-move ring-1 ring-white/10",
                selected && "ring-2 ring-primary shadow-lg",
                overlapping && !selected && "ring-1 ring-red-500/70",
              )}
              style={{
                left: `${z.pos_x}%`,
                top: `${z.pos_y}%`,
                width: `${z.width_pct}%`,
                height: `${z.height_pct}%`,
                background: zoneColor(z.zone_index ?? i),
                zIndex: z.z_index,
              }}
              onPointerDown={(e) => {
                if (isEdit) startDrag(e, z, "move");
                else onSelect?.(z.id);
              }}
            >
              {renderLabels && (z.width_pct ?? 0) >= 18 && (z.height_pct ?? 0) >= 12 && (
                <div className="pointer-events-none flex items-start justify-between gap-1">
                  <span className="max-w-full truncate rounded bg-black/50 px-1.5 py-0.5">
                    {z.zone_name}
                  </span>
                  {overlapping && !isPreview && (
                    <span className="shrink-0 rounded bg-red-500/80 px-1.5 py-0.5 text-[9px]">
                      sobreposição
                    </span>
                  )}
                </div>
              )}
              {isPreview && <PreviewReferencePattern index={z.zone_index ?? i} />}
              {isEdit && selected && (
                <>
                  {HANDLES.map((h) => (
                    <div
                      key={h.key}
                      className="absolute h-3 w-3 rounded-sm border border-white/80 bg-primary"
                      style={{ ...h.style, cursor: h.cursor }}
                      onPointerDown={(e) => startDrag(e, z, "resize", h.key)}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}

      {normalized.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-xs text-white/50">
          Sem zonas
        </div>
      )}
    </div>
  );
}