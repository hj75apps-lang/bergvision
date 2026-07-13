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
  Eye,
  FileStack,
  Image as ImageIcon,
  Images,
  Film,
  FileImage,
  ListMusic,
  Loader2,
  Layers,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Settings,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Video as VideoIcon,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LayersPanel } from "@/components/studio/layers-panel";
import { PropertiesPanel } from "@/components/studio/properties-panel";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  clampPct,
  commonGroupPrefix,
  getGroupPath,
  makeGroupId,
  type CanvasTemplate,
  type ElementType,
  type GroupSeg,
  type TemplateElement,
} from "@/lib/studio/types";
import {
  diffSnapshots,
  useHistoryStore,
} from "@/lib/studio/history-store";
import {
  ElementBody as StudioElementBody,
  TemplateBackground,
} from "@/components/studio/element-body";
import { TemplateSettingsDialog } from "@/components/studio/template-settings-dialog";
import { ImageEditorDialog } from "@/components/studio/image-editor/image-editor-dialog";
import { PreviewPanel } from "@/components/preview/preview-panel";
import {
  ComponentsPanel,
  type LibraryItem,
} from "@/components/studio/components-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudioDraftPayload } from "@/lib/studio/use-draft-payload";
import { slugify } from "@/lib/template-utils";

export const Route = createFileRoute("/studio/$templateId")({
  head: () => ({
    meta: [
      { title: "Editor · Studio · Berg Vision" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorPage,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-lg font-semibold">Erro ao abrir o editor</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={reset}>Tentar novamente</Button>
        <Button asChild variant="link">
          <Link to="/studio">Voltar</Link>
        </Button>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-lg font-semibold">Template não encontrado.</h1>
      <Button asChild variant="link">
        <Link to="/studio">Voltar ao Studio</Link>
      </Button>
    </div>
  ),
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
    type: "image",
    label: "GIF",
    icon: Film,
    defaultContent: {
      element_type: "image",
      imageSubtype: "gif",
      fit: "contain",
      name: "GIF animado",
    },
    defaultSize: { width: 25, height: 25 },
  },
  {
    type: "image",
    label: "APNG",
    icon: FileImage,
    defaultContent: {
      element_type: "image",
      imageSubtype: "apng",
      fit: "contain",
      name: "APNG animado",
    },
    defaultSize: { width: 25, height: 25 },
  },
  {
    type: "image",
    label: "Sequência",
    icon: Images,
    defaultContent: {
      element_type: "image",
      imageSubtype: "sequence",
      fit: "contain",
      fps: 12,
      loop: true,
      frames: [],
      name: "Sequência de imagens",
    },
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
    type: "playlist",
    label: "Grupo",
    icon: Layers,
    defaultContent: {
      element_type: "playlist",
      source: "inline",
      items: [],
      loop: true,
      transition: "fade",
      defaultDuration: 8,
      fit: "cover",
      name: "Grupo de mídias",
    },
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

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
      // Try full column set first, then fall back stripping optional columns
      // that may not exist in this project's `templates` schema (Studio
      // schema é aplicado via docs/sql/20260710_studio_canvas_schema.sql).
      const optional = ["background_media_id", "scaling_mode", "background_color"];
      const base = [
        "id",
        "name",
        "canvas_width",
        "canvas_height",
        "organization_id",
      ];
      let cols = [...base, ...optional];
      for (let i = 0; i <= optional.length; i++) {
        const { data, error } = await supabase
          .from("templates")
          .select(cols.join(", "))
          .eq("id", templateId)
          .maybeSingle();
        if (!error) {
          if (!data) throw new Error("Template não encontrado.");
          return data as unknown as CanvasTemplate;
        }
        const msg = `${error.message} ${error.details ?? ""}`.toLowerCase();
        const missing = optional.find(
          (k) => cols.includes(k) && (msg.includes(`"${k}"`) || msg.includes(` ${k} `) || msg.includes(`'${k}'`)),
        );
        if (!missing) throw error;
        cols = cols.filter((c) => c !== missing);
      }
      throw new Error("Falha ao carregar template.");
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
      if (error) {
        // Se a tabela ainda não foi provisionada, dá mensagem clara em vez
        // de quebrar o editor com erro genérico.
        if (error.code === "PGRST205" || /template_elements/i.test(error.message)) {
          throw new Error(
            "Schema do Studio não aplicado no Supabase. Rode docs/sql/20260710_studio_canvas_schema.sql no SQL Editor.",
          );
        }
        throw error;
      }
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

  const isFullscreenable = useCallback((el: TemplateElement) => {
    return (
      el.element_type === "image" ||
      el.element_type === "video" ||
      el.element_type === "widget"
    );
  }, []);

  const isFullscreenGeom = (el: TemplateElement) =>
    el.x <= 0.01 &&
    el.y <= 0.01 &&
    el.width >= 99.99 &&
    el.height >= 99.99;

  const isImageEditable = useCallback((el: TemplateElement) => {
    return el.element_type === "image" || el.element_type === "logo";
  }, []);

  const [editorElementId, setEditorElementId] = useState<string | null>(null);
  const editorElement = useMemo(
    () => elements.find((e) => e.id === editorElementId) ?? null,
    [elements, editorElementId],
  );
  const editorSource = useMemo(() => {
    if (!editorElement) return null;
    const c = (editorElement.content ?? {}) as Record<string, unknown>;
    const mediaFileId = c.mediaFileId as string | undefined;
    const storagePath = c.mediaStoragePath as string | undefined;
    if (!mediaFileId || !storagePath) return null;
    return {
      mediaFileId,
      storagePath,
      thumbnailPath: (c.mediaThumbnailPath as string | undefined) ?? null,
      name: (c.mediaFileName as string | undefined) ?? "imagem",
    };
  }, [editorElement]);

  const openImageEditor = useCallback(
    (elId: string) => {
      const el = elements.find((e) => e.id === elId);
      if (!el || !isImageEditable(el)) return;
      const c = (el.content ?? {}) as Record<string, unknown>;
      if (!c.mediaFileId || !c.mediaStoragePath) {
        toast.info("Selecione uma imagem para este elemento antes de editar.");
        return;
      }
      setEditorElementId(elId);
    },
    [elements, isImageEditable],
  );

  const toggleFullscreen = useCallback(
    async (id: string) => {
      const el = elements.find((e) => e.id === id);
      if (!el) return;
      if (el.locked) return;
      if (!isFullscreenable(el)) return;
      snapshot();
      const content = { ...((el.content ?? {}) as Record<string, unknown>) };
      const prev = content._prevGeom as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      let patch: Partial<
        Pick<
          TemplateElement,
          "x" | "y" | "width" | "height" | "z_index"
        >
      > & { content?: Record<string, unknown> };
      if (isFullscreenGeom(el) && prev) {
        delete content._prevGeom;
        patch = {
          x: clampPct(prev.x),
          y: clampPct(prev.y),
          width: clampPct(prev.width),
          height: clampPct(prev.height),
          content,
        };
      } else {
        content._prevGeom = {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        };
        const maxZ = elements.reduce(
          (m, e) => Math.max(m, e.z_index ?? 0),
          0,
        );
        patch = {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          z_index: maxZ + 1,
          content,
        };
      }
      await persistUpdate(id, patch);
      await qc.invalidateQueries({ queryKey: ["studio_elements", templateId] });
    },
    [elements, isFullscreenable, persistUpdate, qc, snapshot, templateId],
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

  const draftPayload = useStudioDraftPayload(template, elements, previewOpen);

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

  const doDuplicate = async () => {
    if (!template || !duplicateName.trim() || duplicating) return;
    setDuplicating(true);
    try {
      const { data: newT, error: tErr } = await supabase
        .from("templates")
        .insert({
          name: duplicateName.trim(),
          slug: `${slugify(duplicateName)}-${Math.random().toString(36).slice(2, 6)}`,
          type: "canvas",
          orientation:
            template.canvas_width >= template.canvas_height
              ? "landscape"
              : "portrait",
          canvas_width: template.canvas_width,
          canvas_height: template.canvas_height,
          aspect_ratio:
            template.canvas_width >= template.canvas_height ? "16:9" : "9:16",
          background_color: template.background_color ?? "#0F172A",
          layout_css: JSON.stringify({
            kind: "canvas",
            version: 1,
            elements: [],
          }),
          background_media_id: template.background_media_id ?? null,
          scaling_mode: template.scaling_mode ?? "letterbox",
          is_system: false,
          organization_id: template.organization_id,
          zone_count: 0,
        })
        .select("id")
        .single();
      if (tErr) throw tErr;
      const newId = (newT as { id: string }).id;
      const rows = (elementsQ.data ?? []).map((e) => ({
        template_id: newId,
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
      if (rows.length > 0) {
        const { error: elErr } = await supabase
          .from("template_elements")
          .insert(rows);
        if (elErr) throw elErr;
      }
      toast.success("Template duplicado.");
      setDuplicateOpen(false);
      setDuplicateName("");
      await qc.invalidateQueries({ queryKey: ["studio_templates"] });
      navigate({ to: "/studio/$templateId", params: { templateId: newId } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao duplicar.");
    } finally {
      setDuplicating(false);
    }
  };

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
            onClick={() => setPreviewOpen(true)}
            title="Preview ao vivo (renderiza no Player)"
          >
            <Eye className="mr-1.5 h-4 w-4" />
            Preview ao vivo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            disabled={!canEdit}
            title="Configurações"
          >
            <Settings className="mr-1.5 h-4 w-4" />
            Configurações
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDuplicateName(`${template.name} (cópia)`);
              setDuplicateOpen(true);
            }}
            disabled={!canEdit}
            title="Salvar como novo"
          >
            <FileStack className="mr-1.5 h-4 w-4" />
            Salvar como novo
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
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
        {(() => {
          const isImageSubtype = (t: ToolDef) =>
            t.type === "image" &&
            typeof (t.defaultContent as Record<string, unknown>).imageSubtype === "string";
          const imageMainIdx = TOOLS.findIndex(
            (t) => t.type === "image" && !isImageSubtype(t),
          );
          const imageMain = imageMainIdx >= 0 ? TOOLS[imageMainIdx] : null;
          const imageSubtypes = TOOLS.filter(isImageSubtype);
          return TOOLS.map((tool, idx) => {
            if (isImageSubtype(tool)) return null;
            if (tool === imageMain) {
              return (
                <div
                  key={`tool-${idx}`}
                  className="inline-flex items-center rounded-lg"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-l-lg rounded-r-none pr-2"
                    disabled={!canEdit || addElement.isPending}
                    onClick={() => addElement.mutate(tool)}
                  >
                    <tool.icon className="mr-1.5 h-4 w-4" />
                    {tool.label}
                  </Button>
                  {imageSubtypes.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-l-none rounded-r-lg border-l border-border/60 px-1.5"
                          disabled={!canEdit || addElement.isPending}
                          title="Mais formatos de imagem"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Formatos animados</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {imageSubtypes.map((t, i) => (
                          <DropdownMenuItem
                            key={`sub-${i}`}
                            disabled={!canEdit || addElement.isPending}
                            onSelect={() => addElement.mutate(t)}
                          >
                            <t.icon className="mr-2 h-4 w-4" />
                            {t.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            }
            return (
              <Button
                key={`tool-${idx}`}
                variant="ghost"
                size="sm"
                className="rounded-lg"
                disabled={!canEdit || addElement.isPending}
                onClick={() => addElement.mutate(tool)}
              >
                <tool.icon className="mr-1.5 h-4 w-4" />
                {tool.label}
              </Button>
            );
          });
        })()}
      </div>

      {/* Main workspace */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr_280px]">
        {/* Layers */}
        <aside className="hidden overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur lg:flex lg:flex-col lg:h-[72vh]">
          <Tabs defaultValue="layers" className="flex h-full flex-col">
            <TabsList className="mx-2 mt-2 grid w-auto grid-cols-2">
              <TabsTrigger value="layers" className="text-xs">Camadas</TabsTrigger>
              <TabsTrigger value="components" className="text-xs">Componentes</TabsTrigger>
            </TabsList>
            <TabsContent value="layers" className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
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
            onSelectMany={(ids, additive) =>
              setSelectedIds((prev) => {
                if (!additive) return ids;
                const set = new Set(prev);
                const allIn = ids.every((i) => set.has(i));
                if (allIn) ids.forEach((i) => set.delete(i));
                else ids.forEach((i) => set.add(i));
                return Array.from(set);
              })
            }
            onGroup={async (ids) => {
              if (ids.length < 2) return;
              snapshot();
              const sel = elements.filter((e) => ids.includes(e.id));
              const paths = sel.map((e) => getGroupPath(e));
              const prefix = commonGroupPrefix(paths);
              const usedNames = new Set(
                elements.flatMap((e) => getGroupPath(e).map((s) => s.name)),
              );
              let n = usedNames.size + 1;
              let name = `Grupo ${n}`;
              while (usedNames.has(name)) name = `Grupo ${++n}`;
              const seg: GroupSeg = { id: makeGroupId(), name };
              const target = [...prefix, seg];
              await Promise.all(
                sel.map((el) => {
                  const content = {
                    ...((el.content ?? {}) as Record<string, unknown>),
                    groupPath: target,
                  };
                  return supabase
                    .from("template_elements")
                    .update({ content })
                    .eq("id", el.id);
                }),
              );
              await qc.invalidateQueries({
                queryKey: ["studio_elements", templateId],
              });
            }}
            onUngroup={async (groupId) => {
              snapshot();
              const affected = elements.filter((e) =>
                getGroupPath(e).some((s) => s.id === groupId),
              );
              await Promise.all(
                affected.map((el) => {
                  const path = getGroupPath(el).filter((s) => s.id !== groupId);
                  const content = {
                    ...((el.content ?? {}) as Record<string, unknown>),
                    groupPath: path,
                  };
                  return supabase
                    .from("template_elements")
                    .update({ content })
                    .eq("id", el.id);
                }),
              );
              await qc.invalidateQueries({
                queryKey: ["studio_elements", templateId],
              });
            }}
            onRenameGroup={async (groupId, name) => {
              const affected = elements.filter((e) =>
                getGroupPath(e).some((s) => s.id === groupId),
              );
              await Promise.all(
                affected.map((el) => {
                  const path = getGroupPath(el).map((s) =>
                    s.id === groupId ? { ...s, name } : s,
                  );
                  const content = {
                    ...((el.content ?? {}) as Record<string, unknown>),
                    groupPath: path,
                  };
                  return supabase
                    .from("template_elements")
                    .update({ content })
                    .eq("id", el.id);
                }),
              );
              await qc.invalidateQueries({
                queryKey: ["studio_elements", templateId],
              });
            }}
            onToggleGroupVisible={async (groupId) => {
              const affected = elements.filter((e) =>
                getGroupPath(e).some((s) => s.id === groupId),
              );
              if (affected.length === 0) return;
              const anyHidden = affected.some((e) => !(e.visible ?? true));
              const nextVisible = anyHidden; // se algum oculto → mostrar todos; senão ocultar
              snapshot();
              await Promise.all(
                affected.map((el) =>
                  supabase
                    .from("template_elements")
                    .update({ visible: nextVisible })
                    .eq("id", el.id),
                ),
              );
              await qc.invalidateQueries({
                queryKey: ["studio_elements", templateId],
              });
            }}
            onToggleGroupLocked={async (groupId) => {
              const affected = elements.filter((e) =>
                getGroupPath(e).some((s) => s.id === groupId),
              );
              if (affected.length === 0) return;
              const anyUnlocked = affected.some((e) => !(e.locked ?? false));
              const nextLocked = anyUnlocked; // se algum destravado → travar todos; senão destravar
              snapshot();
              await Promise.all(
                affected.map((el) =>
                  supabase
                    .from("template_elements")
                    .update({ locked: nextLocked })
                    .eq("id", el.id),
                ),
              );
              await qc.invalidateQueries({
                queryKey: ["studio_elements", templateId],
              });
            }}
            onMoveToGroup={async (elementIds, targetPath) => {
              const items = elements.filter((e) => elementIds.includes(e.id));
              if (items.length === 0) return;
              snapshot();
              await Promise.all(
                items.map((el) => {
                  const content = {
                    ...((el.content ?? {}) as Record<string, unknown>),
                    groupPath: targetPath,
                  };
                  return supabase
                    .from("template_elements")
                    .update({ content })
                    .eq("id", el.id);
                }),
              );
              await qc.invalidateQueries({
                queryKey: ["studio_elements", templateId],
              });
            }}
            onDuplicate={(ids) => void duplicateElements(ids)}
            onDelete={(ids) => void deleteElements(ids)}
            onDeleteGroup={(groupId) => {
              const ids = elements
                .filter((e) => getGroupPath(e).some((s) => s.id === groupId))
                .map((e) => e.id);
              if (ids.length === 0) return;
              void deleteElements(ids);
            }}
              />
            </TabsContent>
            <TabsContent value="components" className="mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <ComponentsPanel
                disabled={!canEdit || addElement.isPending}
                onAdd={(item: LibraryItem) => addElement.mutate(item)}
              />
            </TabsContent>
          </Tabs>
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
                onDoubleClick={(e) => {
                  if (!canEdit) return;
                  const t = (e.target as HTMLElement).closest(
                    "[data-el-id]",
                  ) as HTMLElement | null;
                  if (!t) return;
                  const id = t.dataset.elId;
                  if (id) void toggleFullscreen(id);
                }}
              >
                <TemplateBackground
                  color={bg}
                  mediaId={template.background_media_id ?? null}
                />
                {elements.map((el) => (
                  <ElementView
                    key={el.id}
                    el={el}
                    selected={selectedIds.includes(el.id)}
                    canEdit={canEdit}
                    fullscreenable={isFullscreenable(el)}
                    isFullscreen={isFullscreenGeom(el)}
                    onToggleFullscreen={() => void toggleFullscreen(el.id)}
                    imageEditable={isImageEditable(el)}
                    onEditImage={() => openImageEditor(el.id)}
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
                    snapThreshold={5}
                    snapDirections={{
                      top: true,
                      right: true,
                      bottom: true,
                      left: true,
                      center: true,
                      middle: true,
                    }}
                    elementSnapDirections={{
                      top: true,
                      right: true,
                      bottom: true,
                      left: true,
                      center: true,
                      middle: true,
                    }}
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
            canvasWidth={template.canvas_width}
            canvasHeight={template.canvas_height}
            fullscreenable={
              activeElement ? isFullscreenable(activeElement) : false
            }
            isFullscreen={
              activeElement ? isFullscreenGeom(activeElement) : false
            }
            onToggleFullscreen={() => {
              if (activeElement) void toggleFullscreen(activeElement.id);
            }}
            imageEditable={
              activeElement ? isImageEditable(activeElement) : false
            }
            onEditImage={() => {
              if (activeElement) openImageEditor(activeElement.id);
            }}
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

      <PreviewPanel
        mode="modal"
        scope="template"
        targetId={templateId}
        draftData={draftPayload}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      <TemplateSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        template={{
          id: template.id,
          scaling_mode: template.scaling_mode ?? "letterbox",
          background_color: template.background_color,
          background_media_id: template.background_media_id ?? null,
          canvas_width: template.canvas_width,
          canvas_height: template.canvas_height,
        }}
        disabled={!canEdit}
      />

      <ImageEditorDialog
        open={!!editorElement && !!editorSource}
        onOpenChange={(v) => {
          if (!v) setEditorElementId(null);
        }}
        source={editorSource}
        onSaved={({ mediaFile, cacheBust }) => {
          if (!editorElement) return;
          const prev = (editorElement.content ?? {}) as Record<string, unknown>;
          const nextContent: Record<string, unknown> = {
            ...prev,
            mediaFileId: mediaFile.id,
            mediaFileName: mediaFile.name,
            mediaStoragePath: mediaFile.storage_path,
            mediaThumbnailPath: mediaFile.thumbnail_path,
            mediaCacheBust: cacheBust,
          };
          void commitElementUpdate(editorElement.id, { content: nextContent });
          void qc.invalidateQueries({ queryKey: ["studio_media_dims"] });
          void qc.invalidateQueries({ queryKey: ["studio_media_picker"] });
          void qc.invalidateQueries({ queryKey: ["media_files"] });
        }}
      />

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar como novo template</DialogTitle>
            <DialogDescription>
              Cria uma cópia deste template com todos os elementos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="dup-name">Nome do novo template</Label>
            <Input
              id="dup-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDuplicateOpen(false)}
              disabled={duplicating}
            >
              Cancelar
            </Button>
            <Button
              onClick={doDuplicate}
              disabled={duplicating || duplicateName.trim().length < 2}
            >
              {duplicating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ElementView({
  el,
  selected,
  canEdit,
  fullscreenable,
  isFullscreen,
  onToggleFullscreen,
  imageEditable,
  onEditImage,
}: {
  el: TemplateElement;
  selected: boolean;
  canEdit: boolean;
  fullscreenable: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  imageEditable: boolean;
  onEditImage: () => void;
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
    zIndex: el.z_index ?? 0,
    outline: selected ? "2px solid var(--primary, #3B82F6)" : "none",
    outlineOffset: "1px",
    cursor: el.locked ? "not-allowed" : "move",
    userSelect: "none",
    pointerEvents: el.locked ? "none" : "auto",
  };

  const body = (
    <div
      data-el-id={el.id}
      data-rot={String(el.rotation ?? 0)}
      style={style}
    >
      <StudioElementBody el={el} />
    </div>
  );

  if (!canEdit || (!fullscreenable && !imageEditable)) return body;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {fullscreenable && (
          <ContextMenuItem onSelect={() => onToggleFullscreen()}>
            {isFullscreen ? "Restaurar tamanho original" : "Ocupar tela toda"}
          </ContextMenuItem>
        )}
        {imageEditable && (
          <ContextMenuItem onSelect={() => onEditImage()}>
            Editar imagem…
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}