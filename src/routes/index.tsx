import { isPlayerOnline } from "@/lib/player-status";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  MonitorPlay,
  Signal,
  SignalZero,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/")({
  head: () => (
    {
      meta: [
        { title: "Berg Vision" },
        {
          name: "description",
          content:
            "Visão geral da sua rede de mídia indoor: players, agendamentos e desempenho em tempo real.",
        },
      ],
    }
  ),
  component: DashboardPage,
});

type Player = {
  id: string;
  organization_id: string;
  name: string;
  status: string | null;
  last_heartbeat: string | null;
  resolution: string | null;
  orientation: string | null;
  created_at?: string | null;
};

type PlaylistRow = {
  id: string;
  name: string;
  is_active: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_date_start: string | null;
  schedule_date_end: string | null;
  created_at: string | null;
};

function isOnline(p: Player, nowMs: number): boolean {
  return isPlayerOnline(p, nowMs);
}

function DashboardPage() {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const playersQ = useQuery({
    queryKey: ["dashboard-players", orgId],
    refetchInterval: 30_000,
    enabled: !!orgId,
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from("players")
        .select("id, organization_id, name, status, last_heartbeat, resolution, orientation, created_at")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });

  const playlistsQ = useQuery({
    queryKey: ["dashboard-playlists", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PlaylistRow[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select("id, name, is_active, schedule_start, schedule_end, schedule_date_start, schedule_date_end, created_at")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlaylistRow[];
    },
  });

  const players = playersQ.data ?? [];
  const playlists = playlistsQ.data ?? [];

  const totalPlayers = players.length;
  const onlinePlayers = useMemo(
    () => players.filter((p) => isOnline(p, nowMs)).length,
    [players, nowMs],
  );
  const offlinePlayers = Math.max(0, totalPlayers - onlinePlayers);

  // Próximos agendamentos: playlists ativas com horário ou data
  const upcoming = useMemo(() => {
    const now = new Date();
    return playlists
      .filter((pl) => pl.is_active)
      .slice(0, 5)
      .map((pl) => {
        let when = "Programação contínua";
        if (pl.schedule_start) {
          when = `Diariamente às ${pl.schedule_start.slice(0, 5)}`;
        } else if (pl.schedule_date_start) {
          try {
            when = `Início em ${format(parseISO(pl.schedule_date_start), "dd/MM/yyyy", { locale: ptBR })}`;
          } catch {
            when = pl.schedule_date_start;
          }
        }
        return {
          id: pl.id,
          title: pl.name,
          when,
          tag: pl.schedule_start ? "Horário" : pl.schedule_date_start ? "Campanha" : "Playlist",
        };
      });
  }, [playlists]);

  const stats = [
    {
      label: "Total de players",
      value: totalPlayers.toString(),
      hint: `${onlinePlayers} conectados agora`,
      icon: MonitorPlay,
      tone: "primary" as const,
      link: { to: "/players" as const, search: {} },
    },
    {
      label: "Players online",
      value: onlinePlayers.toString(),
      hint: totalPlayers > 0 ? `${Math.round((onlinePlayers / totalPlayers) * 100)}% da rede conectada` : "0% da rede",
      icon: Signal,
      tone: "success" as const,
      link: { to: "/players" as const, search: { status: "online" as const } },
    },
    {
      label: "Players offline",
      value: offlinePlayers.toString(),
      hint: offlinePlayers > 0 ? "Atenção necessária" : "Nenhum player offline",
      icon: SignalZero,
      tone: "danger" as const,
      link: { to: "/players" as const, search: { status: "offline" as const } },
    },
    {
      label: "Playlists ativas",
      value: playlists.filter((p) => p.is_active).length.toString(),
      hint: `${playlists.length} cadastradas no total`,
      icon: CalendarClock,
      tone: "warning" as const,
      link: { to: "/playlists" as const, search: {} },
    },
  ];

  const toneRing: Record<string, string> = {
    primary: "from-primary/25 to-primary/0 text-primary",
    success: "from-success/25 to-success/0 text-success",
    danger: "from-destructive/25 to-destructive/0 text-destructive",
    warning: "from-warning/25 to-warning/0 text-warning",
  };

  const isLoading = playersQ.isLoading || playlistsQ.isLoading;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Painel geral
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            Bem-vindo de volta 👋
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Uma visão em tempo real da sua rede Berg Vision.
          </p>
        </div>
        <Badge className="rounded-full border-none bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          Sistema em tempo real
        </Badge>
      </header>

      {isLoading ? (
        <GridSkeleton count={4} heightClass="h-36" />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              to={stat.link.to}
              search={stat.link.search}
              className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
            <Card
              className="group relative h-full cursor-pointer overflow-hidden rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-linear-to-br ${toneRing[stat.tone]} blur-2xl opacity-70`}
              />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </CardDescription>
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br ${toneRing[stat.tone]}`}
                  >
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-4xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </CardTitle>
                <div className="mt-2 flex items-center gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {stat.hint}
                  </p>
                </div>
              </CardContent>
            </Card>
            </Link>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Link to="/relatorio" className="group/title">
                <CardTitle className="text-lg font-semibold group-hover/title:text-primary">
                  Próximos agendamentos
                </CardTitle>
                <CardDescription>
                  Playlists e campanhas ativas cadastradas.
                </CardDescription>
              </Link>
              <Badge variant="secondary" className="rounded-full">
                {upcoming.length} itens
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {upcoming.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma playlist ativa no momento.
              </div>
            ) : (
              upcoming.map((item) => (
                <Link
                  key={item.id}
                  to="/playlists"
                  search={{ edit: item.id }}
                  className="flex items-center justify-between gap-3 px-6 py-3.5 transition-colors first:pt-4 last:pb-4 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.when}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-full border-border/70 text-[11px] font-normal text-muted-foreground"
                  >
                    {item.tag}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Saúde da rede</CardTitle>
            <CardDescription>Status agregado dos players.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StatusRow
              label="Online"
              value={onlinePlayers}
              total={totalPlayers}
              tone="success"
            />
            <StatusRow
              label="Offline"
              value={offlinePlayers}
              total={totalPlayers}
              tone="danger"
            />
            <StatusRow
              label="Total registrados"
              value={totalPlayers}
              total={Math.max(totalPlayers, 1)}
              tone="warning"
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatusRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "success" | "danger" | "warning";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "danger"
        ? "bg-rose-500"
        : "bg-amber-500";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value}
          {total > 0 && <span className="text-muted-foreground">/{total}</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
