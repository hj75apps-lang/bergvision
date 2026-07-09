import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LayersPanel } from "@/components/studio/layers-panel";
import { PropertiesPanel } from "@/components/studio/properties-panel";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import {
  clampPct,
  ELEMENT_LABELS,
  type CanvasTemplate,
  type ElementType,
  type TemplateElement,
} from "@/lib/studio/types";
import {
  diffSnapshots,
  useHistoryStore,
} from "@/lib/studio/history-store";

export const Route = createFileRoute("/studio/$templateId")({
  head: () => ({
    meta: [
      { title: "Editor · Studio · Berg Vision" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorPage,
});

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
      widgetConfig: { format: "24h", timezone: "America/Sao_Paulo" },
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

function EditorPage() {
  const { templateId } = Route.useParams();
  const { membership } = useAuth();
  const role = membership?.role ?? "viewer";
  const canEdit = role === "owner" || role === "admin" || role === "editor";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const selectoRef = useRef<Selecto | null>(null);
  const moveableRef = useRef<Moveable | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);

  const [pendingGeom, setPendingGeom] = useState<
    Record<string, Partial<Pick<TemplateElement, "x" | "y" | "width" | "height" | "rotation">>>
  >({});

  const historyReset = useHistoryStore((s) => s.reset);
  const historyPush = useHistoryStore((s) => s.push);
  const historyUndo = useHistoryStore((s) => s.undo);
  const historyRedo = useHistoryStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

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

  const elements = useMemo<TemplateElement[]>(() => {
    const base = elementsQ.data ?? [];
    if (Object.keys(pendingGeom).length === 0) return base;
    return base.map((e) =>
      pendingGeom[e.id] ? { ...e, ...pendingGeom[e.id] } : e,
    );
  }, [elementsQ.data, pendingGeom]);

  const selectedElements = useMemo(
    () => elements.filter((e) => selectedIds.includes(e.id)),
    [elements, selectedIds],
  );
  const activeElement =
    selectedElements.length === 1 ? selectedElements[0] : null;

  // Reset history when switching templates.
  useEffect(() => {
    historyReset(templateId);
  }, [templateId, historyReset]);

  // ---- Canvas measurement ----
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setCanvasSize({ w: r.width, h: r.height });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [templateQ.data, zoom]);

  useEffect(() => {
    if (moveableRef.current) moveableRef.current.updateRect();
  }, [canvasSize, selectedIds, elements, zoom]);

  // ---- Persistence primitives ----
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const persistUpdate = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<TemplateElement, "x" | "y" | "width" | "height" | "rotation" | "z_index" | "opacity" | "locked" | "visible">
      > & { content?: Record<string, unknown> },
    ) => {
      const { error } = await supabase
        .from("template_elements")
        .update(patch)
        .eq("id", id);
      if (error) {
        toast.error("Falha ao salvar.");
        console.warn("[studio] save error", error.message);
      }
    },
    [],
  );

  const scheduleGeomSave = useCallback(
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

  /** Push snapshot of current merged elements BEFORE a committing action. */
  const snapshot = useCallback(() => {
    historyPush(elements);
  }, [historyPush, elements]);

  // ---- Add / delete / duplicate / update ----
  const addElement = useMutation({
    mutationFn: async (tool: ToolDef) => {
      snapshot();
      const maxZ = elements.reduce((m, e) => Math.max(m, e.z_index ?? 0), 0);
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
      snapshot();
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
    [qc, snapshot, templateId],
  );

  const duplicateElements = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const src = elements.filter((e) => ids.includes(e.id));
      if (src.length === 0) return;
      snapshot();
      const maxZ = elements.reduce((m, e) => Math.max(m, e.z_index ?? 0), 0);
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
    [elements, qc, snapshot, templateId],
  );

  const commitElementUpdate = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<TemplateElement, "x" | "y" | "width" | "height" | "rotation" | "z_index" | "opacity" | "locked" | "visible">
      > & { content?: Record<string, unknown> },
    ) => {
      snapshot();
      await persistUpdate(id, patch);
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
    },
    [persistUpdate, qc, snapshot, templateId],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0) return;
      snapshot();
      for (const id of selectedIds) {
        const el = elements.find((e) => e.id === id);
        if (!el || el.locked) continue;
        const x = clampPct(el.x + dx, 100 - el.width);
        const y = clampPct(el.y + dy, 100 - el.height);
        scheduleGeomSave(id, { x, y });
      }
    },
    [elements, scheduleGeomSave, selectedIds, snapshot],
  );

  // ---- History apply ----
  const applySnapshot = useCallback(
    async (target: TemplateElement[]) => {
      const current = elementsQ.data ?? [];
      const { toInsert, toUpdate, toDeleteIds } = diffSnapshots(
        current,
        target,
      );
      const errors: string[] = [];

      if (toDeleteIds.length > 0) {
        const { error } = await supabase
          .from("template_elements")
          .delete()
          .in("id", toDeleteIds);
        if (error) errors.push(error.message);
      }
      if (toInsert.length > 0) {
        const rows = toInsert.map((e) => ({
          id: e.id,
          template_id: e.template_id,
          element_type: e.element_type,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
          z_index: e.z_index,
          opacity: e.opacity ?? 1,
          locked: e.locked ?? false,
          visible: e.visible ?? true,
          content: e.content ?? {},
        }));
        const { error } = await supabase
          .from("template_elements")
          .insert(rows);
        if (error) errors.push(error.message);
      }
      for (const e of toUpdate) {
        const { error } = await supabase
          .from("template_elements")
          .update({
            x: e.x,
            y: e.y,
            width: e.width,
            height: e.height,
            rotation: e.rotation,
            z_index: e.z_index,
            opacity: e.opacity ?? 1,
            locked: e.locked ?? false,
            visible: e.visible ?? true,
            content: e.content ?? {},
          })
          .eq("id", e.id);
        if (error) errors.push(error.message);
      }

      if (errors.length > 0) {
        toast.error("Falha ao aplicar histórico.");
        console.warn("[studio] history apply errors", errors);
      }
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
    },
    [elementsQ.data, qc, templateId],
  );

  const doUndo = useCallback(async () => {
    const target = historyUndo(elements);
    if (target) await applySnapshot(target);
  }, [applySnapshot, elements, historyUndo]);

  const doRedo = useCallback(async () => {
    const target = historyRedo(elements);
    if (target) await applySnapshot(target);
  }, [applySnapshot, elements, historyRedo]);

  // ---- Layers actions ----
  const reorderLayers = useCallback(
    async (topToBottomIds: string[]) => {
      snapshot();
      // topToBottomIds[0] gets the highest z_index.
      const total = topToBottomIds.length;
      const updates = topToBottomIds.map((id, i) => ({
        id,
        z_index: total - i,
      }));
      for (const u of updates) {
        await supabase
          .from("template_elements")
          .update({ z_index: u.z_index })
          .eq("id", u.id);
      }
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
    },
    [qc, snapshot, templateId],
  );

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) void doRedo();
        else void doUndo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        void doRedo();
        return;
      }
      if (mod && (e.key === "d" || e.key === "D")) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          void duplicateElements(selectedIds);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          void deleteElements(selectedIds);
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
  }, [
    canEdit,
    deleteElements,
    doRedo,
    doUndo,
    duplicateElements,
    nudge,
    selectedIds,
  ]);

  // ---- Moveable helpers ----
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

  const unselectedTargets = useMemo(() => {
    if (!canvasRef.current) return [];
    return elements
      .filter((e) => !selectedIds.includes(e.id))
      .map((e) =>
        canvasRef.current!.querySelector<HTMLElement>(`[data-el-id="${e.id}"]`),
      )
      .filter((n): n is HTMLElement => !!n);
  }, [elements, selectedIds, canvasSize]);

  // Center + edges of canvas as snap guidelines.
  const verticalGuidelines = useMemo(
    () => (canvasSize.w ? [0, canvasSize.w / 2, canvasSize.w] : []),
    [canvasSize.w],
  );
  const horizontalGuidelines = useMemo(
    () => (canvasSize.h ? [0, canvasSize.h / 2, canvasSize.h] : []),
    [canvasSize.h],
  );

  const template = templateQ.data;

  // ---- Zoom controls ----
  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)));
  const zoomFit = () => setZoom(1);

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
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
      {/* Top bar */}
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

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canEdit || !canUndo}
            onClick={doUndo}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canEdit || !canRedo}
            onClick={doRedo}
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
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
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button variant="ghost" size="icon" onClick={zoomOut} title="Zoom -">
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={zoomIn} title="Zoom +">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={zoomFit} title="Ajustar">
            <Maximize2 className="h-4 w-4" />
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

      {/* Main workspace */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr_280px]">
        {/* Layers */}
        <aside className="hidden overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur lg:flex lg:flex-col lg:h-[72vh]">
          <LayersPanel
            elements={elements}
            selectedIds={selectedIds}
            disabled={!canEdit}
            onSelect={(id, additive) =>
              setSelectedIds((prev) =>
                additive
                  ? prev.includes(id)
                    ? prev.filter((v) => v !== id)
                    : [...prev, id]
                  : [id],
              )
            }
            onRename={(id, name) => {
              const el = elements.find((e) => e.id === id);
              if (!el) return;
              const content = { ...(el.content ?? {}), name };
              void commitElementUpdate(id, { content });
            }}
            onToggleVisible={(id) => {
              const el = elements.find((e) => e.id === id);
              if (!el) return;
              void commitElementUpdate(id, { visible: !(el.visible ?? true) });
            }}
            onToggleLocked={(id) => {
              const el = elements.find((e) => e.id === id);
              if (!el) return;
              void commitElementUpdate(id, { locked: !(el.locked ?? false) });
            }}
            onReorder={reorderLayers}
          />
        </aside>

        {/* Canvas stage */}
        <div
          ref={stageWrapRef}
          className="relative flex min-h-[60vh] w-full items-center justify-center overflow-auto rounded-2xl border border-border/60 bg-muted/20 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedIds([]);
          }}
        >
          <div
            className="relative"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              width: "min(100%, calc(72vh * " + template.canvas_width + " / " + template.canvas_height + "))",
            }}
          >
            <div
              className="relative w-full"
              style={{ aspectRatio: aspect, maxHeight: "72vh" }}
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
                    snappable
                    snapCenter
                    snapThreshold={5}
                    elementGuidelines={unselectedTargets}
                    verticalGuidelines={verticalGuidelines}
                    horizontalGuidelines={horizontalGuidelines}
                    throttleDrag={0}
                    throttleResize={0}
                    throttleRotate={0}
                    onDragStart={() => snapshot()}
                    onDrag={({ target, beforeTranslate }) => {
                      const rot = (target as HTMLElement).dataset.rot ?? "0";
                      target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px) rotate(${rot}deg)`;
                    }}
                    onDragEnd={({ target, isDrag }) => {
                      if (!isDrag) return;
                      const id = (target as HTMLElement).dataset.elId!;
                      const rect = (target as HTMLElement).getBoundingClientRect();
                      const parent = canvasRef.current!.getBoundingClientRect();
                      const x = clampPct(pxToPctX((rect.left - parent.left) / zoom));
                      const y = clampPct(pxToPctY((rect.top - parent.top) / zoom));
                      scheduleGeomSave(id, { x, y });
                      target.style.transform = "";
                    }}
                    onResizeStart={() => snapshot()}
                    onResize={({ target, width, height, drag }) => {
                      const rot = (target as HTMLElement).dataset.rot ?? "0";
                      target.style.width = `${width}px`;
                      target.style.height = `${height}px`;
                      target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px) rotate(${rot}deg)`;
                    }}
                    onResizeEnd={({ target }) => {
                      const id = (target as HTMLElement).dataset.elId!;
                      const rect = (target as HTMLElement).getBoundingClientRect();
                      const parent = canvasRef.current!.getBoundingClientRect();
                      const x = clampPct(pxToPctX((rect.left - parent.left) / zoom));
                      const y = clampPct(pxToPctY((rect.top - parent.top) / zoom));
                      const width = clampPct(pxToPctX(rect.width / zoom));
                      const height = clampPct(pxToPctY(rect.height / zoom));
                      scheduleGeomSave(id, { x, y, width, height });
                      target.style.transform = "";
                      target.style.width = "";
                      target.style.height = "";
                    }}
                    onRotateStart={() => snapshot()}
                    onRotate={({ target, beforeRotate }) => {
                      target.style.transform = `rotate(${beforeRotate}deg)`;
                    }}
                    onRotateEnd={({ target, lastEvent }) => {
                      if (!lastEvent) return;
                      const id = (target as HTMLElement).dataset.elId!;
                      const rotation = Math.round(lastEvent.beforeRotate) % 360;
                      scheduleGeomSave(id, { rotation });
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
        </div>

        {/* Properties */}
        <aside className="hidden overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur lg:flex lg:flex-col lg:h-[72vh]">
          <PropertiesPanel
            element={activeElement}
            disabled={!canEdit}
            onGeomChange={(patch) => {
              if (!activeElement) return;
              void commitElementUpdate(activeElement.id, patch);
            }}
            onFlagChange={(patch) => {
              if (!activeElement) return;
              void commitElementUpdate(activeElement.id, patch);
            }}
            onContentChange={(content) => {
              if (!activeElement) return;
              void commitElementUpdate(activeElement.id, { content });
            }}
          />
        </aside>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Ctrl+Z / Ctrl+Shift+Z desfazer/refazer · Delete/Backspace excluir ·
        Ctrl+D duplicar · setas para mover (Shift = 5%)
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
  const visible = el.visible ?? true;
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
    transform: `rotate(${el.rotation ?? 0}deg)`,
    transformOrigin: "center center",
    opacity: visible ? (el.opacity ?? 1) : 0.15,
    outline: selected ? "2px solid var(--primary, #3B82F6)" : "none",
    outlineOffset: "1px",
    cursor: el.locked ? "not-allowed" : "move",
    userSelect: "none",
    pointerEvents: el.locked ? "none" : "auto",
  };

  return (
    <div
      data-el-id={el.id}
      data-rot={String(el.rotation ?? 0)}
      style={style}
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
      const sizePct =
        typeof c.fontSizePercent === "number" ? c.fontSizePercent : 6;
      const bg = typeof c.backgroundColor === "string" ? c.backgroundColor : undefined;
      const bgOpacity =
        typeof c.backgroundOpacity === "number" ? c.backgroundOpacity : 1;
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
            backgroundColor: bg
              ? bg + Math.round(bgOpacity * 255).toString(16).padStart(2, "0")
              : undefined,
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
    case "image":
    case "logo":
      return <MediaImage path={(c.mediaStoragePath as string) ?? null} fit={(c.fit as string) ?? "cover"} label={ELEMENT_LABELS[el.element_type]} />;
    case "video":
      return (
        <MediaVideo
          path={(c.mediaStoragePath as string) ?? null}
          fit={(c.fit as string) ?? "cover"}
          loop={(c.loop as boolean) ?? true}
          muted={(c.muted as boolean) ?? true}
        />
      );
    default: {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/40 bg-white/5 text-[10px] font-medium uppercase tracking-wider text-white/80 backdrop-blur">
          {ELEMENT_LABELS[el.element_type]}
        </div>
      );
    }
  }
}

