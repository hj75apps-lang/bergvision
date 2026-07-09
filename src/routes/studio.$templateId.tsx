import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Moveable from "react-moveable";
import Selecto from "react-selecto";
import {
  ArrowLeft,
  Copy,
  Image as ImageIcon,
  ListMusic,
  Loader2,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/studio/$templateId")({
  head: () => ({
    meta: [
      { title: "Editor · Studio · Berg Vision" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorPage,
});

type CanvasTemplate = {
  id: string;
  name: string;
  canvas_width: number;
  canvas_height: number;
  background_color: string | null;
  organization_id: string | null;
};

type ElementType =
  | "text"
  | "image"
  | "video"
  | "logo"
  | "playlist"
  | "widget"
  | "shape";

type TemplateElement = {
  id: string;
  template_id: string;
  element_type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  opacity: number | null;
  locked: boolean | null;
  visible: boolean | null;
  content: Record<string, unknown> | null;
};

type ToolDef = {
  type: ElementType;
  label: string;
  icon: typeof TypeIcon;
  defaultContent: Record<string, unknown>;
  defaultSize: { width: number; height: number };
};

const TOOLS: ToolDef[] = [
  {
    type: "text",
    label: "Texto",
    icon: TypeIcon,
    defaultContent: {
      element_type: "text",
      content: "Texto",
      fontFamily: "Inter",
      fontSizePercent: 6,
      fontWeight: "500",
      color: "#FFFFFF",
      textAlign: "left",
    },
    defaultSize: { width: 30, height: 10 },
  },
  {
    type: "image",
    label: "Imagem",
    icon: ImageIcon,
    defaultContent: { element_type: "image", fit: "cover" },
    defaultSize: { width: 30, height: 30 },
  },
  {
    type: "video",
    label: "Vídeo",
    icon: VideoIcon,
    defaultContent: {
      element_type: "video",
      fit: "cover",
      loop: true,
      muted: true,
    },
    defaultSize: { width: 40, height: 30 },
  },
  {
    type: "logo",
    label: "Logo",
    icon: Sparkles,
    defaultContent: { element_type: "logo", fit: "contain" },
    defaultSize: { width: 20, height: 10 },
  },
  {
    type: "playlist",
    label: "Playlist",
    icon: ListMusic,
    defaultContent: { element_type: "playlist" },
    defaultSize: { width: 40, height: 40 },
  },
  {
    type: "widget",
    label: "Widget",
    icon: Shapes,
    defaultContent: {
      element_type: "widget",
      widgetType: "clock",
      widgetConfig: { format: "24h" },
    },
    defaultSize: { width: 25, height: 15 },
  },
  {
    type: "shape",
    label: "Forma",
    icon: Square,
    defaultContent: {
      element_type: "shape",
      shapeType: "rectangle",
      fill: "#3B82F6",
      borderRadius: 8,
      borderWidth: 0,
    },
    defaultSize: { width: 20, height: 20 },
  },
];

const clampPct = (v: number, max = 100) => Math.max(0, Math.min(max, v));

function EditorPage() {
  const { templateId } = Route.useParams();
  const { membership } = useAuth();
  const role = membership?.role ?? "viewer";
  const canEdit = role === "owner" || role === "admin" || role === "editor";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const selectoRef = useRef<Selecto | null>(null);
  const moveableRef = useRef<Moveable | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  // In-flight positional overrides (percent) applied on top of server data
  // during drag/resize/rotate. Flushed to DB by debounced save.
  const [pendingGeom, setPendingGeom] = useState<
    Record<string, Partial<Pick<TemplateElement, "x" | "y" | "width" | "height" | "rotation">>>
  >({});

  const templateQ = useQuery({
    queryKey: ["studio_template", templateId],
    queryFn: async (): Promise<CanvasTemplate> => {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, name, canvas_width, canvas_height, background_color, organization_id",
        )
        .eq("id", templateId)
        .single();
      if (error) throw error;
      return data as CanvasTemplate;
    },
  });

  const elementsQ = useQuery({
    queryKey: ["studio_elements", templateId],
    queryFn: async (): Promise<TemplateElement[]> => {
      const { data, error } = await supabase
        .from("template_elements")
        .select(
          "id, template_id, element_type, x, y, width, height, rotation, z_index, opacity, locked, visible, content",
        )
        .eq("template_id", templateId)
        .order("z_index");
      if (error) throw error;
      return (data ?? []) as TemplateElement[];
    },
  });

  // Merge server data with pending in-flight geometry so the DOM stays smooth.
  const elements = useMemo<TemplateElement[]>(() => {
    const base = elementsQ.data ?? [];
    if (Object.keys(pendingGeom).length === 0) return base;
    return base.map((e) => (pendingGeom[e.id] ? { ...e, ...pendingGeom[e.id] } : e));
  }, [elementsQ.data, pendingGeom]);

  // ---- Canvas measure ----
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setCanvasSize({ w: r.width, h: r.height });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [templateQ.data]);

  useEffect(() => {
    // Give moveable a chance to reposition after size changes
    if (moveableRef.current) moveableRef.current.updateRect();
  }, [canvasSize, selectedIds, elements]);

  // ---- Mutations ----
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const persistUpdate = useCallback(
    async (
      id: string,
      patch: Partial<Pick<TemplateElement, "x" | "y" | "width" | "height" | "rotation" | "z_index">>,
    ) => {
      const { error } = await supabase
        .from("template_elements")
        .update(patch)
        .eq("id", id);
      if (error) {
        toast.error("Falha ao salvar posição.");
        console.warn("[studio] save error", error.message);
      }
    },
    [],
  );

  const scheduleSave = useCallback(
    (
      id: string,
      patch: Partial<Pick<TemplateElement, "x" | "y" | "width" | "height" | "rotation">>,
    ) => {
      setPendingGeom((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
      const existing = saveTimers.current.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(async () => {
        saveTimers.current.delete(id);
        await persistUpdate(id, patch);
        // Refetch to reconcile server truth, then drop pending override.
        await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
        setPendingGeom((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 500);
      saveTimers.current.set(id, t);
    },
    [persistUpdate, qc, templateId],
  );

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const addElement = useMutation({
    mutationFn: async (tool: ToolDef) => {
      const maxZ = (elementsQ.data ?? []).reduce(
        (m, e) => Math.max(m, e.z_index ?? 0),
        0,
      );
      const { data, error } = await supabase
        .from("template_elements")
        .insert({
          template_id: templateId,
          element_type: tool.type,
          x: 10,
          y: 10,
          width: tool.defaultSize.width,
          height: tool.defaultSize.height,
          rotation: 0,
          z_index: maxZ + 1,
          opacity: 1,
          locked: false,
          visible: true,
          content: tool.defaultContent,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
      setSelectedIds([id]);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar."),
  });

  const deleteElements = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("template_elements")
        .delete()
        .in("id", ids);
      if (error) {
        toast.error("Falha ao excluir.");
        return;
      }
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
    },
    [qc, templateId],
  );

  const duplicateElements = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const src = (elementsQ.data ?? []).filter((e) => ids.includes(e.id));
      if (src.length === 0) return;
      const maxZ = (elementsQ.data ?? []).reduce(
        (m, e) => Math.max(m, e.z_index ?? 0),
        0,
      );
      const rows = src.map((e, i) => ({
        template_id: templateId,
        element_type: e.element_type,
        x: clampPct(e.x + 2),
        y: clampPct(e.y + 2),
        width: e.width,
        height: e.height,
        rotation: e.rotation,
        z_index: maxZ + 1 + i,
        opacity: e.opacity ?? 1,
        locked: false,
        visible: e.visible ?? true,
        content: e.content ?? {},
      }));
      const { data, error } = await supabase
        .from("template_elements")
        .insert(rows)
        .select("id");
      if (error) {
        toast.error("Falha ao duplicar.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
      setSelectedIds((data ?? []).map((r) => (r as { id: string }).id));
    },
    [elementsQ.data, qc, templateId],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0) return;
      for (const id of selectedIds) {
        const el = elements.find((e) => e.id === id);
        if (!el || el.locked) continue;
        const x = clampPct(el.x + dx, 100 - el.width);
        const y = clampPct(el.y + dy, 100 - el.height);
        scheduleSave(id, { x, y });
      }
    },
    [elements, scheduleSave, selectedIds],
  );

  // ---- Keyboard ----
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          void deleteElements(selectedIds);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          void duplicateElements(selectedIds);
        }
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudge(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudge(0, step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(step, 0);
      } else if (e.key === "Escape") {
        setSelectedIds([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, deleteElements, duplicateElements, nudge, selectedIds]);

  // ---- Moveable handlers ----
  const pxToPctX = (px: number) => (canvasSize.w ? (px / canvasSize.w) * 100 : 0);
  const pxToPctY = (px: number) => (canvasSize.h ? (px / canvasSize.h) * 100 : 0);

  const selectedTargets = useMemo(() => {
    if (!canvasRef.current) return [];
    return selectedIds
      .map((id) =>
        canvasRef.current!.querySelector<HTMLElement>(`[data-el-id="${id}"]`),
      )
      .filter((n): n is HTMLElement => !!n);
  }, [selectedIds, elements, canvasSize]);

  const template = templateQ.data;

  if (templateQ.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-lg font-semibold">Template não encontrado.</h1>
        <Button asChild variant="link">
          <Link to="/studio">Voltar ao Studio</Link>
        </Button>
      </div>
    );
  }

  const aspect = `${template.canvas_width} / ${template.canvas_height}`;
  const bg = template.background_color ?? "#0F172A";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/studio" })}
            className="rounded-lg"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Studio
          </Button>
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">
              {template.name}
            </h1>
            <span className="text-xs text-muted-foreground">
              {template.canvas_width}×{template.canvas_height}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => duplicateElements(selectedIds)}
            disabled={!canEdit || selectedIds.length === 0}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            Duplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteElements(selectedIds)}
            disabled={!canEdit || selectedIds.length === 0}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-2 backdrop-blur">
        <span className="px-2 text-xs uppercase tracking-wider text-muted-foreground">
          Adicionar
        </span>
        <Separator orientation="vertical" className="h-6" />
        {TOOLS.map((tool) => (
          <Button
            key={tool.type}
            variant="ghost"
            size="sm"
            className="rounded-lg"
            disabled={!canEdit || addElement.isPending}
            onClick={() => addElement.mutate(tool)}
          >
            <tool.icon className="mr-1.5 h-4 w-4" />
            {tool.label}
          </Button>
        ))}
      </div>

      {/* Canvas stage */}
      <div
        className="relative flex w-full items-center justify-center rounded-2xl border border-border/60 bg-muted/20 p-4"
        onMouseDown={(e) => {
          // Clicks on empty stage area clear selection.
          if (e.target === e.currentTarget) setSelectedIds([]);
        }}
      >
        <div
          className="relative w-full max-w-full"
          style={{
            aspectRatio: aspect,
            maxHeight: "min(72vh, 900px)",
            maxWidth:
              template.canvas_width >= template.canvas_height
                ? "100%"
                : `calc(min(72vh, 900px) * ${template.canvas_width} / ${template.canvas_height})`,
          }}
        >
          <div
            ref={canvasRef}
            className="canvas-stage relative h-full w-full overflow-hidden rounded-xl shadow-xl"
            style={{ backgroundColor: bg }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedIds([]);
            }}
          >
            {elements.map((el) => (
              <ElementView
                key={el.id}
                el={el}
                selected={selectedIds.includes(el.id)}
              />
            ))}

            {canEdit && selectedTargets.length > 0 && canvasSize.w > 0 && (
              <Moveable
                ref={moveableRef}
                target={selectedTargets}
                draggable
                resizable
                rotatable
                origin={false}
                keepRatio={false}
                throttleDrag={0}
                throttleResize={0}
                throttleRotate={0}
                onDrag={({ target, beforeTranslate }) => {
                  target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px) rotate(${
                    (target as HTMLElement).dataset.rot ?? "0"
                  }deg)`;
                }}
                onDragEnd={({ target, isDrag }) => {
                  if (!isDrag) return;
                  const id = (target as HTMLElement).dataset.elId!;
                  const rect = (target as HTMLElement).getBoundingClientRect();
                  const parent = canvasRef.current!.getBoundingClientRect();
                  const x = clampPct(pxToPctX(rect.left - parent.left));
                  const y = clampPct(pxToPctY(rect.top - parent.top));
                  scheduleSave(id, { x, y });
                  target.style.transform = "";
                }}
                onResize={({ target, width, height, drag }) => {
                  target.style.width = `${width}px`;
                  target.style.height = `${height}px`;
                  target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px) rotate(${
                    (target as HTMLElement).dataset.rot ?? "0"
                  }deg)`;
                }}
                onResizeEnd={({ target }) => {
                  const id = (target as HTMLElement).dataset.elId!;
                  const rect = (target as HTMLElement).getBoundingClientRect();
                  const parent = canvasRef.current!.getBoundingClientRect();
                  const x = clampPct(pxToPctX(rect.left - parent.left));
                  const y = clampPct(pxToPctY(rect.top - parent.top));
                  const width = clampPct(pxToPctX(rect.width));
                  const height = clampPct(pxToPctY(rect.height));
                  scheduleSave(id, { x, y, width, height });
                  target.style.transform = "";
                  target.style.width = "";
                  target.style.height = "";
                }}
                onRotate={({ target, beforeRotate }) => {
                  target.style.transform = `rotate(${beforeRotate}deg)`;
                }}
                onRotateEnd={({ target, lastEvent }) => {
                  if (!lastEvent) return;
                  const id = (target as HTMLElement).dataset.elId!;
                  const rotation = Math.round(lastEvent.beforeRotate) % 360;
                  scheduleSave(id, { rotation });
                  target.style.transform = "";
                }}
              />
            )}
          </div>

          {canEdit && canvasRef.current && (
            <Selecto
              ref={selectoRef}
              container={canvasRef.current}
              dragContainer={canvasRef.current}
              selectableTargets={[".canvas-stage [data-el-id]"]}
              hitRate={0}
              selectByClick
              selectFromInside={false}
              toggleContinueSelect={["shift"]}
              onDragStart={(e) => {
                const t = e.inputEvent.target as HTMLElement;
                if (
                  moveableRef.current &&
                  moveableRef.current.isMoveableElement(t)
                ) {
                  e.stop();
                }
              }}
              onSelect={(e) => {
                const ids = e.selected
                  .map((n) => (n as HTMLElement).dataset.elId)
                  .filter((v): v is string => !!v);
                setSelectedIds(ids);
              }}
            />
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Delete/Backspace para excluir · Ctrl+D para duplicar · setas para mover
        (Shift para 5%) · arraste para seleção múltipla
      </p>
    </div>
  );
}

function ElementView({
  el,
  selected,
}: {
  el: TemplateElement;
  selected: boolean;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
    transform: `rotate(${el.rotation ?? 0}deg)`,
    transformOrigin: "center center",
    opacity: el.opacity ?? 1,
    outline: selected ? "2px solid var(--primary, #3B82F6)" : "none",
    outlineOffset: "1px",
    cursor: "move",
    userSelect: "none",
  };

  return (
    <div
      data-el-id={el.id}
      data-rot={String(el.rotation ?? 0)}
      style={style}
      className="group"
    >
      <ElementBody el={el} />
    </div>
  );
}

function ElementBody({ el }: { el: TemplateElement }) {
  const c = (el.content ?? {}) as Record<string, unknown>;
  switch (el.element_type) {
    case "text": {
      const text = typeof c.content === "string" ? c.content : "Texto";
      const align = (c.textAlign as string) ?? "left";
      const color = (c.color as string) ?? "#FFFFFF";
      const weight = (c.fontWeight as string) ?? "500";
      const family = (c.fontFamily as string) ?? "Inter";
      const sizePct = typeof c.fontSizePercent === "number" ? c.fontSizePercent : 6;
      return (
        <div
          className="flex h-full w-full items-center overflow-hidden p-1"
          style={{
            justifyContent:
              align === "center"
                ? "center"
                : align === "right"
                  ? "flex-end"
                  : "flex-start",
            color,
            fontFamily: family,
            fontWeight: weight as React.CSSProperties["fontWeight"],
            fontSize: `${sizePct}cqh`,
            containerType: "size",
          }}
        >
          <span className="truncate">{text}</span>
        </div>
      );
    }
    case "shape": {
      const shape = (c.shapeType as string) ?? "rectangle";
      return (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: (c.fill as string) ?? "#3B82F6",
            borderRadius:
              shape === "circle" ? "50%" : `${(c.borderRadius as number) ?? 0}px`,
            border:
              (c.borderWidth as number) && c.borderColor
                ? `${c.borderWidth}px solid ${c.borderColor}`
                : undefined,
          }}
        />
      );
    }
    default: {
      const labels: Record<ElementType, string> = {
        text: "Texto",
        image: "Imagem",
        video: "Vídeo",
        logo: "Logo",
        playlist: "Playlist",
        widget: "Widget",
        shape: "Forma",
      };
      return (
        <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/40 bg-white/5 text-[10px] font-medium uppercase tracking-wider text-white/80 backdrop-blur">
          {labels[el.element_type]}
        </div>
      );
    }
  }
}