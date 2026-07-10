import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  Play,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

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
  component: PlaylistsPage,
});

type Playlist = {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: number[] | null;
  created_at: string | null;
  items_count?: { count: number }[];
};

type MediaKind = "image" | "video" | string;

type MediaFile = {
  id: string;
  name: string;
  type: MediaKind;
};

type PlaylistItem = {
  id: string;
  playlist_id: string;
  media_file_id: string;
  position: number;
  duration: number | null;
  transition: string | null;
  media?: MediaFile | null;
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
          "id, organization_id, name, is_active, schedule_start, schedule_end, schedule_days, created_at, items_count:playlist_items(count)",
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

function PlaylistEditor({
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

  useEffect(() => {
    setName(playlist.name);
    setIsActive(playlist.is_active);
    setScheduleStart(playlist.schedule_start?.slice(0, 5) ?? "");
    setScheduleEnd(playlist.schedule_end?.slice(0, 5) ?? "");
    setScheduleDays(playlist.schedule_days ?? []);
  }, [playlist.id]);

  const itemsQ = useQuery({
    queryKey: ["playlist_items", playlist.id],
    enabled: open,
    queryFn: async (): Promise<PlaylistItem[]> => {
      const { data, error } = await supabase
        .from("playlist_items")
        .select(
          "id, playlist_id, media_file_id, position, duration, transition, media:media_files(id, name, type)",
        )
        .eq("playlist_id", playlist.id)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        media: Array.isArray(r.media) ? r.media[0] : r.media,
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
      };
      const { error } = await supabase
        .from("playlists")
        .update(payload)
        .eq("id", playlist.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Playlist salva.");
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar."),
  });

  const addItem = useMutation({
    mutationFn: async (mediaId: string) => {
      const media = mediaQ.data?.find((m) => m.id === mediaId);
      const isImage = (media?.type ?? "").toLowerCase().startsWith("image");
      const nextPos =
        items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
      const { error } = await supabase.from("playlist_items").insert({
        playlist_id: playlist.id,
        media_file_id: mediaId,
        position: nextPos,
        duration: isImage ? 10 : null,
        transition: "fade",
      });
      if (error) throw error;
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
  const [addMediaId, setAddMediaId] = useState<string>("");

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
        media_file_id: it.media_file_id,
        position: idx,
        duration: it.duration,
        transition: it.transition,
      })),
    [items],
  );

  const draftPayload = usePlaylistDraftPayload(draftMeta, draftItems, open);

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

          {/* Itens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Itens da playlist</div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <Select value={addMediaId} onValueChange={setAddMediaId}>
                    <SelectTrigger className="h-9 w-48 rounded-xl text-xs">
                      <SelectValue
                        placeholder={
                          availableMedia.length === 0
                            ? "Sem mídias"
                            : "Selecionar mídia"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMedia.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-9 rounded-xl"
                    disabled={!addMediaId || addItem.isPending}
                    onClick={() => {
                      addItem.mutate(addMediaId);
                      setAddMediaId("");
                    }}
                  >
                    {addItem.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Adicionar
                  </Button>
                </div>
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
            <div className="h-full min-h-[520px]">
              <PreviewPanel
                mode="inline"
                scope="playlist"
                targetId={playlist.id}
                draftData={draftPayload}
                className="h-full"
              />
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

  const kind = (item.media?.type ?? "").toLowerCase();
  const isImage = kind.startsWith("image");
  const isVideo = kind.startsWith("video");
  const [duration, setDuration] = useState<string>(String(item.duration ?? ""));

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
        {isVideo ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {item.media?.name ?? "Mídia removida"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          #{item.position + 1} · {isVideo ? "vídeo" : isImage ? "imagem" : kind || "—"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isImage ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={() => {
                const n = Number(duration);
                if (!n || n < 1) {
                  toast.error("Duração obrigatória para imagens.");
                  setDuration(String(item.duration ?? 10));
                  return;
                }
                if (n !== item.duration) onDurationChange(n);
              }}
              disabled={!canManage}
              className="h-9 w-20 rounded-xl text-xs"
            />
            <span className="text-[11px] text-muted-foreground">s</span>
          </div>
        ) : isVideo ? (
          <span className="text-[11px] italic text-muted-foreground">
            duração automática do vídeo
          </span>
        ) : null}
        <Select
          value={item.transition ?? "fade"}
          onValueChange={onTransitionChange}
          disabled={!canManage}
        >
          <SelectTrigger className="h-9 w-24 rounded-xl text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide">Slide</SelectItem>
            <SelectItem value="cut">Cut</SelectItem>
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