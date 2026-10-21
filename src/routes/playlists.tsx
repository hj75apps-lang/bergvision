import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  GripVertical,
  ImageIcon,
  ListMusic,
  Loader2,
  LayoutTemplate,
  Plus,
  Trash2,
  Video,
  Calendar as CalendarIcon,
  MonitorPlay,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { PreviewPanel } from "@/components/preview/preview-panel";
import { PlaylistLocalPreview } from "@/components/preview/playlist-local-preview";
import {
  usePlaylistDraftPayload,
  type PlaylistDraftItem,
  type PlaylistDraftMeta,
} from "@/lib/playlist/use-playlist-draft-payload";

export const Route = createFileRoute("/playlists")({
  head: () => ({
    meta: [
      { title: "Playlists · Berg Vision" },
      {
        name: "description",
        content:
          "Monte playlists dinâmicas para as suas telas com transições, duração e agendamento.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { edit?: string } =>
    typeof s.edit === "string" && s.edit ? { edit: s.edit } : {},
  component: PlaylistsPage,
});

export type Playlist = {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: number[] | null;
  schedule_date_start: string | null;
  schedule_date_end: string | null;
  created_at: string | null;
  items_count?: { count: number }[];
};

type MediaKind = "image" | "video" | string;

type MediaFile = {
  id: string;
  name: string;
  type: MediaKind;
};

type TemplateLite = {
  id: string;
  name: string;
  type: string | null;
};

type PlaylistItem = {
  id: string;
  playlist_id: string;
  item_type: "media" | "template";
  media_file_id: string | null;
  template_id: string | null;
  position: number;
  duration: number | null;
  transition: string | null;
  media?: MediaFile | null;
  template?: TemplateLite | null;
};

const DAYS = [
  { i: 0, label: "Dom" },
  { i: 1, label: "Seg" },
  { i: 2, label: "Ter" },
  { i: 3, label: "Qua" },
  { i: 4, label: "Qui" },
  { i: 5, label: "Sex" },
  { i: 6, label: "Sáb" },
];

function scheduleSummary(p: Playlist): string | null {
  if (!p.schedule_start && !p.schedule_end && (!p.schedule_days || p.schedule_days.length === 0)) {
    return null;
  }
  const time =
    p.schedule_start && p.schedule_end
      ? `${p.schedule_start.slice(0, 5)}–${p.schedule_end.slice(0, 5)}`
      : p.schedule_start
        ? `a partir de ${p.schedule_start.slice(0, 5)}`
        : p.schedule_end
          ? `até ${p.schedule_end.slice(0, 5)}`
          : null;
  const days =
    p.schedule_days && p.schedule_days.length > 0 && p.schedule_days.length < 7
      ? p.schedule_days
          .slice()
          .sort()
          .map((d) => DAYS[d]?.label)
          .filter(Boolean)
          .join(", ")
      : p.schedule_days && p.schedule_days.length === 7
        ? "todos os dias"
        : null;
  return [time, days].filter(Boolean).join(" · ");
}

function PlaylistsPage() {
  const { edit: editId } = Route.useSearch();
  const navigate = useNavigate();
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canManage = role !== "viewer";
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Playlist | null>(null);

  const playlistsQ = useQuery({
    queryKey: ["playlists-list", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Playlist[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select(
          "id, organization_id, name, is_active, schedule_start, schedule_end, schedule_days, schedule_date_start, schedule_date_end, created_at, items_count:playlist_items(count)",
        )
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Playlist[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organização não identificada");
      const { data, error } = await supabase
        .from("playlists")
        .insert({
          organization_id: orgId,
          name: "Nova playlist",
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Playlist;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
      setEditing(p);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao criar playlist."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Playlist removida.");
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover."),
  });

  const playlists = playlistsQ.data ?? [];

  // Abre direto a edição quando vier ?edit=<id> (ex.: links do Dashboard).
  useEffect(() => {
    if (!editId || playlists.length === 0) return;
    const found = playlists.find((p) => p.id === editId);
    if (found) setEditing(found);
    navigate({ to: "/playlists", search: {}, replace: true });
  }, [editId, playlists, navigate]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playlists</h1>
          <p className="text-sm text-muted-foreground">
            {playlists.length} playlist(s) na sua organização.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="h-10 rounded-xl"
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Nova Playlist
          </Button>
        )}
      </header>

      {playlistsQ.isLoading ? (
        <GridSkeleton count={4} heightClass="h-44" />
      ) : playlists.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border/60 bg-card/40 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
              <ListMusic className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Nenhuma playlist criada</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Crie sua primeira playlist para orquestrar mídias com transições e
              agendamento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {playlists.map((p) => {
            const count = p.items_count?.[0]?.count ?? 0;
            const sched = scheduleSummary(p);
            return (
              <Card
                key={p.id}
                className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{p.name}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {count} item(s)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`rounded-full text-[10px] ${
                        p.is_active
                          ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.is_active ? "ATIVA" : "INATIVA"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 text-xs text-muted-foreground">
                  {sched ? (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {sched}
                    </div>
                  ) : (
                    <span>Sem agendamento</span>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between gap-2 pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 rounded-xl"
                    onClick={() => setEditing(p)}
                  >
                    Editar
                  </Button>
                  {canManage && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover playlist?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {p.name} e todos os seus itens serão removidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove.mutate(p.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PlaylistEditor
          playlist={editing}
          open={!!editing}
          canManage={canManage}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}

export function PlaylistEditor({
  playlist,
  open,
  canManage,
  onOpenChange,
}: {
  playlist: Playlist;
  open: boolean;
  canManage: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const qc = useQueryClient();

  const [name, setName] = useState(playlist.name);
  const [isActive, setIsActive] = useState(playlist.is_active);
  const [scheduleStart, setScheduleStart] = useState(
    playlist.schedule_start?.slice(0, 5) ?? "",
  );
  const [scheduleEnd, setScheduleEnd] = useState(
    playlist.schedule_end?.slice(0, 5) ?? "",
  );
  const [scheduleDays, setScheduleDays] = useState<number[]>(
    playlist.schedule_days ?? [],
  );
  const [dateStart, setDateStart] = useState<Date | undefined>(
    playlist.schedule_date_start
      ? new Date(`${playlist.schedule_date_start}T00:00:00`)
      : undefined,
  );
  const [dateEnd, setDateEnd] = useState<Date | undefined>(
    playlist.schedule_date_end
      ? new Date(`${playlist.schedule_date_end}T00:00:00`)
      : undefined,
  );
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  useEffect(() => {
    setName(playlist.name);
    setIsActive(playlist.is_active);
    setScheduleStart(playlist.schedule_start?.slice(0, 5) ?? "");
    setScheduleEnd(playlist.schedule_end?.slice(0, 5) ?? "");
    setScheduleDays(playlist.schedule_days ?? []);
    setDateStart(
      playlist.schedule_date_start
        ? new Date(`${playlist.schedule_date_start}T00:00:00`)
        : undefined,
    );
    setDateEnd(
      playlist.schedule_date_end
        ? new Date(`${playlist.schedule_date_end}T00:00:00`)
        : undefined,
    );
  }, [playlist.id]);

  const itemsQ = useQuery({
    queryKey: ["playlist_items", playlist.id],
    enabled: open,
    queryFn: async (): Promise<PlaylistItem[]> => {
      const { data, error } = await supabase
        .from("playlist_items")
        .select(
          "id, playlist_id, item_type, media_file_id, template_id, position, duration, transition, media:media_files(id, name, type), template:templates(id, name, type)",
        )
        .eq("playlist_id", playlist.id)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        media: Array.isArray(r.media) ? r.media[0] : r.media,
        template: Array.isArray(r.template) ? r.template[0] : r.template,
      })) as PlaylistItem[];
    },
  });

  const mediaQ = useQuery({
    queryKey: ["media_files-all", orgId],
    enabled: open && !!orgId,
    queryFn: async (): Promise<MediaFile[]> => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, name, type")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MediaFile[];
    },
  });

  const templatesQ = useQuery({
    queryKey: ["templates-all", orgId],
    enabled: open && !!orgId,
    queryFn: async (): Promise<TemplateLite[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, type, organization_id, is_system")
        .or(`organization_id.eq.${orgId},is_system.eq.true`)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        type: t.type ?? null,
      })) as TemplateLite[];
    },
  });

  const playersQ = useQuery({
    queryKey: ["players-for-playlist", orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, status, orientation")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        status: string | null;
        orientation: string | null;
      }>;
    },
  });

  const assignedPlayersQ = useQuery({
    queryKey: ["playlist_players", playlist.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playlist_players")
        .select("player_id")
        .eq("playlist_id", playlist.id);
      if (error) throw error;
      return (data ?? []).map((r: { player_id: string }) => r.player_id);
    },
  });

  useEffect(() => {
    if (assignedPlayersQ.data) setSelectedPlayerIds(assignedPlayersQ.data);
  }, [assignedPlayersQ.data]);

  const [items, setItems] = useState<PlaylistItem[]>([]);
  useEffect(() => {
    setItems(itemsQ.data ?? []);
  }, [itemsQ.data]);

  const saveMeta = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim() || "Sem nome",
        is_active: isActive,
        schedule_start: scheduleStart || null,
        schedule_end: scheduleEnd || null,
        schedule_days: scheduleDays.length > 0 ? scheduleDays : null,
        schedule_date_start: dateStart ? format(dateStart, "yyyy-MM-dd") : null,
        schedule_date_end: dateEnd ? format(dateEnd, "yyyy-MM-dd") : null,
      };
      const { error } = await supabase
        .from("playlists")
        .update(payload)
        .eq("id", playlist.id);
      if (error) throw error;

      // Sincroniza vínculos com players (diff)
      const current = new Set(assignedPlayersQ.data ?? []);
      const next = new Set(selectedPlayerIds);
      const toAdd = [...next].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !next.has(id));
      if (toRemove.length > 0) {
        const { error: delErr } = await supabase
          .from("playlist_players")
          .delete()
          .eq("playlist_id", playlist.id)
          .in("player_id", toRemove);
        if (delErr) throw delErr;
      }
      if (toAdd.length > 0 && orgId) {
        const rows = toAdd.map((pid) => ({
          playlist_id: playlist.id,
          player_id: pid,
          organization_id: orgId,
        }));
        const { error: insErr } = await supabase
          .from("playlist_players")
          .insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success("Playlist salva.");
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
      qc.invalidateQueries({ queryKey: ["playlist_players", playlist.id] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar."),
  });

  const addItem = useMutation({
    mutationFn: async (
      input:
        | { kind: "media"; id: string }
        | { kind: "template"; id: string },
    ) => {
      const nextPos =
        items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
      if (input.kind === "media") {
        const media = mediaQ.data?.find((m) => m.id === input.id);
        const isImage = (media?.type ?? "").toLowerCase().startsWith("image");
        const { error } = await supabase.from("playlist_items").insert({
          playlist_id: playlist.id,
          item_type: "media",
          media_file_id: input.id,
          template_id: null,
          position: nextPos,
          duration: isImage ? 10 : null,
          transition: "fade",
        });
        if (error) throw error;
      } else {
        const detected = await detectTemplateDuration(input.id);
        if (detected) toast.success(`Tempo do vídeo detectado: ${detected}s`);
        const { error } = await supabase.from("playlist_items").insert({
          playlist_id: playlist.id,
          item_type: "template",
          media_file_id: null,
          template_id: input.id,
          position: nextPos,
          duration: detected ?? 10,
          transition: "fade",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist_items", playlist.id] });
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao adicionar item."),
  });

  const updateItem = useMutation({
    mutationFn: async (patch: {
      id: string;
      duration?: number | null;
      transition?: string;
    }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from("playlist_items")
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["playlist_items", playlist.id] }),
    onError: (err: any) => toast.error(err?.message || "Falha ao atualizar item."),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playlist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist_items", playlist.id] });
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover item."),
  });

  const reorder = useMutation({
    mutationFn: async (newItems: PlaylistItem[]) => {
      // Atualiza positions em lote
      const updates = newItems.map((it, idx) =>
        supabase
          .from("playlist_items")
          .update({ position: idx })
          .eq("id", it.id),
      );
      const results = await Promise.all(updates);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["playlist_items", playlist.id] }),
    onError: (err: any) => toast.error(err?.message || "Falha ao reordenar."),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorder.mutate(next);
  };

  const availableMedia = useMemo(() => mediaQ.data ?? [], [mediaQ.data]);
  const availableTemplates = useMemo(
    () => templatesQ.data ?? [],
    [templatesQ.data],
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleDay = (d: number) => {
    setScheduleDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  };

  const draftMeta = useMemo<PlaylistDraftMeta | undefined>(() => {
    if (!orgId) return undefined;
    return {
      id: playlist.id,
      organization_id: orgId,
      name: name.trim() || "Sem nome",
      is_active: isActive,
      schedule_start: scheduleStart ? `${scheduleStart}:00` : null,
      schedule_end: scheduleEnd ? `${scheduleEnd}:00` : null,
      schedule_days: scheduleDays.length > 0 ? scheduleDays : null,
    };
  }, [
    orgId,
    playlist.id,
    name,
    isActive,
    scheduleStart,
    scheduleEnd,
    scheduleDays,
  ]);

  const draftItems = useMemo<PlaylistDraftItem[]>(
    () =>
      items.map((it, idx) => ({
        id: it.id,
        playlist_id: it.playlist_id,
        item_type: it.item_type,
        media_file_id: it.media_file_id,
        template_id: it.template_id,
        position: idx,
        duration: it.duration,
        transition: it.transition,
      })),
    [items],
  );

  const draftPayload = usePlaylistDraftPayload(draftMeta, draftItems, open);
  const [previewTab, setPreviewTab] = useState<"player" | "local" | "both">(
    "local",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-hidden rounded-2xl p-0">
        <div className="grid max-h-[92vh] gap-0 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex max-h-[92vh] flex-col overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle>Editar playlist</DialogTitle>
          <DialogDescription>
            Sequência de mídias, transições e agendamento.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Metadados */}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pl-name">Nome</Label>
              <Input
                id="pl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
              <Switch
                id="pl-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={!canManage}
              />
              <Label htmlFor="pl-active" className="cursor-pointer">
                Ativa
              </Label>
            </div>
          </div>

          {/* Agendamento */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="text-sm font-semibold">Agendamento (opcional)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Hora de início</Label>
                <Input
                  type="time"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  disabled={!canManage}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora de término</Label>
                <Input
                  type="time"
                  value={scheduleEnd}
                  onChange={(e) => setScheduleEnd(e.target.value)}
                  disabled={!canManage}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const on = scheduleDays.includes(d.i);
                  return (
                    <button
                      key={d.i}
                      type="button"
                      disabled={!canManage}
                      onClick={() => toggleDay(d.i)}
                      className={`h-9 rounded-xl border px-3 text-xs font-medium transition-colors ${
                        on
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Campanha — intervalo de datas */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Campanha (opcional)</div>
                <p className="text-[11px] text-muted-foreground">
                  Defina o período em que a playlist deve ser exibida. Fora do
                  intervalo, ela é ignorada pelos players.
                </p>
              </div>
              {(dateStart || dateEnd) && canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-xl text-xs"
                  onClick={() => {
                    setDateStart(undefined);
                    setDateEnd(undefined);
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Data de início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canManage}
                      className={cn(
                        "h-10 w-full justify-start rounded-xl text-left font-normal",
                        !dateStart && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateStart
                        ? format(dateStart, "dd 'de' MMM 'de' yyyy", {
                            locale: ptBR,
                          })
                        : "Selecione uma data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto p-0"
                  >
                    <Calendar
                      mode="single"
                      selected={dateStart}
                      onSelect={(d) => {
                        setDateStart(d ?? undefined);
                        if (d && dateEnd && d > dateEnd) setDateEnd(undefined);
                      }}
                      locale={ptBR}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Data de término</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canManage}
                      className={cn(
                        "h-10 w-full justify-start rounded-xl text-left font-normal",
                        !dateEnd && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateEnd
                        ? format(dateEnd, "dd 'de' MMM 'de' yyyy", {
                            locale: ptBR,
                          })
                        : "Selecione uma data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateEnd}
                      onSelect={(d) => setDateEnd(d ?? undefined)}
                      disabled={(d) => (dateStart ? d < dateStart : false)}
                      locale={ptBR}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Players — targeting */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MonitorPlay className="h-4 w-4 text-primary" />
                  Players
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Selecione em quais players esta playlist será reproduzida.
                  Players não selecionados não recebem esta playlist.
                </p>
              </div>
              {canManage && (playersQ.data?.length ?? 0) > 0 && (
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-xl text-xs"
                    onClick={() =>
                      setSelectedPlayerIds(
                        (playersQ.data ?? []).map((p) => p.id),
                      )
                    }
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-xl text-xs"
                    onClick={() => setSelectedPlayerIds([])}
                  >
                    Nenhum
                  </Button>
                </div>
              )}
            </div>

            {playersQ.isLoading || assignedPlayersQ.isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (playersQ.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/40 py-6 text-center text-xs text-muted-foreground">
                Nenhum player cadastrado ainda.
              </div>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {(playersQ.data ?? []).map((p) => {
                  const checked = selectedPlayerIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors",
                          checked
                            ? "border-primary/60 bg-primary/10"
                            : "border-border/60 bg-background/40 hover:border-border",
                          !canManage && "cursor-not-allowed opacity-70",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!canManage}
                          onCheckedChange={(v) => {
                            setSelectedPlayerIds((prev) =>
                              v
                                ? [...prev, p.id]
                                : prev.filter((x) => x !== p.id),
                            );
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {p.orientation === "portrait"
                              ? "Retrato"
                              : "Paisagem"}
                            {" · "}
                            <span
                              className={
                                p.status === "online"
                                  ? "text-emerald-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {p.status === "online" ? "online" : "offline"}
                            </span>
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="text-[11px] text-muted-foreground">
              {selectedPlayerIds.length} de {playersQ.data?.length ?? 0}{" "}
              player(s) selecionado(s).
            </div>
          </div>

          {/* Itens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Itens da playlist</div>
              {canManage && (
                <Button
                  size="sm"
                  className="h-9 rounded-xl"
                  onClick={() => setPickerOpen(true)}
                  disabled={addItem.isPending}
                >
                  {addItem.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Adicionar
                </Button>
              )}
            </div>

            {itemsQ.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 py-10 text-center text-sm text-muted-foreground">
                Nenhum item ainda. Adicione mídias da biblioteca acima.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-2">
                    {items.map((it) => (
                      <SortableItem
                        key={it.id}
                        item={it}
                        canManage={canManage}
                        onDurationChange={(d) =>
                          updateItem.mutate({ id: it.id, duration: d })
                        }
                        onTransitionChange={(t) =>
                          updateItem.mutate({ id: it.id, transition: t })
                        }
                        onRemove={() => removeItem.mutate(it.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <AddItemDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            media={availableMedia}
            templates={availableTemplates}
            loading={addItem.isPending}
            onPickMedia={(id) => {
              addItem.mutate(
                { kind: "media", id },
                { onSuccess: () => setPickerOpen(false) },
              );
            }}
            onPickTemplate={(id) => {
              addItem.mutate(
                { kind: "template", id },
                { onSuccess: () => setPickerOpen(false) },
              );
            }}
          />
        </div>

        <DialogFooter className="mt-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Fechar
          </Button>
          {canManage && (
            <Button
              onClick={() => saveMeta.mutate()}
              disabled={saveMeta.isPending}
              className="rounded-xl"
            >
              {saveMeta.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar playlist
            </Button>
          )}
        </DialogFooter>
          </div>
          <div className="hidden max-h-[92vh] border-l border-border/60 bg-neutral-950/40 p-4 lg:block">
            <div className="flex h-full min-h-[520px] flex-col gap-3">
              <Tabs
                value={previewTab}
                onValueChange={(v) =>
                  setPreviewTab(v as "player" | "local" | "both")
                }
              >
                <TabsList className="grid w-full grid-cols-3 rounded-xl">
                  <TabsTrigger value="local" className="rounded-lg text-xs">
                    Edição
                  </TabsTrigger>
                  <TabsTrigger value="player" className="rounded-lg text-xs">
                    Player
                  </TabsTrigger>
                  <TabsTrigger value="both" className="rounded-lg text-xs">
                    Ambos
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="min-h-0 flex-1">
                {previewTab === "local" && (
                  <PlaylistLocalPreview draft={draftPayload} className="h-full" />
                )}
                {previewTab === "player" && (
                  <PreviewPanel
                    mode="inline"
                    scope="playlist"
                    targetId={playlist.id}
                    draftData={draftPayload}
                    className="h-full"
                  />
                )}
                {previewTab === "both" && (
                  <div className="grid h-full min-h-0 grid-rows-2 gap-3">
                    <PlaylistLocalPreview
                      draft={draftPayload}
                      className="h-full min-h-0"
                    />
                    <PreviewPanel
                      mode="inline"
                      scope="playlist"
                      targetId={playlist.id}
                      draftData={draftPayload}
                      className="h-full min-h-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortableItem({
  item,
  canManage,
  onDurationChange,
  onTransitionChange,
  onRemove,
}: {
  item: PlaylistItem;
  canManage: boolean;
  onDurationChange: (d: number) => void;
  onTransitionChange: (t: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canManage });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isTemplate = item.item_type === "template";
  const kind = (item.media?.type ?? "").toLowerCase();
  const isImage = !isTemplate && kind.startsWith("image");
  const isVideo = !isTemplate && kind.startsWith("video");
  // Template: sempre precisa de duração (como imagem)
  const needsDuration = isImage || isTemplate;
  const [duration, setDuration] = useState<string>(String(item.duration ?? ""));
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    setDuration(String(item.duration ?? ""));
  }, [item.duration]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-2.5 backdrop-blur-xl"
    >
      {canManage && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="grid h-9 w-9 shrink-0 cursor-grab place-items-center rounded-xl text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/50 text-muted-foreground">
        {isTemplate ? (
          <LayoutTemplate className="h-4 w-4" />
        ) : isVideo ? (
          <Video className="h-4 w-4" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {isTemplate
            ? item.template?.name ?? "Template removido"
            : item.media?.name ?? "Mídia removida"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          #{item.position + 1} ·{" "}
          {isTemplate
            ? `template${item.template?.type ? ` (${item.template.type})` : ""}`
            : isVideo
              ? "vídeo"
              : isImage
                ? "imagem"
                : kind || "—"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {needsDuration ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={() => {
                const n = Number(duration);
                if (!n || n < 1) {
                  toast.error("Duração obrigatória.");
                  setDuration(String(item.duration ?? 10));
                  return;
                }
                if (n !== item.duration) onDurationChange(n);
              }}
              disabled={!canManage}
              className="h-9 w-20 rounded-xl text-xs"
            />
            <span className="text-[11px] text-muted-foreground">s</span>
            {isTemplate && canManage && item.template_id && (
              <button
                type="button"
                title="Detectar o tempo do vídeo pelo link"
                aria-label="Detectar o tempo do vídeo pelo link"
                disabled={detecting}
                onClick={async () => {
                  setDetecting(true);
                  try {
                    const d = await detectTemplateDuration(item.template_id as string);
                    if (d) {
                      setDuration(String(d));
                      if (d !== item.duration) onDurationChange(d);
                      toast.success(`Tempo do vídeo detectado: ${d}s`);
                    } else {
                      toast.error("Não foi possível detectar o tempo. Defina manualmente.");
                    }
                  } finally {
                    setDetecting(false);
                  }
                }}
                className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                <Timer className={`h-4 w-4 ${detecting ? "animate-pulse" : ""}`} />
              </button>
            )}
          </div>
        ) : isVideo ? (
          <span className="text-[11px] italic text-muted-foreground">
            duração automática do vídeo
          </span>
        ) : null}
        <Select
          value={item.transition ?? "fade"}
          onValueChange={(value) => {
            if (value === "fade" || value === "cut" || value === "slide") {
              onTransitionChange(value);
            }
          }}
          disabled={!canManage}
        >
          <SelectTrigger className="h-9 w-24 rounded-xl text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="cut">Cut</SelectItem>
            <SelectItem value="slide">Slide</SelectItem>
          </SelectContent>
        </Select>
        {canManage && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function AddItemDialog({
  open,
  onOpenChange,
  media,
  templates,
  loading,
  onPickMedia,
  onPickTemplate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  media: MediaFile[];
  templates: TemplateLite[];
  loading: boolean;
  onPickMedia: (id: string) => void;
  onPickTemplate: (id: string) => void;
}) {
  const [tab, setTab] = useState<"media" | "template">("media");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const filteredMedia = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? media.filter((m) => m.name.toLowerCase().includes(s)) : media;
  }, [media, q]);
  const filteredTemplates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? templates.filter((t) => t.name.toLowerCase().includes(s))
      : templates;
  }, [templates, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[92vw] max-w-lg overflow-hidden rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle>Adicionar à playlist</DialogTitle>
          <DialogDescription>
            Escolha uma mídia ou um template criado no Studio.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "media" | "template")}
          className="mt-2"
        >
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="media" className="rounded-lg">
              Mídia
            </TabsTrigger>
            <TabsTrigger value="template" className="rounded-lg">
              Template
            </TabsTrigger>
          </TabsList>

          <div className="mt-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrar por nome…"
              className="h-9 rounded-xl"
            />
          </div>

          <TabsContent value="media" className="mt-3">
            <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
              {filteredMedia.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mídia encontrada.
                </div>
              ) : (
                filteredMedia.map((m) => {
                  const isVideo = (m.type ?? "").toLowerCase().startsWith("video");
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={loading}
                      onClick={() => onPickMedia(m.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-2.5 text-left transition-colors hover:bg-accent/40 disabled:opacity-60"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                        {isVideo ? (
                          <Video className="h-4 w-4" />
                        ) : (
                          <ImageIcon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {m.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {isVideo ? "vídeo" : "imagem"}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="template" className="mt-3">
            <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
              {filteredTemplates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
                  Nenhum template disponível.
                </div>
              ) : (
                filteredTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={loading}
                    onClick={() => onPickTemplate(t.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-2.5 text-left transition-colors hover:bg-accent/40 disabled:opacity-60"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                      <LayoutTemplate className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        template{t.type ? ` · ${t.type}` : ""}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}