function MediaImage({
  path,
  fit,
  label,
}: {
  path: string | null;
  fit: string;
  label: string;
}) {
  const url = useSignedUrl(path);
  if (!path) return <PlaceholderBadge label={label} />;
  if (!url)
    return (
      <div className="grid h-full w-full place-items-center bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin text-white/60" />
      </div>
    );
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="h-full w-full"
      style={{
        objectFit: (fit as React.CSSProperties["objectFit"]) ?? "cover",
      }}
    />
  );
}

function MediaVideo({
  path,
  fit,
  loop,
  muted,
}: {
  path: string | null;
  fit: string;
  loop: boolean;
  muted: boolean;
}) {
  const url = useSignedUrl(path);
  if (!path) return <PlaceholderBadge label="Vídeo" />;
  if (!url)
    return (
      <div className="grid h-full w-full place-items-center bg-white/5">
        <Loader2 className="h-4 w-4 animate-spin text-white/60" />
      </div>
    );
  return (
    <video
      src={url}
      className="h-full w-full"
      style={{
        objectFit: (fit as React.CSSProperties["objectFit"]) ?? "cover",
      }}
      autoPlay
      loop={loop}
      muted={muted}
      playsInline
    />
  );
}

function PlaceholderBadge({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/40 bg-white/5 text-[10px] font-medium uppercase tracking-wider text-white/80 backdrop-blur">
      {label}
    </div>
  );
}