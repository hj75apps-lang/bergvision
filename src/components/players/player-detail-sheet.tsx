import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RadioTower, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { PreviewPanel } from "@/components/preview/preview-panel";
import { PlayerDiagnostics } from "@/components/players/player-diagnostics";

type Player = {
  id: string;
  organization_id: string;
  name: string;
  status: string | null;
  last_heartbeat: string | null;
  resolution: string | null;
  orientation: string | null;
  current_template_id: string | null;
  created_at?: string | null;
};

type TemplateOpt = {
  id: string;
  name: string;
  type: string | null;
  is_system: boolean | null;
};

function formatOrientation(o: string | null | undefined): string {
  if (!o) return "—";
  const v = o.toLowerCase();
  if (v === "landscape" || v === "horizontal") return "Paisagem";
  if (v === "portrait" || v === "vertical") return "Retrato";
  return o;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function orientationToResolutionId(o: string | null | undefined): string {
  const v = (o ?? "").toLowerCase();
  if (v === "portrait" || v === "vertical") return "p-fhd";
  return "fhd";
}

export function PlayerDetailSheet({
  open,
  onOpenChange,
  player,
  online,
  lastHeartbeatLabel,
  templates,
  canManage,
  canEditPlaylists = canManage,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  player: Player;
  online: boolean;
  lastHeartbeatLabel: string;
  templates: TemplateOpt[];
  canManage: boolean;
  canEditPlaylists?: boolean;
  onChanged: () => void;
}) {
  const [savingTpl, setSavingTpl] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const qc = useQueryClient();

  const playlistsQ = useQuery({
    queryKey: ["player-playlists", player.id],
    enabled: open,
    queryFn: async () => {
      const [{ data: pls, error: e1 }, { data: links, error: e2 }] =
        await Promise.all([
          supabase
            .from("playlists")
            .select("id, name, is_active")
            .eq("organization_id", player.organization_id)
            .order("name"),
          supabase
            .from("playlist_players")
            .select("playlist_id")
            .eq("player_id", player.id),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const linked = new Set(
        (links ?? []).map((l: { playlist_id: string }) => l.playlist_id),
      );
      return ((pls ?? []) as Array<{
        id: string;
        name: string;
        is_active: boolean | null;
      }>).map((p) => ({ ...p, linked: linked.has(p.id) }));
    },
  });

  const toggleLink = useMutation({
    mutationFn: async ({ playlistId, on }: { playlistId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("playlist_players").insert({
          playlist_id: playlistId,
          player_id: player.id,
          organization_id: player.organization_id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("playlist_players")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("player_id", player.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["player-playlists", player.id] });
      qc.invalidateQueries({ queryKey: ["playlist_players", v.playlistId] });
      qc.invalidateQueries({ queryKey: ["playlists-list", player.organization_id] });
      qc.invalidateQueries({ queryKey: ["campaigns-list", player.organization_id] });
      qc.invalidateQueries({ queryKey: ["campaigns-targeting", player.organization_id] });
      toast.success(v.on ? "Playlist vinculada ao player." : "Playlist desvinculada.");
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao atualizar playlist."),
  });

  const changeTemplate = async (tplId: string) => {
    setSavingTpl(true);
    try {
      const tpl = templates.find((t) => t.id === tplId);
      const tplType = tpl?.type ?? "grid";

      const { error } = await supabase
        .from("players")
        .update({ current_template_id: tplId })
        .eq("id", player.id);
      if (error) throw error;

      let payload: Record<string, unknown>;
      if (tplType === "canvas") {
        const [{ data: tData, error: tErr }, { data: els, error: eErr }] =
          await Promise.all([
            supabase
              .from("templates")
              .select(
                "id, canvas_width, canvas_height, background_color, background_media_id, scaling_mode, orientation",
              )
              .eq("id", tplId)
              .single(),
            supabase
              .from("template_elements")
              .select(
                "id, element_type, x, y, width, height, rotation, z_index, opacity, locked, visible, content",
              )
              .eq("template_id", tplId)
              .order("z_index"),
          ]);
        if (tErr) throw tErr;
        if (eErr) throw eErr;
        payload = {
          event: "config_updated",
          template_id: tplId,
          template_type: "canvas",
          template: tData,
          elements: els ?? [],
          updated_at: new Date().toISOString(),
          updated_by: null,
        };
      } else {
        const { data: zones, error: zErr } = await supabase
          .from("template_zones")
          .select(
            "id, zone_name, pos_x, pos_y, width_pct, height_pct, z_index, content_type, media_file_id, playlist_id, widget_type, widget_config",
          )
          .eq("template_id", tplId)
          .order("zone_index");
        if (zErr) throw zErr;
        payload = {
          event: "config_updated",
          template_id: tplId,
          template_type: "grid",
          zones: (zones ?? []).map((z: any) => ({
            zone_id: z.id,
            zone_name: z.zone_name,
            pos_x: z.pos_x,
            pos_y: z.pos_y,
            width_pct: z.width_pct,
            height_pct: z.height_pct,
            z_index: z.z_index,
            content_type: z.content_type,
            media_file_id: z.media_file_id,
            playlist_id: z.playlist_id,
            widget_type: z.widget_type,
            widget_config: z.widget_config,
          })),
          updated_at: new Date().toISOString(),
          updated_by: null,
        };
      }

      const channel = supabase.channel(`player:${player.id}`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 5000);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timer);
            reject(new Error(status));
          }
        });
      });
      await channel.send({
        type: "broadcast",
        event: "config_updated",
        payload,
      });
      supabase.removeChannel(channel);

      toast.success("Template atualizado.");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao atualizar template.");
    } finally {
      setSavingTpl(false);
    }
  };

  const identify = async () => {
    setIdentifying(true);
    try {
      const channel = supabase.channel(`player:${player.id}`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 5000);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timer);
            reject(new Error(status));
          }
        });
      });
      const res = await channel.send({
        type: "broadcast",
        event: "command",
        payload: { action: "identify" },
      });
      supabase.removeChannel(channel);
      if (res !== "ok") throw new Error(String(res));
      toast.success(`Sinal enviado para ${player.name}`);
    } catch (err: any) {
      toast.error("Falha ao identificar: " + (err?.message || err));
    } finally {
      setIdentifying(false);
    }
  };

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("players")
        .delete()
        .eq("id", player.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Player removido.");
      onOpenChange(false);
      onChanged();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover."),
  });

  const system = templates.filter((t) => t.is_system);
  const custom = templates.filter((t) => !t.is_system);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[620px]"
      >
        <SheetHeader className="space-y-2 border-b border-border/60 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl">{player.name}</SheetTitle>
              <SheetDescription className="mt-1 flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    online
                      ? "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60"
                      : "bg-red-500"
                  }`}
                />
                {online ? "Online" : "Offline"} · {lastHeartbeatLabel}
              </SheetDescription>
            </div>
            <Badge
              variant="secondary"
              className={`rounded-full text-[10px] ${
                online
                  ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15"
                  : "bg-red-500/15 text-red-500 hover:bg-red-500/15"
              }`}
            >
              {online ? "ONLINE" : "OFFLINE"}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-muted-foreground">Resolução</div>
              <div className="mt-0.5 text-sm font-medium">
                {player.resolution || "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Orientação</div>
              <div className="mt-0.5 text-sm font-medium">
                {formatOrientation(player.orientation)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Pareado em</div>
              <div className="mt-0.5 text-sm font-medium">
                {formatDateTime(player.created_at)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Último heartbeat</div>
              <div className="mt-0.5 text-sm font-medium">
                {formatDateTime(player.last_heartbeat)}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs text-muted-foreground">Template ativo</div>
            <Select
              value={player.current_template_id ?? ""}
              onValueChange={changeTemplate}
              disabled={!canManage || savingTpl}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {system.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Sistema
                    </SelectLabel>
                    {system.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span>{t.name}</span>
                          <Badge
                            variant="secondary"
                            className="rounded-full bg-primary/15 px-1.5 py-0 text-[9px] font-medium text-primary"
                          >
                            Sistema
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {custom.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Personalizado (Studio)
                    </SelectLabel>
                    {custom.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span>{t.name}</span>
                          <Badge
                            variant="secondary"
                            className="rounded-full bg-emerald-500/15 px-1.5 py-0 text-[9px] font-medium text-emerald-500"
                          >
                            Personalizado
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Playlists exibidas neste player
            </div>
            {playlistsQ.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
              </div>
            ) : (playlistsQ.data ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                Nenhuma playlist criada ainda.
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                {(playlistsQ.data ?? []).map((pl) => (
                  <label
                    key={pl.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <Checkbox
                      checked={pl.linked}
                      disabled={!canEditPlaylists || toggleLink.isPending}
                      onCheckedChange={(v) =>
                        toggleLink.mutate({ playlistId: pl.id, on: v === true })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{pl.name}</span>
                    {!pl.is_active && (
                      <Badge variant="secondary" className="rounded-full text-[9px]">
                        Inativa
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Visualização atual
            </div>
            {player.current_template_id ? (
              <div className="aspect-video overflow-hidden rounded-xl">
                <PreviewPanel
                  mode="inline"
                  scope="player"
                  targetId={player.id}
                  defaultResolutionId={orientationToResolutionId(
                    player.orientation,
                  )}
                />
              </div>
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-xs text-muted-foreground">
                Sem template ativo para pré-visualizar.
              </div>
            )}
          </section>

          <PlayerDiagnostics
            playerId={player.id}
            organizationId={player.organization_id}
            canCommand={canManage}
            open={open}
          />
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border/60 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={identify}
            disabled={identifying}
            className="h-9 rounded-xl"
          >
            {identifying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RadioTower className="mr-2 h-4 w-4" />
            )}
            Identificar
          </Button>
          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-xl text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remover
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover player?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {player.name} será desvinculado da sua organização. Você
                    pode parear novamente a qualquer momento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => remove.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}