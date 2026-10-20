import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  MonitorPlay,
  Signal,
  SignalZero,
  TrendingUp,
  Plus,
  Library,
  Megaphone,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      { title: "Berg Vision - Dashboard" },
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
  to?: string;
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
        .select("id, name, status, last_heartbeat, created_at, resolution, orientation")
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

  const mediaQ = useQuery({
    queryKey: ["dashboard-media", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("media_files")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const isLoading = playersQ.isLoading || playlistsQ.isLoading;
  const players = playersQ.data ?? [];
  const playlists = playlistsQ.data ?? [];
  const mediaCount = mediaQ.data ?? 0;

  const totalPlayers = players.length;
  const onlinePlayers = players.filter((p) => isOnline(p.last_heartbeat, p.status, nowMs)).length;
  const offlinePlayers = totalPlayers - onlinePlayers;

  const activePlaylists = playlists.filter((p) => p.is_active);

  const stats: Stat[] = [
    {
      label: "Total de players",
      value: isLoading ? "..." : String(totalPlayers),
      hint: "Players cadastrados na organização",
      icon: MonitorPlay,
      tone: "primary",
      to: "/players",
    },
    {
      label: "Players online",
      value: isLoading ? "..." : String(onlinePlayers),
      hint: totalPlayers > 0 ? `${Math.round((onlinePlayers / totalPlayers) * 100)}% da rede conectada` : "Nenhum player conectado",
      icon: Signal,
      tone: "success",
      to: "/players",
    },
    {
      label: "Players offline",
      value: isLoading ? "..." : String(offlinePlayers),
      hint: "Sem conexão recente",
      icon: SignalZero,
      tone: "danger",
      to: "/players",
    },
    {
      label: "Playlists ativas",
      value: isLoading ? "..." : String(activePlaylists.length),
      hint: "Campanhas prontas para exibição",
      icon: CalendarClock,
      tone: "warning",
      to: "/playlists",
    },
  ];

  const upcoming = activePlaylists.slice(0, 5).map((pl) => ({
    id: pl.id,
    title: pl.name,
    when: pl.schedule_date_start ? `Início: ${pl.schedule_date_start}` : "Ativa agora",
    tag: pl.schedule_start ? `Horário: ${pl.schedule_start}` : "Playlist",
  }));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-12">
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
        <div className="flex items-center gap-2">
          <Badge className="rounded-full border-none bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Sistema sincronizado
          </Badge>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const content = (
            <Card
              key={stat.label}
              className="group relative overflow-hidden rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-border cursor-pointer"
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
                <div className="mt-2 flex items-center justify-between">
                  <p className="truncate text-xs text-muted-foreground">
                    {stat.hint}
                  </p>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </CardContent>
            </Card>
          );

          if (stat.to) {
            return (
              <Link key={stat.label} to={stat.to} className="block">
                {content}
              </Link>
            );
          }
          return content;
        })}
      </section>

      {/* Ações Rápidas */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          to="/players"
          className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl transition hover:border-primary/50 hover:bg-card"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:scale-105">
              <MonitorPlay className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Gerenciar Players</h2>
              <p className="text-xs text-muted-foreground">Parear e monitorar telas</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
        </Link>

        <Link
          to="/biblioteca"
          className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl transition hover:border-primary/50 hover:bg-card"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-500/10 text-purple-500 transition group-hover:scale-105">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Biblioteca de Mídia</h2>
              <p className="text-xs text-muted-foreground">{mediaCount} arquivos enviados</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
        </Link>

        <Link
          to="/campanhas"
          className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl transition hover:border-primary/50 hover:bg-card"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-500 transition group-hover:scale-105">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Campanhas e Grade</h2>
              <p className="text-xs text-muted-foreground">Agendamento e conflitos</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl lg:col-span-2 flex flex-col">
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
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to="/playlists">Ver todas</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0 flex-1">
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <CalendarClock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-foreground">Nenhuma playlist ativa no momento.</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Crie ou ative playlists para exibição nos players.</p>
                <Button asChild size="sm" className="rounded-xl">
                  <Link to="/playlists">
                    <Plus className="mr-1.5 h-4 w-4" /> Criar playlist
                  </Link>
                </Button>
              </div>
            ) : (
              upcoming.map((item, idx) => (
                <Link
                  key={idx}
                  to="/playlists"
                  className="flex items-center justify-between gap-3 px-6 py-3.5 transition hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
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

        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Saúde da rede</CardTitle>
            <CardDescription>Status agregado dos players.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 justify-center flex-1">
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
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
