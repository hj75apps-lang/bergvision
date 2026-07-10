import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Play,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { TemplateCanvas } from "@/components/template/template-canvas";
import { LayoutEditorDialog } from "@/components/template/layout-editor-dialog";
import { PreviewPanel } from "@/components/preview/preview-panel";
import {
  aspectRatioLabel,
  slugify,
  zonesWithReferenceFallback,
  type AspectRatio,
  type ContentType,
  type Template,
  type WidgetType,
  type Zone,
} from "@/lib/template-utils";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates · Berg Vision" },
      {
        name: "description",
        content:
          "Catálogo de templates com zonas configuráveis para mídia, playlist e widgets.",
      },
    ],
  }),
  component: TemplatesPage,
});

type MediaOpt = { id: string; name: string; type: string };
type PlaylistOpt = { id: string; name: string };
type UsageMap = Record<string, number>;

function TemplatesPage() {
  const { membership, user } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canManage = role === "owner" || role === "admin";
  const canConfigureContent = canManage || role === "editor";
  const [configuring, setConfiguring] = useState<Template | null>(null);
  const [editingLayout, setEditingLayout] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const qc = useQueryClient();

  const templatesQ = useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, name, slug, orientation, zone_count, is_system, organization_id, aspect_ratio, canvas_width, canvas_height, allow_overlap, thumbnail_url",
        )
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  // For each template card we need to render a real preview using zones with
  // percentages, so fetch them all in one query and group by template.
  const templateIds = (templatesQ.data ?? []).map((t) => t.id);
  const zonesAllQ = useQuery({
    queryKey: ["template_zones_all", templateIds.join(",")],
    enabled: templateIds.length > 0,
    queryFn: async (): Promise<Zone[]> => {
      const { data, error } = await supabase
        .from("template_zones")
        .select(
          "id, template_id, zone_index, zone_name, grid_area, pos_x, pos_y, width_pct, height_pct, z_index, content_type, media_file_id, playlist_id, widget_type, widget_config",
        )
        .in("template_id", templateIds)
        .order("zone_index");
      if (error) throw error;
      return (data ?? []) as Zone[];
    },
  });

  const zonesByTemplate = useMemo(() => {
    const map = new Map<string, Zone[]>();
    for (const z of zonesAllQ.data ?? []) {
      const arr = map.get(z.template_id) ?? [];
      arr.push(z);
      map.set(z.template_id, arr);
    }
    return map;
  }, [zonesAllQ.data]);

  // Count how many players use each template — for the "usado por N" badge
  // and to block deletion when > 0.
  const usageQ = useQuery({
    queryKey: ["template_usage", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<UsageMap> => {
      const { data, error } = await supabase
        .from("players")
        .select("current_template_id")
        .eq("organization_id", orgId!)
        .not("current_template_id", "is", null);
      if (error) throw error;
      const m: UsageMap = {};
      for (const row of data ?? []) {
        const id = (row as any).current_template_id as string;
        m[id] = (m[id] ?? 0) + 1;
      }
      return m;
    },
  });

  const duplicate = useMutation({
    mutationFn: async (src: Template) => {
      if (!orgId) throw new Error("Organização ausente.");
      const zones = zonesWithReferenceFallback(src, zonesByTemplate.get(src.id) ?? []);
      const { data: created, error } = await supabase
        .from("templates")
        .insert({
          name: `${src.name} (cópia)`,
          slug: `${slugify(src.name)}-${Math.random().toString(36).slice(2, 6)}`,
          orientation: src.orientation ?? "landscape",
          zone_count: zones.length,
          is_system: false,
          organization_id: orgId,
          created_by: user?.id ?? null,
          aspect_ratio: src.aspect_ratio,
          canvas_width: src.canvas_width,
          canvas_height: src.canvas_height,
          allow_overlap: src.allow_overlap,
          layout_css: (src as any).layout_css ?? "{}",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (zones.length > 0) {
        const rows = zones.map((z, i) => ({
          template_id: (created as any).id,
          zone_index: i,
          zone_name: z.zone_name,
          pos_x: z.pos_x ?? 0,
          pos_y: z.pos_y ?? 0,
          width_pct: z.width_pct ?? 100,
          height_pct: z.height_pct ?? 100,
          z_index: z.z_index ?? 0,
          content_type: z.content_type,
          media_file_id: z.media_file_id,
          playlist_id: z.playlist_id,
          widget_type: z.widget_type,
          widget_config: z.widget_config,
        }));
        const { error: zErr } = await supabase.from("template_zones").insert(rows);
        if (zErr) throw zErr;
      }
    },
    onSuccess: () => {
      toast.success("Template duplicado.");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao duplicar."),
  });

  const remove = useMutation({
    mutationFn: async (t: Template) => {
      if ((usageQ.data?.[t.id] ?? 0) > 0)
        throw new Error("Template em uso por players. Reatribua-os antes.");
      const { error } = await supabase.from("templates").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template excluído.");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao excluir."),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Templates do sistema e personalizados da sua organização.
          </p>
        </div>
        {canManage && (
          <Button className="rounded-xl" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo template
          </Button>
        )}
      </header>

      {templatesQ.isLoading ? (
        <GridSkeleton count={6} heightClass="h-64" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(templatesQ.data ?? []).map((t) => {
            const zones = zonesByTemplate.get(t.id) ?? [];
            const usage = usageQ.data?.[t.id] ?? 0;
            return (
              <Card
                key={t.id}
                className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{t.name}</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {aspectRatioLabel(t)} · {zones.length} zona
                        {zones.length !== 1 ? "s" : ""}
                        {usage > 0 && ` · usado por ${usage} player${usage !== 1 ? "s" : ""}`}
                      </CardDescription>
                    </div>
                    {t.is_system ? (
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        SISTEMA
                      </Badge>
                    ) : (
                      <Badge className="rounded-full bg-primary/20 text-[10px] text-primary">
                        MEU
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <TemplateCanvas template={t} zones={zones} mode="preview" showLabels={false} />
                </CardContent>
                <CardFooter className="flex-wrap gap-2 pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={role === "viewer"}
                    onClick={() => setPreviewing(t)}
                    title={role === "viewer" ? "Sem permissão para gerar preview" : "Preview"}
                  >
                    <Play className="mr-1.5 h-4 w-4" /> Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-xl"
                    disabled={!canConfigureContent}
                    onClick={() => setConfiguring(t)}
                  >
                    <Settings2 className="mr-1.5 h-4 w-4" /> Conteúdo
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl"
                        title="Duplicar"
                        onClick={() => duplicate.mutate(t)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {!t.is_system && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-xl"
                            title="Editar layout"
                            onClick={() => setEditingLayout(t)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-xl text-red-500 hover:text-red-500"
                            title="Excluir"
                            onClick={() => setDeleting(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </CardFooter>
              </Card>
            );
          })}
          {(templatesQ.data ?? []).length === 0 && (
            <Card className="col-span-full rounded-2xl border-dashed border-border/60 bg-card/40">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <LayoutTemplate className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">Sem templates disponíveis</h2>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {configuring && (
        <ConfigureTemplateDialog
          template={configuring}
          zones={zonesByTemplate.get(configuring.id) ?? []}
          open={!!configuring}
          onOpenChange={(v) => !v && setConfiguring(null)}
        />
      )}

      {editingLayout && (
        <LayoutEditorDialog
          template={editingLayout}
          initialZones={zonesByTemplate.get(editingLayout.id) ?? []}
          open={!!editingLayout}
          onOpenChange={(v) => !v && setEditingLayout(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["template_zones_all"] });
          }}
        />
      )}

      {creating && orgId && (
        <CreateTemplateDialog
          orgId={orgId}
          userId={user?.id ?? null}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(id) => {
            const t = (templatesQ.data ?? []).find((x) => x.id === id);
            if (t) setEditingLayout(t);
          }}
        />
      )}

      {previewing && (
        <PreviewPanel
          mode="modal"
          scope="template"
          targetId={previewing.id}
          open={!!previewing}
          onOpenChange={(v) => !v && setPreviewing(null)}
        />
      )}

      {deleting && (
        <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir template?</AlertDialogTitle>
              <AlertDialogDescription>
                {(usageQ.data?.[deleting.id] ?? 0) > 0
                  ? `Este template está em uso por ${usageQ.data?.[deleting.id]} player(s). Reatribua-os antes de excluir.`
                  : `"${deleting.name}" será removido permanentemente, junto com suas zonas.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={(usageQ.data?.[deleting.id] ?? 0) > 0}
                className="rounded-xl bg-red-600 hover:bg-red-500"
                onClick={() => {
                  const t = deleting;
                  setDeleting(null);
                  remove.mutate(t);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function CreateTemplateDialog({
  orgId,
  userId,
  open,
  onOpenChange,
  onCreated,
}: {
  orgId: string;
  userId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);

  useEffect(() => {
    if (open) {
      setName("");
      setAspect("16:9");
      setW(1920);
      setH(1080);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe um nome.");
      const { data, error } = await supabase
        .from("templates")
        .insert({
          name: name.trim(),
          slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
          orientation: aspect === "9:16" ? "portrait" : "landscape",
          zone_count: 1,
          is_system: false,
          organization_id: orgId,
          created_by: userId,
          aspect_ratio: aspect,
          canvas_width: w,
          canvas_height: h,
          allow_overlap: false,
          layout_css: "{}",
        })
        .select("id")
        .single();
      if (error) throw error;
      // Seed a single fullscreen zone so the editor opens on something usable.
      const { error: zErr } = await supabase.from("template_zones").insert({
        template_id: (data as any).id,
        zone_index: 0,
        zone_name: "Zona 1",
        pos_x: 0,
        pos_y: 0,
        width_pct: 100,
        height_pct: 100,
        z_index: 0,
        content_type: "empty",
      });
      if (zErr) throw zErr;
      return (data as any).id as string;
    },
    onSuccess: async (id) => {
      toast.success("Template criado. Abra o editor para desenhar zonas.");
      await qc.invalidateQueries({ queryKey: ["templates"] });
      onOpenChange(false);
      onCreated(id);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao criar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
          <DialogDescription>
            Defina o formato inicial. Você desenha as zonas em seguida.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              className="h-10 rounded-xl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Home Store"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Aspect ratio</Label>
            <Select value={aspect} onValueChange={(v) => setAspect(v as AspectRatio)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 · Paisagem TV</SelectItem>
                <SelectItem value="9:16">9:16 · Retrato / totem</SelectItem>
                <SelectItem value="4:3">4:3</SelectItem>
                <SelectItem value="21:9">21:9 · Ultra-wide</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {aspect === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Largura (px)</Label>
                <Input
                  type="number"
                  min={100}
                  className="h-10 rounded-xl"
                  value={w}
                  onChange={(e) => setW(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Altura (px)</Label>
                <Input
                  type="number"
                  min={100}
                  className="h-10 rounded-xl"
                  value={h}
                  onChange={(e) => setH(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="rounded-xl"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar e abrir editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigureTemplateDialog({
  template,
  zones,
  open,
  onOpenChange,
}: {
  template: Template;
  zones: Zone[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(zones[0]?.id ?? null);

  const zonesQ = useQuery({
    queryKey: ["template_zones", template.id],
    enabled: open,
    initialData: zones,
    queryFn: async (): Promise<Zone[]> => {
      const { data, error } = await supabase
        .from("template_zones")
        .select(
          "id, template_id, zone_index, zone_name, grid_area, pos_x, pos_y, width_pct, height_pct, z_index, content_type, media_file_id, playlist_id, widget_type, widget_config",
        )
        .eq("template_id", template.id)
        .order("zone_index");
      if (error) throw error;
      return (data ?? []) as Zone[];
    },
  });

  const mediaQ = useQuery({
    queryKey: ["media_files", orgId, "all"],
    enabled: open && !!orgId,
    queryFn: async (): Promise<MediaOpt[]> => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, name, type")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MediaOpt[];
    },
  });

  const playlistsQ = useQuery({
    queryKey: ["playlists", orgId],
    enabled: open && !!orgId,
    queryFn: async (): Promise<PlaylistOpt[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PlaylistOpt[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configurar · {template.name}</DialogTitle>
          <DialogDescription>
            Defina o conteúdo de cada zona deste template.
          </DialogDescription>
        </DialogHeader>

        {zonesQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <TemplateCanvas
                template={template}
                zones={zonesQ.data ?? []}
                mode="highlight"
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Clique em uma zona para configurar seu conteúdo.
              </p>
            </div>
            <div className="space-y-3 overflow-y-auto">
              {(zonesQ.data ?? []).map((z) => (
                <div
                  key={z.id}
                  className={
                    "rounded-2xl border p-3 transition-colors " +
                    (selectedId === z.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 bg-card/40")
                  }
                  onClick={() => setSelectedId(z.id)}
                >
                  <ZoneContentEditor
                    zone={z}
                    media={mediaQ.data ?? []}
                    playlists={playlistsQ.data ?? []}
                    onSaved={() =>
                      qc.invalidateQueries({ queryKey: ["template_zones", template.id] })
                    }
                  />
                </div>
              ))}
              {(zonesQ.data ?? []).length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  Este template ainda não tem zonas.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoneContentEditor({
  zone,
  media,
  playlists,
  onSaved,
}: {
  zone: Zone;
  media: MediaOpt[];
  playlists: PlaylistOpt[];
  onSaved: () => void;
}) {
  const [contentType, setContentType] = useState<ContentType>(zone.content_type);
  const [mediaId, setMediaId] = useState<string | null>(zone.media_file_id);
  const [playlistId, setPlaylistId] = useState<string | null>(zone.playlist_id);
  const [widgetType, setWidgetType] = useState<WidgetType | null>(zone.widget_type);
  const [widgetConfig, setWidgetConfig] = useState<Record<string, any>>(
    zone.widget_config ?? {},
  );

  useEffect(() => {
    setContentType(zone.content_type);
    setMediaId(zone.media_file_id);
    setPlaylistId(zone.playlist_id);
    setWidgetType(zone.widget_type);
    setWidgetConfig(zone.widget_config ?? {});
  }, [zone.id]);

  const imageMedia = useMemo(
    () => media.filter((m) => (m.type ?? "").toLowerCase().startsWith("image")),
    [media],
  );

  const save = useMutation({
    mutationFn: async () => {
      const filled = [
        contentType === "media" && !!mediaId,
        contentType === "playlist" && !!playlistId,
        contentType === "widget" && !!widgetType,
        contentType === "empty",
      ].filter(Boolean).length;
      if (filled !== 1) {
        throw new Error(
          "Preencha exatamente uma opção (mídia, playlist ou widget) para a zona.",
        );
      }
      const payload = {
        content_type: contentType,
        media_file_id: contentType === "media" ? mediaId : null,
        playlist_id: contentType === "playlist" ? playlistId : null,
        widget_type: contentType === "widget" ? widgetType : null,
        widget_config: contentType === "widget" ? widgetConfig : null,
      };
      const { error } = await supabase
        .from("template_zones")
        .update(payload)
        .eq("id", zone.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Zona "${zone.zone_name}" atualizada.`);
      onSaved();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar zona."),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{zone.zone_name}</div>
          <div className="text-xs text-muted-foreground">
            {Math.round(zone.width_pct ?? 0)}% × {Math.round(zone.height_pct ?? 0)}%
          </div>
        </div>
        <Badge variant="outline" className="rounded-full text-[10px]">
          #{zone.zone_index + 1}
        </Badge>
      </div>

      <div className="space-y-2">
        <Label>Tipo de conteúdo</Label>
        <Select
          value={contentType}
          onValueChange={(v) => setContentType(v as ContentType)}
        >
          <SelectTrigger className="h-10 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="empty">Vazio</SelectItem>
            <SelectItem value="media">Mídia fixa</SelectItem>
            <SelectItem value="playlist">Playlist</SelectItem>
            <SelectItem value="widget">Widget</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {contentType === "media" && (
        <div className="space-y-2">
          <Label>Mídia</Label>
          <Select value={mediaId ?? ""} onValueChange={(v) => setMediaId(v || null)}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Selecione uma mídia" />
            </SelectTrigger>
            <SelectContent>
              {media.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">
                  Nenhuma mídia disponível.
                </div>
              )}
              {media.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {contentType === "playlist" && (
        <div className="space-y-2">
          <Label>Playlist</Label>
          <Select
            value={playlistId ?? ""}
            onValueChange={(v) => setPlaylistId(v || null)}
            disabled={playlists.length === 0}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue
                placeholder={
                  playlists.length === 0
                    ? "Nenhuma playlist criada ainda"
                    : "Selecione uma playlist"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {playlists.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {contentType === "widget" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Widget</Label>
            <Select
              value={widgetType ?? ""}
              onValueChange={(v) => {
                setWidgetType(v as WidgetType);
                setWidgetConfig({});
              }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Selecione um widget" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clock">Relógio</SelectItem>
                <SelectItem value="weather">Clima</SelectItem>
                <SelectItem value="rss">Feed RSS (ticker)</SelectItem>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="logo">Logo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {widgetType && (
            <WidgetConfigForm
              type={widgetType}
              config={widgetConfig}
              onChange={setWidgetConfig}
              images={imageMedia}
            />
          )}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          className="rounded-xl"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar zona
        </Button>
      </div>
    </div>
  );
}

function WidgetConfigForm({
  type,
  config,
  onChange,
  images,
}: {
  type: WidgetType;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
  images: MediaOpt[];
}) {
  const set = (k: string, v: any) => onChange({ ...config, [k]: v });

  if (type === "clock") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Formato</Label>
          <Select
            value={config.format ?? "HH:mm"}
            onValueChange={(v) => set("format", v)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HH:mm">24h (HH:mm)</SelectItem>
              <SelectItem value="HH:mm:ss">24h com segundos</SelectItem>
              <SelectItem value="hh:mm a">12h (hh:mm AM/PM)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Input
            className="h-10 rounded-xl"
            placeholder="America/Sao_Paulo"
            value={config.timezone ?? ""}
            onChange={(e) => set("timezone", e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="show-date"
            checked={!!config.show_date}
            onCheckedChange={(v) => set("show_date", !!v)}
          />
          <Label htmlFor="show-date" className="cursor-pointer">
            Mostrar data
          </Label>
        </div>
      </div>
    );
  }

  if (type === "weather") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cidade</Label>
          <Input
            className="h-10 rounded-xl"
            placeholder="São Paulo"
            value={config.city ?? ""}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unidade</Label>
          <Select
            value={config.units ?? "metric"}
            onValueChange={(v) => set("units", v)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="metric">Métrico (°C)</SelectItem>
              <SelectItem value="imperial">Imperial (°F)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (type === "rss") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>URL do feed</Label>
          <Input
            className="h-10 rounded-xl"
            placeholder="https://exemplo.com/feed.xml"
            value={config.feed_url ?? ""}
            onChange={(e) => set("feed_url", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Velocidade (px/s)</Label>
          <Input
            type="number"
            min={10}
            className="h-10 rounded-xl"
            value={config.speed ?? 60}
            onChange={(e) => set("speed", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Máx. de itens</Label>
          <Input
            type="number"
            min={1}
            className="h-10 rounded-xl"
            value={config.max_items ?? 10}
            onChange={(e) => set("max_items", Number(e.target.value))}
          />
        </div>
      </div>
    );
  }

  if (type === "text") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Conteúdo</Label>
          <Textarea
            className="rounded-xl"
            rows={3}
            value={config.content ?? ""}
            onChange={(e) => set("content", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tamanho da fonte (px)</Label>
          <Input
            type="number"
            min={8}
            className="h-10 rounded-xl"
            value={config.font_size ?? 32}
            onChange={(e) => set("font_size", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Cor do texto</Label>
          <Input
            type="color"
            className="h-10 w-full rounded-xl"
            value={config.text_color ?? "#ffffff"}
            onChange={(e) => set("text_color", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Cor de fundo</Label>
          <Input
            type="color"
            className="h-10 w-full rounded-xl"
            value={config.background_color ?? "#000000"}
            onChange={(e) => set("background_color", e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (type === "logo") {
    return (
      <div className="space-y-1.5">
        <Label>Imagem</Label>
        <Select
          value={config.media_file_id ?? ""}
          onValueChange={(v) => set("media_file_id", v)}
        >
          <SelectTrigger className="h-10 rounded-xl">
            <SelectValue
              placeholder={
                images.length === 0
                  ? "Envie uma imagem na Biblioteca"
                  : "Selecione uma imagem"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {images.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return null;
}