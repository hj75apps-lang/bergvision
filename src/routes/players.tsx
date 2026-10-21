import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, MonitorPlay, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { PlayerDetailSheet } from "@/components/players/player-detail-sheet";

export const Route = createFileRoute("/players")({
  head: () => ({
    meta: [
      { title: "Players · Berg Vision" },
      {
        name: "description",
        content:
          "Gerencie os players da sua rede Berg Vision: pareamento, status e monitoramento em tempo real.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { status?: "online" | "offline" } =>
    s.status === "online" || s.status === "offline" ? { status: s.status } : {},
  component: PlayersPage,
});

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

const HEARTBEAT_OFFLINE_MS = 60_000;

function isOnline(p: Player, nowMs: number): boolean {
  if (!p.last_heartbeat) return false;
  const last = new Date(p.last_heartbeat).getTime();
  if (Number.isNaN(last)) return false;
  if (nowMs - last > HEARTBEAT_OFFLINE_MS) return false;
  return (p.status ?? "").toLowerCase() === "online";
}

function formatOrientation(o: string | null | undefined): string {
  if (!o) return "—";
  const v = o.toLowerCase();
  if (v === "landscape" || v === "horizontal") return "Paisagem";
  if (v === "portrait" || v === "vertical") return "Retrato";
  return o;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "nunca";
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function PlayersPage() {
  const { status: statusFilter } = Route.useSearch();
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canManage = role === "owner" || role === "admin";
  const qc = useQueryClient();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pairOpen, setPairOpen] = useState(false);

  // Tick para re-avaliar status offline (last_heartbeat > 60s).
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const playersQ = useQuery({
    queryKey: ["players", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from("players")
        .select(
          "id, organization_id, name, status, last_heartbeat, resolution, orientation, current_template_id, created_at",
        )
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });

  const templatesQ = useQuery({
    queryKey: ["templates-opts"],
    queryFn: async (): Promise<TemplateOpt[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, type, is_system")
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as TemplateOpt[];
    },
  });

  // Realtime: quando players da org mudam (heartbeat, status), revalida.
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org:${orgId}:players`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["players", orgId] });
          qc.invalidateQueries({ queryKey: ["players-for-playlist", orgId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  const refreshPlayers = () => {
    qc.invalidateQueries({ queryKey: ["players", orgId] });
    qc.invalidateQueries({ queryKey: ["players-for-playlist", orgId] });
    qc.invalidateQueries({ queryKey: ["players-count", orgId] });
    qc.invalidateQueries({ queryKey: ["campaigns-targeting", orgId] });
  };

  const allPlayers = playersQ.data ?? [];
  const onlineCount = useMemo(
    () => allPlayers.filter((p) => isOnline(p, nowMs)).length,
    [allPlayers, nowMs],
  );
  const players = useMemo(
    () =>
      statusFilter === "online"
        ? allPlayers.filter((p) => isOnline(p, nowMs))
        : statusFilter === "offline"
          ? allPlayers.filter((p) => !isOnline(p, nowMs))
          : allPlayers,
    [allPlayers, statusFilter, nowMs],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
          <p className="text-sm text-muted-foreground">
            {allPlayers.length} player(s) · {onlineCount} online agora
          </p>
        </div>
        <Button
          onClick={() => setPairOpen(true)}
          className="h-10 rounded-xl"
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar player
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {([
          { key: undefined, label: "Todos" },
          { key: "online", label: "Online" },
          { key: "offline", label: "Offline" },
        ] as const).map((f) => (
          <Link
            key={f.label}
            to="/players"
            search={f.key ? { status: f.key } : {}}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {playersQ.isLoading ? (
        <GridSkeleton count={6} heightClass="h-48" />
      ) : allPlayers.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border/60 bg-card/40 backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
              <MonitorPlay className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Nenhum player pareado</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Abra o app do player, gere um PIN de 6 dígitos e clique em
              &ldquo;Adicionar player&rdquo; para parear.
            </p>
            <Button onClick={() => setPairOpen(true)} className="mt-2 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> Adicionar player
            </Button>
          </CardContent>
        </Card>
      ) : players.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum player {statusFilter} no momento.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              nowMs={nowMs}
              canManage={canManage}
              templates={templatesQ.data ?? []}
              onChanged={refreshPlayers}
            />
          ))}
        </div>
      )}

      <PairDialog
        open={pairOpen}
        onOpenChange={setPairOpen}
        onPaired={refreshPlayers}
      />
    </div>
  );
}

function PlayerCard({
  player,
  nowMs,
  canManage,
  templates,
  onChanged,
}: {
  player: Player;
  nowMs: number;
  canManage: boolean;
  templates: TemplateOpt[];
  onChanged: () => void;
}) {
  const online = isOnline(player, nowMs);
  const [detailOpen, setDetailOpen] = useState(false);
  const currentTpl = templates.find((t) => t.id === player.current_template_id);
  const lastLabel = formatRelative(player.last_heartbeat);

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl transition-all hover:border-border hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{player.name}</CardTitle>
              <CardDescription className="mt-1 flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    online
                      ? "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60"
                      : "bg-red-500"
                  }`}
                />
                {online ? "Online" : "Offline"} · {lastLabel}
              </CardDescription>
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
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pb-5 text-xs">
          <div>
            <div className="text-muted-foreground">Resolução</div>
            <div className="mt-0.5 font-medium">{player.resolution || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Orientação</div>
            <div className="mt-0.5 font-medium">
              {formatOrientation(player.orientation)}
            </div>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
            <div className="min-w-0">
              <div className="text-muted-foreground">Template ativo</div>
              <div className="mt-0.5 truncate font-medium">
                {currentTpl?.name ?? "—"}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
      <PlayerDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        player={player}
        online={online}
        lastHeartbeatLabel={lastLabel}
        templates={templates}
        canManage={canManage}
        onChanged={onChanged}
      />
    </>
  );
}

function PairDialog({
  open,
  onOpenChange,
  onPaired,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPaired: () => void;
}) {
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setName("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) {
      toast.error("Informe o PIN de 6 dígitos exibido no player.");
      return;
    }
    if (!name.trim()) {
      toast.error("Dê um nome para o player.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirm-pairing", {
        body: {
          // Enviamos aliases porque a Edge Function pode aceitar qualquer um destes nomes.
          pin_code: pin,
          pairing_code: pin,
          code: pin,
          name: name.trim(),
          player_name: name.trim(),
        },
      });
      if (error) {
        // Tenta extrair mensagem detalhada da resposta
        let detail = "";
        let status: number | undefined;
        try {
          const ctx = (error as any).context;
          status = ctx?.status;
          if (ctx?.json) detail = (await ctx.json())?.error ?? "";
          else if (ctx?.text) detail = await ctx.text();
        } catch {
          /* noop */
        }
        const msg = (detail || error.message || "").toString().toLowerCase();
        if (status === 404 || msg.includes("not_found") && msg.includes("function")) {
          throw new Error(
            "Edge Function 'confirm-pairing' não está publicada no Supabase. Faça o deploy com `supabase functions deploy confirm-pairing` (ou peça ao administrador do backend).",
          );
        }
        if (msg.includes("expired")) {
          throw new Error("Este PIN expirou. Gere um novo no player.");
        }
        if (msg.includes("used") || msg.includes("already")) {
          throw new Error("Este PIN já foi utilizado.");
        }
        if (msg.includes("invalid") || msg.includes("not found")) {
          throw new Error("PIN inválido. Verifique os 6 dígitos.");
        }
        throw new Error(detail || error.message);
      }
      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }
      toast.success("Player pareado com sucesso!");
      onOpenChange(false);
      onPaired();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao parear player.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar player</DialogTitle>
          <DialogDescription>
            Digite o PIN de 6 dígitos exibido na tela do player e dê a ele um nome.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label>PIN de pareamento</Label>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={pin} onChange={setPin}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="player-name">Nome do player</Label>
            <Input
              id="player-name"
              required
              placeholder="Ex.: Recepção — TV 55"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="rounded-xl">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Parear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}