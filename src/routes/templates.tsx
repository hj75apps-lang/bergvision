import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LayoutTemplate, Settings2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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

type LayoutCSS = {
  gridTemplateRows?: string;
  gridTemplateColumns?: string;
  gap?: string;
  width?: string;
  height?: string;
  display?: string;
};

type Template = {
  id: string;
  name: string;
  slug: string;
  orientation: string | null;
  zone_count: number | null;
  layout_css: LayoutCSS | null;
  is_system: boolean;
};

type ContentType = "empty" | "media" | "playlist" | "widget";
type WidgetType = "clock" | "weather" | "rss" | "text" | "logo";

type Zone = {
  id: string;
  template_id: string;
  zone_index: number;
  zone_name: string;
  grid_area: string;
  content_type: ContentType;
  media_file_id: string | null;
  playlist_id: string | null;
  widget_type: WidgetType | null;
  widget_config: Record<string, any> | null;
};

type MediaOpt = { id: string; name: string; type: string };
type PlaylistOpt = { id: string; name: string };

const PALETTE = [
  "hsl(217 91% 60% / 0.35)",
  "hsl(160 84% 45% / 0.35)",
  "hsl(38 92% 55% / 0.35)",
  "hsl(340 82% 60% / 0.35)",
];

function MiniPreview({ template }: { template: Template }) {
  const css = template.layout_css ?? {};
  const count = template.zone_count ?? 1;
  return (
    <div
      className="h-32 w-full overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-1.5"
      style={{
        display: "grid",
        gap: "4px",
        gridTemplateRows: css.gridTemplateRows ?? "1fr",
        gridTemplateColumns: css.gridTemplateColumns ?? "1fr",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid place-items-center rounded-md text-[10px] font-medium text-foreground/70"
          style={{ background: PALETTE[i % PALETTE.length] }}
        >
          Zona {i + 1}
        </div>
      ))}
    </div>
  );
}

function TemplatesPage() {
  const { membership } = useAuth();
  const role = membership?.role ?? "viewer";
  const canManage = role === "owner" || role === "admin";
  const [configuring, setConfiguring] = useState<Template | null>(null);

  const templatesQ = useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, slug, orientation, zone_count, layout_css, is_system")
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um layout e configure as zonas com mídia, playlist ou widgets.
        </p>
      </header>

      {templatesQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(templatesQ.data ?? []).map((t) => (
            <Card
              key={t.id}
              className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <CardDescription className="mt-0.5 capitalize">
                      {t.orientation === "both"
                        ? "Paisagem/Retrato"
                        : t.orientation === "landscape"
                          ? "Paisagem"
                          : t.orientation === "portrait"
                            ? "Retrato"
                            : t.orientation}
                      {" · "}
                      {t.zone_count} zona{(t.zone_count ?? 0) > 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                  {t.is_system && (
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      SISTEMA
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <MiniPreview template={t} />
              </CardContent>
              <CardFooter className="pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl"
                  disabled={!canManage}
                  onClick={() => setConfiguring(t)}
                >
                  <Settings2 className="mr-2 h-4 w-4" /> Configurar
                </Button>
              </CardFooter>
            </Card>
          ))}
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
          open={!!configuring}
          onOpenChange={(v) => !v && setConfiguring(null)}
        />
      )}
    </div>
  );
}

function ConfigureTemplateDialog({
  template,
  open,
  onOpenChange,
}: {
  template: Template;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const qc = useQueryClient();

  const zonesQ = useQuery({
    queryKey: ["template_zones", template.id],
    enabled: open,
    queryFn: async (): Promise<Zone[]> => {
      const { data, error } = await supabase
        .from("template_zones")
        .select(
          "id, template_id, zone_index, zone_name, grid_area, content_type, media_file_id, playlist_id, widget_type, widget_config",
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl rounded-2xl">
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
          <div className="space-y-4">
            {(zonesQ.data ?? []).map((z) => (
              <ZoneEditor
                key={z.id}
                zone={z}
                media={mediaQ.data ?? []}
                playlists={playlistsQ.data ?? []}
                onSaved={() =>
                  qc.invalidateQueries({ queryKey: ["template_zones", template.id] })
                }
              />
            ))}
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

function ZoneEditor({
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
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{zone.zone_name}</div>
          <div className="text-xs text-muted-foreground">
            grid-area: {zone.grid_area}
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