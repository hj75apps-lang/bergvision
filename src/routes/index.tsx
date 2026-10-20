import { createFileRoute } from "@tanstack/react-router";
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
import { useState, useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Berg Vision" },
      {
        name: "description",
        content:
          "Visão geral da sua rede de mídia indoor: players, agendamentos e desempenho em tempo real.",
      },
    ],
  }),
  component: DashboardPage,
});

type Stat = {
  label: string;
  value: string;
  hint: string;
  trend?: string;
  icon: typeof MonitorPlay;
  tone: "primary" | "success" | "danger" | "warning";
};

const HEARTBEAT_OFFLINE_MS = 60_000;

function isOnline(lastHeartbeat: string | null, status: string | null, nowMs: number): boolean {
  if (!lastHeartbeat) return false;
  const last = new Date(lastHeartbeat).getTime();
  if (Number.isNaN(last)) return false;
  if (nowMs - last > HEARTBEAT_OFFLINE_MS) return false;
  return (status ?? "").toLowerCase() === "online";
}

const toneRing: Record<Stat["tone"], string> = {
  primary: "from-primary/25 to-primary/0 text-primary",
  success: "from-success/25 to-success/0 text-success",
  danger: "from-destructive/25 to-destructive/0 text-destructive",
  warning: "from-warning/25 to-warning/0 text-warning",
};

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
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, status, last_heartbeat, created_at")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const playlistsQ = useQuery({
    queryKey: ["dashboard-playlists", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playlists")
        .select("id, name, is_active, schedule_date_start, schedule_date_end, schedule_start, created_at")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const players = playersQ.data ?? [];
  const playlists = playlistsQ.data ?? [];

  const totalPlayers = players.length;
  const onlinePlayers = players.filter((p) => isOnline(p.last_heartbeat, p.status, nowMs)).length;
  const offlinePlayers = totalPlayers - onlinePlayers;

  const activePlaylists = playlists.filter((p) => p.is_active);

  const stats: Stat[] = [
    {
      label: "Total de players",
      value: String(totalPlayers),
      hint: "Players cadastrados na organização",
      icon: MonitorPlay,
      tone: "primary",
    },
    {
      label: "Players online",
      value: String(onlinePlayers),
      hint: totalPlayers > 0 ? `${Math.round((onlinePlayers / totalPlayers) * 100)}% da rede conectada` : "0% da rede conectada",
      icon: Signal,
      tone: "success",
    },
    {
      label: "Players offline",
      value: String(offlinePlayers),
      hint: "Sem conexão recente",
      icon: SignalZero,
      tone: "danger",
    },
    {
      label: "Playlists ativas",
      value: String(activePlaylists.length),
      hint: "Campanhas prontas para exibição",
      icon: CalendarClock,
      tone: "warning",
    },
  ];

  const upcoming = activePlaylists.slice(0, 5).map((pl) => ({
    title: pl.name,
    when: pl.schedule_date_start ? `Início: ${pl.schedule_date_start}` : "Ativa agora",
    tag: pl.schedule_start ? `Horário: ${pl.schedule_start}` : "Playlist",
  }));

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
            Uma visão em tempo real da sua rede Berg Vision com dados reais.
          </p>
        </div>
        <Badge className="rounded-full border-none bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          Sistema sincronizado
        </Badge>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="group relative overflow-hidden rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl transition-shadow hover:shadow-lg hover:shadow-primary/5"
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
                {stat.trend && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                    <TrendingUp className="h-3 w-3" />
                    {stat.trend}
                  </span>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {stat.hint}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">
                  Playlists e Campanhas Ativas
                </CardTitle>
                <CardDescription>
                  Playlists cadastradas e ativas na sua rede.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {upcoming.length} itens
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {upcoming.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Nenhuma playlist ativa no momento.
              </p>
            ) : (
              upcoming.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 px-6 py-3.5 first:pt-4 last:pb-4"
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
                </div>
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
            <StatusRow label="Online" value={onlinePlayers} total={totalPlayers} tone="success" />
            <StatusRow label="Offline" value={offlinePlayers} total={totalPlayers} tone="danger" />
            <StatusRow label="Sincronizados" value={totalPlayers} total={totalPlayers} tone="warning" />
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
      ? "bg-success"
      : tone === "danger"
        ? "bg-destructive"
        : "bg-warning";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
