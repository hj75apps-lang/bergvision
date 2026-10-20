import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Film,
  ListVideo,
  Loader2,
  MonitorPlay,
  Signal,
  SignalZero,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel geral · Berg Vision" },
      {
        name: "description",
        content: "Visão geral da sua rede de mídia indoor: players, agendamentos e status em tempo real.",
      },
      { property: "og:title", content: "Painel geral · Berg Vision" },
      { property: "og:description", content: "Status real da sua rede de mídia indoor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

type PlayerRow = { id: string; name: string; status: string | null; last_heartbeat: string | null };
type PlaylistRow = {
  id: string;
  name: string;
  is_active: boolean | null;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: unknown;
  schedule_date_start: string | null;
  schedule_date_end: string | null;
  players_count: { count: number }[] | null;
};

const OFFLINE_MS = 60_000;

function isOnline(p: PlayerRow, now: number): boolean {
  if (!p.last_heartbeat) return false;
  const t = new Date(p.last_heartbeat).getTime();
  if (Number.isNaN(t) || now - t > OFFLINE_MS) return false;
  return (p.status ?? "").toLowerCase() === "online";
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function runsOn(p: PlaylistRow, d: Date): boolean {
  const key = ymd(d);
  if (p.schedule_date_start && key < p.schedule_date_start.slice(0, 10)) return false;
  if (p.schedule_date_end && key > p.schedule_date_end.slice(0, 10)) return false;
  if (Array.isArray(p.schedule_days) && p.schedule_days.length > 0) {
    const days = p.schedule_days.map((x) => Number(x));
    const wd = d.getDay();
    if (!days.includes(wd) && !(wd === 0 && days.includes(7))) return false;
  }
  return true;
}

type Upcoming = { id: string; name: string; when: string; sort: number; screens: number };

function nextOccurrences(list: PlaylistRow[], now: Date): Upcoming[] {
  const out: Upcoming[] = [];
  for (const p of list) {
    if (!p.is_active) continue;
    for (let offset = 0; offset < 2; offset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      if (!runsOn(p, day)) continue;
      const [h, m] = (p.schedule_start ?? "00:00").split(":").map(Number);
      const start = new Date(day);
      start.setHours(h || 0, m || 0, 0, 0);
      const diff = start.getTime() - now.getTime();
      if (diff < 0 || diff > 24 * 3600_000) continue;
      const hh = (p.schedule_start ?? "00:00").slice(0, 5);
      out.push({
        id: `${p.id}-${offset}`,
        name: p.name,
        when: `${offset === 0 ? "Hoje" : "Amanhã"}, ${hh}`,
        sort: start.getTime(),
        screens: p.players_count?.[0]?.count ?? 0,
      });
      break;
    }
  }
  return out.sort((a, b) => a.sort - b.sort);
}

const toneRing = {
  primary: "from-primary/25 to-primary/0 text-primary",
  success: "from-success/25 to-success/0 text-success",
  danger: "from-destructive/25 to-destructive/0 text-destructive",
  warning: "from-warning/25 to-warning/0 text-warning",
} as const;

function DashboardPage() {
  const { membership, loading: authLoading } = useAuth();
  const orgId = membership?.organization_id;
  const noOrg = !authLoading && !orgId;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const playersQ = useQuery({
    queryKey: ["dashboard-players", orgId],
    enabled: !!orgId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PlayerRow[]> => {
      const { data, error } = await supabase.from("players").select("id, name, status, last_heartbeat").order("name");
      if (error) throw error;
      return (data ?? []) as PlayerRow[];
    },
  });

  const playlistsQ = useQuery({
    queryKey: ["dashboard-playlists", orgId],
    enabled: !!orgId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PlaylistRow[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select(
          "id, name, is_active, schedule_start, schedule_end, schedule_days, schedule_date_start, schedule_date_end, players_count:playlist_players(count)",
        );
      if (error) throw error;
      return (data ?? []) as PlaylistRow[];
    },
  });

  const mediaQ = useQuery({
    queryKey: ["dashboard-media-count", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase.from("media_files").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const players = playersQ.data ?? [];
  const playlists = playlistsQ.data ?? [];
  const online = players.filter((p) => isOnline(p, now));
  const offline = players.filter((p) => !isOnline(p, now));
  const activePlaylists = playlists.filter((p) => p.is_active).length;
  const upcoming = nextOccurrences(playlists, new Date(now));
  // Só mostra "carregando" enquanto há algo realmente sendo buscado.
  const loading = !noOrg && (authLoading || playersQ.isPending || playlistsQ.isPending);
  const pctOnline = players.length ? Math.round((online.length / players.length) * 100) : 0;

  const stats = [
    { label: "Total de players", value: players.length, hint: `${activePlaylists} playlists ativas`, icon: MonitorPlay, tone: "primary" as const },
    { label: "Players online", value: online.length, hint: players.length ? `${pctOnline}% da rede conectada agora` : "Nenhum player pareado", icon: Signal, tone: "success" as const },
    { label: "Players offline", value: offline.length, hint: "Sem sinal no último minuto", icon: SignalZero, tone: "danger" as const },
    { label: "Próximos agendamentos", value: upcoming.length, hint: "Nas próximas 24 horas", icon: CalendarClock, tone: "warning" as const },
  ];

  const error = noOrg
    ? new Error("sua conta não está vinculada a uma organização. Peça um convite ao responsável.")
    : playersQ.error || playlistsQ.error;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Painel geral</p>
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
          {membership?.full_name ? `Olá, ${membership.full_name.split(" ")[0]}` : "Bem-vindo de volta"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Uma visão em tempo real da sua rede {membership?.organization?.name ?? "Berg Vision"}.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os dados: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
            <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-linear-to-br ${toneRing[stat.tone]} blur-2xl opacity-70`} />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs font-medium uppercase tracking-wider">{stat.label}</CardDescription>
                <div className={`grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br ${toneRing[stat.tone]}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-4xl font-semibold tracking-tight tabular-nums">
                {loading ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : stat.value}
              </CardTitle>
              <p className="mt-2 truncate text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-semibold">Próximos agendamentos</CardTitle>
                <CardDescription>Playlists ativas que começam nas próximas 24 horas.</CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-full">{upcoming.length} itens</Badge>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {upcoming.length === 0 && (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                {loading ? "Carregando…" : "Nenhuma playlist programada para começar nas próximas 24 horas."}
              </p>
            )}
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.when}</p>
                </div>
                <Badge variant="outline" className="shrink-0 rounded-full text-[11px] font-normal text-muted-foreground">
                  {item.screens} {item.screens === 1 ? "tela" : "telas"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Saúde da rede</CardTitle>
            <CardDescription>Status real dos players.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StatusRow label="Online" value={online.length} total={players.length} bar="bg-success" />
            <StatusRow label="Offline" value={offline.length} total={players.length} bar="bg-destructive" />
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <Link to="/playlists" className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2.5 hover:bg-muted/60">
                <ListVideo className="h-4 w-4 text-primary" />
                <span className="tabular-nums font-medium">{playlists.length}</span>
                <span className="text-muted-foreground">playlists</span>
              </Link>
              <Link to="/biblioteca" className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2.5 hover:bg-muted/60">
                <Film className="h-4 w-4 text-primary" />
                <span className="tabular-nums font-medium">{mediaQ.data ?? 0}</span>
                <span className="text-muted-foreground">mídias</span>
              </Link>
            </div>
            {offline.length > 0 && (
              <div className="mt-1">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Sem sinal</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {offline.slice(0, 5).map((p) => (
                    <li key={p.id} className="truncate">{p.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatusRow({ label, value, total, bar }: { label: string; value: number; total: number; bar: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
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
