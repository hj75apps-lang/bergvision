import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  Download,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Building2,
  HardDrive,
  Image as ImageIcon,
  LayoutTemplate,
  ListMusic,
  MonitorPlay,
  Signal,
  SignalZero,
  X,
  Video,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatBytes } from "@/lib/media-utils";
import {
  exportCsv,
  exportHtml,
  exportJson,
  exportPdf,
  type ReportSnapshot,
} from "@/lib/report-export";

export const Route = createFileRoute("/relatorio")({
  head: () => ({
    meta: [
      { title: "Relatório · Berg Vision" },
      {
        name: "description",
        content:
          "Relatório completo da sua rede Berg Vision: conteúdo produzido, campanhas programadas e execução dos players.",
      },
    ],
  }),
  component: ReportPage,
});

const HEARTBEAT_OFFLINE_MS = 60_000;

type Player = {
  id: string;
  name: string;
  status: string | null;
  orientation: string | null;
  resolution: string | null;
  last_heartbeat: string | null;
  current_template_id: string | null;
  created_at: string | null;
};

type MediaRow = {
  id: string;
  name: string;
  type: string | null;
  file_size: number | null;
  size: number | null;
  duration: number | null;
  created_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  type: string | null;
  is_system: boolean | null;
  orientation: string | null;
  created_at: string | null;
};

type PlaylistRow = {
  id: string;
  name: string;
  is_active: boolean | null;
  schedule_date_start: string | null;
  schedule_date_end: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days: number[] | null;
  created_at: string | null;
  items_count?: { count: number }[] | null;
  players_count?: { count: number }[] | null;
};

function isOnline(p: Player, nowMs: number): boolean {
  if (!p.last_heartbeat) return false;
  const last = new Date(p.last_heartbeat).getTime();
  if (Number.isNaN(last)) return false;
  if (nowMs - last > HEARTBEAT_OFFLINE_MS) return false;
  return (p.status ?? "").toLowerCase() === "online";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatOrientation(o: string | null | undefined): string {
  if (!o) return "—";
  const v = o.toLowerCase();
  if (v === "landscape" || v === "horizontal") return "Paisagem";
  if (v === "portrait" || v === "vertical") return "Retrato";
  if (v === "both") return "Ambas";
  return o;
}

function playlistStatus(pl: PlaylistRow, today: Date): {
  label: string;
  tone: "success" | "warning" | "muted" | "danger";
} {
  if (!pl.is_active) return { label: "Inativa", tone: "muted" };
  const t = today.getTime();
  const start = pl.schedule_date_start
    ? new Date(`${pl.schedule_date_start}T00:00:00`).getTime()
    : null;
  const end = pl.schedule_date_end
    ? new Date(`${pl.schedule_date_end}T23:59:59`).getTime()
    : null;
  if (start && t < start) return { label: "Programada", tone: "warning" };
  if (end && t > end) return { label: "Encerrada", tone: "danger" };
  return { label: "No ar", tone: "success" };
}

function ReportPage() {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;

  const playersQ = useQuery({
    queryKey: ["report:players", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from("players")
        .select(
          "id, name, status, orientation, resolution, last_heartbeat, current_template_id, created_at",
        )
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Player[];
    },
  });

  const mediaQ = useQuery({
    queryKey: ["report:media", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<MediaRow[]> => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, name, type, file_size, size, duration, created_at")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
  });

  const templatesQ = useQuery({
    queryKey: ["report:templates", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, type, is_system, orientation, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const playlistsQ = useQuery({
    queryKey: ["report:playlists", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PlaylistRow[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select(
          "id, name, is_active, schedule_date_start, schedule_date_end, schedule_start, schedule_end, schedule_days, created_at, items_count:playlist_items(count), players_count:playlist_players(count)",
        )
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlaylistRow[];
    },
  });

  const loading =
    playersQ.isLoading || mediaQ.isLoading || templatesQ.isLoading || playlistsQ.isLoading;

  const nowMs = Date.now();
  const today = new Date();

  const rawPlayers = playersQ.data ?? [];
  const rawMedia = mediaQ.data ?? [];
  const rawTemplates = templatesQ.data ?? [];
  const rawPlaylists = playlistsQ.data ?? [];

  // ---- Filtros ----
  type PeriodKey = "7d" | "30d" | "90d" | "ytd" | "all";
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [playerId, setPlayerId] = useState<string>("all");
  const [playlistId, setPlaylistId] = useState<string>("all");

  const periodStartMs = useMemo(() => {
    if (period === "all") return null;
    if (period === "ytd") return new Date(today.getFullYear(), 0, 1).getTime();
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.getTime();
  }, [period, today]);

  const inPeriod = (iso: string | null): boolean => {
    if (periodStartMs == null) return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= periodStartMs;
  };

  const chartDays = period === "7d" ? 7 : period === "90d" ? 90 : period === "ytd"
    ? Math.max(1, Math.ceil((today.getTime() - periodStartMs!) / 86_400_000))
    : 30;

  const players = useMemo(
    () => (playerId === "all" ? rawPlayers : rawPlayers.filter((p) => p.id === playerId)),
    [rawPlayers, playerId],
  );
  const media = useMemo(
    () => rawMedia.filter((m) => inPeriod(m.created_at)),
    [rawMedia, periodStartMs],
  );
  const templates = useMemo(
    () => rawTemplates.filter((t) => inPeriod(t.created_at)),
    [rawTemplates, periodStartMs],
  );
  const playlists = useMemo(() => {
    let arr = rawPlaylists.filter((pl) => inPeriod(pl.created_at));
    if (playlistId !== "all") arr = arr.filter((pl) => pl.id === playlistId);
    return arr;
  }, [rawPlaylists, periodStartMs, playlistId]);

  const activeFilterCount =
    (period !== "30d" ? 1 : 0) + (playerId !== "all" ? 1 : 0) + (playlistId !== "all" ? 1 : 0);
  const resetFilters = () => {
    setPeriod("30d");
    setPlayerId("all");
    setPlaylistId("all");
  };

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    // Always use the full template list so player rows can resolve names even
    // when a period filter would otherwise hide older templates.
    rawTemplates.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [rawTemplates]);

  const onlinePlayers = useMemo(
    () => players.filter((p) => isOnline(p, nowMs)).length,
    [players, nowMs],
  );
  const offlinePlayers = players.length - onlinePlayers;

  const activePlaylists = playlists.filter((p) => {
    if (!p.is_active) return false;
    const s = playlistStatus(p, today);
    return s.label === "No ar";
  }).length;
  const scheduledPlaylists = playlists.filter(
    (p) => p.is_active && playlistStatus(p, today).label === "Programada",
  ).length;

  const totalBytes = media.reduce(
    (acc, m) => acc + (m.file_size ?? m.size ?? 0),
    0,
  );

  const mediaByType = useMemo(() => {
    const groups: Record<string, number> = { image: 0, video: 0, other: 0 };
    media.forEach((m) => {
      const k = (m.type ?? "").toLowerCase();
      if (k === "image") groups.image += 1;
      else if (k === "video") groups.video += 1;
      else groups.other += 1;
    });
    return [
      { name: "Imagens", value: groups.image, color: "hsl(var(--primary))" },
      { name: "Vídeos", value: groups.video, color: "hsl(142 71% 45%)" },
      { name: "Outros", value: groups.other, color: "hsl(38 92% 50%)" },
    ].filter((d) => d.value > 0);
  }, [media]);

  const templatesByType = useMemo(() => {
    let grid = 0;
    let canvas = 0;
    templates.forEach((t) => {
      if ((t.type ?? "grid") === "canvas") canvas += 1;
      else grid += 1;
    });
    return [
      { name: "Grid (sistema)", value: grid, color: "hsl(var(--primary))" },
      { name: "Canvas (Studio)", value: canvas, color: "hsl(280 65% 60%)" },
    ].filter((d) => d.value > 0);
  }, [templates]);

  const playersByOrientation = useMemo(() => {
    const map: Record<string, number> = {};
    players.forEach((p) => {
      const k = formatOrientation(p.orientation);
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [players]);

  const createdLast30Days = useMemo(() => {
    const days: { date: string; label: string; midias: number; playlists: number }[] = [];
    const now = new Date();
    const N = Math.min(Math.max(1, chartDays), 180);
    for (let i = N - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        midias: 0,
        playlists: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.date, d]));
    media.forEach((m) => {
      if (!m.created_at) return;
      const k = m.created_at.slice(0, 10);
      const row = byKey.get(k);
      if (row) row.midias += 1;
    });
    playlists.forEach((p) => {
      if (!p.created_at) return;
      const k = p.created_at.slice(0, 10);
      const row = byKey.get(k);
      if (row) row.playlists += 1;
    });
    return days;
  }, [media, playlists, chartDays]);

  const buildSnapshot = (): ReportSnapshot => ({
    generatedAt: new Date(),
    organization: membership?.organization_id ?? "—",
    players,
    media,
    templates,
    playlists,
    kpis: {
      playersTotal: players.length,
      playersOnline: onlinePlayers,
      playersOffline: offlinePlayers,
      playlistsTotal: playlists.length,
      playlistsActive: activePlaylists,
      playlistsScheduled: scheduledPlaylists,
      templatesTotal: templates.length,
      templatesStudio: templates.filter((t) => (t.type ?? "grid") === "canvas").length,
      mediaTotal: media.length,
      mediaBytes: totalBytes,
      mediaBytesFormatted: formatBytes(totalBytes),
    },
    templateNameById: Object.fromEntries(templateNameById.entries()),
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Análise operacional
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            Relatório da rede
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Panorama consolidado do conteúdo produzido, campanhas programadas e execução nos players.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="rounded-full border-none bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            Dados em tempo real
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                disabled={loading}
                className="h-8 rounded-full bg-primary/90 px-4 text-xs font-medium shadow-sm hover:bg-primary"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Formato do relatório
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => exportPdf(buildSnapshot())}
              >
                <FileText className="h-4 w-4 text-red-500" />
                <div className="flex flex-col">
                  <span>PDF (imprimir)</span>
                  <span className="text-[11px] text-muted-foreground">
                    Abre para salvar como PDF
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => exportHtml(buildSnapshot())}
              >
                <FileCode2 className="h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span>HTML</span>
                  <span className="text-[11px] text-muted-foreground">
                    Página autônoma pronta para compartilhar
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => exportCsv(buildSnapshot())}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                <div className="flex flex-col">
                  <span>CSV (Excel)</span>
                  <span className="text-[11px] text-muted-foreground">
                    4 arquivos: players, playlists, templates, mídias
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => exportJson(buildSnapshot())}
              >
                <FileJson className="h-4 w-4 text-amber-500" />
                <div className="flex flex-col">
                  <span>JSON</span>
                  <span className="text-[11px] text-muted-foreground">
                    Dados estruturados para integração
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {loading ? (
        <GridSkeleton count={8} heightClass="h-32" />
      ) : (
        <>
          {/* KPI grid */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Players"
              value={players.length}
              hint={`${onlinePlayers} online · ${offlinePlayers} offline`}
              icon={MonitorPlay}
              tone="primary"
            />
            <Kpi
              label="Playlists"
              value={playlists.length}
              hint={`${activePlaylists} no ar · ${scheduledPlaylists} programadas`}
              icon={ListMusic}
              tone="success"
            />
            <Kpi
              label="Templates"
              value={templates.length}
              hint={`${templates.filter((t) => (t.type ?? "grid") === "canvas").length} do Studio`}
              icon={LayoutTemplate}
              tone="warning"
            />
            <Kpi
              label="Mídias"
              value={media.length}
              hint={formatBytes(totalBytes)}
              icon={HardDrive}
              tone="danger"
            />
          </section>

          {/* Charts row */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Conteúdo produzido nos últimos 30 dias
                </CardTitle>
                <CardDescription>
                  Mídias enviadas para a Biblioteca e playlists criadas por dia.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={createdLast30Days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      interval={4}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="midias" name="Mídias" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="playlists" name="Playlists" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Saúde dos players</CardTitle>
                <CardDescription>Distribuição atual da rede.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <StatusRow label="Online" value={onlinePlayers} total={players.length || 1} tone="success" icon={Signal} />
                <StatusRow label="Offline" value={offlinePlayers} total={players.length || 1} tone="danger" icon={SignalZero} />
                <div className="mt-2 border-t border-border/50 pt-4">
                  <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Orientação</p>
                  <div className="flex flex-wrap gap-2">
                    {playersByOrientation.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Sem players cadastrados.</span>
                    ) : (
                      playersByOrientation.map((o) => (
                        <Badge key={o.name} variant="secondary" className="rounded-full">
                          {o.name}: <span className="ml-1 font-semibold">{o.value}</span>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DonutCard
              title="Biblioteca por tipo"
              description="Distribuição das mídias armazenadas."
              data={mediaByType}
              emptyLabel="Nenhuma mídia enviada."
              icon={ImageIcon}
            />
            <DonutCard
              title="Templates por origem"
              description="Templates de sistema (grid) versus criados no Studio (canvas)."
              data={templatesByType}
              emptyLabel="Nenhum template cadastrado."
              icon={LayoutTemplate}
            />
          </section>

          {/* Players table */}
          <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-semibold">Execução por player</CardTitle>
                  <CardDescription>
                    Estado atual, último heartbeat e template em execução em cada tela.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="rounded-full">
                  {players.length} player(s)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {players.length === 0 ? (
                <EmptyRow label="Nenhum player pareado ainda." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Orientação</TableHead>
                        <TableHead>Resolução</TableHead>
                        <TableHead>Template ativo</TableHead>
                        <TableHead>Último heartbeat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {players.map((p) => {
                        const online = isOnline(p, nowMs);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  online
                                    ? "bg-emerald-500/15 text-emerald-500"
                                    : "bg-red-500/15 text-red-500"
                                }`}
                              >
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`}
                                />
                                {online ? "Online" : "Offline"}
                              </span>
                            </TableCell>
                            <TableCell>{formatOrientation(p.orientation)}</TableCell>
                            <TableCell className="tabular-nums">{p.resolution ?? "—"}</TableCell>
                            <TableCell className="max-w-[220px] truncate">
                              {p.current_template_id
                                ? templateNameById.get(p.current_template_id) ?? "—"
                                : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.last_heartbeat
                                ? new Date(p.last_heartbeat).toLocaleString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "nunca"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Playlists table */}
          <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-semibold">
                    Campanhas programadas
                  </CardTitle>
                  <CardDescription>
                    Playlists com período, quantidade de itens e players alvo.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <LegendDot color="bg-emerald-500" label="No ar" />
                  <LegendDot color="bg-amber-500" label="Programada" />
                  <LegendDot color="bg-red-500" label="Encerrada" />
                  <LegendDot color="bg-muted-foreground/40" label="Inativa" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {playlists.length === 0 ? (
                <EmptyRow label="Nenhuma playlist criada." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Playlist</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Itens</TableHead>
                        <TableHead className="text-right">Players</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Janela diária</TableHead>
                        <TableHead>Criada em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {playlists.map((pl) => {
                        const st = playlistStatus(pl, today);
                        const itemsCount = pl.items_count?.[0]?.count ?? 0;
                        const playersCount = pl.players_count?.[0]?.count ?? 0;
                        const period =
                          pl.schedule_date_start || pl.schedule_date_end
                            ? `${formatDate(pl.schedule_date_start)} → ${formatDate(pl.schedule_date_end)}`
                            : "Contínua";
                        const window =
                          pl.schedule_start || pl.schedule_end
                            ? `${pl.schedule_start?.slice(0, 5) ?? "—"}–${pl.schedule_end?.slice(0, 5) ?? "—"}`
                            : "24h";
                        const toneClass =
                          st.tone === "success"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : st.tone === "warning"
                              ? "bg-amber-500/15 text-amber-500"
                              : st.tone === "danger"
                                ? "bg-red-500/15 text-red-500"
                                : "bg-muted text-muted-foreground";
                        return (
                          <TableRow key={pl.id}>
                            <TableCell className="font-medium">{pl.name}</TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
                                {st.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{itemsCount}</TableCell>
                            <TableCell className="text-right tabular-nums">{playersCount}</TableCell>
                            <TableCell className="text-muted-foreground">{period}</TableCell>
                            <TableCell className="text-muted-foreground">{window}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(pl.created_at)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Templates table */}
          <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Templates disponíveis</CardTitle>
              <CardDescription>
                Layouts do sistema e criados no Studio, por origem e orientação.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {templates.length === 0 ? (
                <EmptyRow label="Nenhum template cadastrado." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Orientação</TableHead>
                        <TableHead>Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`rounded-full text-[10px] ${
                                t.is_system
                                  ? "bg-primary/15 text-primary hover:bg-primary/15"
                                  : "bg-purple-500/15 text-purple-400 hover:bg-purple-500/15"
                              }`}
                            >
                              {t.is_system ? "Sistema" : "Studio"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {(t.type ?? "grid") === "canvas" ? "Canvas" : "Grid"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatOrientation(t.orientation)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(t.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: typeof MonitorPlay;
  tone: "primary" | "success" | "warning" | "danger";
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "from-primary/25 to-primary/0 text-primary",
    success: "from-emerald-500/25 to-emerald-500/0 text-emerald-500",
    warning: "from-amber-500/25 to-amber-500/0 text-amber-500",
    danger: "from-red-500/25 to-red-500/0 text-red-500",
  };
  return (
    <Card className="group relative overflow-hidden rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl transition-shadow hover:shadow-lg hover:shadow-primary/5">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-linear-to-br ${toneClass[tone]} blur-2xl opacity-70`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </CardDescription>
          <div className={`grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br ${toneClass[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-4xl font-semibold tracking-tight tabular-nums">{value}</CardTitle>
        <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  total,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  tone: "success" | "danger" | "warning";
  icon: typeof MonitorPlay;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const bar =
    tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-red-500" : "bg-amber-500";
  const text =
    tone === "success" ? "text-emerald-500" : tone === "danger" ? "text-red-500" : "text-amber-500";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className={`inline-flex items-center gap-1.5 ${text}`}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-medium tabular-nums">
          {value}
          <span className="text-muted-foreground">/{total} · {pct}%</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DonutCard({
  title,
  description,
  data,
  emptyLabel,
  icon: Icon,
}: {
  title: string;
  description: string;
  data: { name: string; value: number; color: string }[];
  emptyLabel: string;
  icon: typeof MonitorPlay;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="grid grid-cols-[1fr_1fr] items-center gap-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2">
              {data.map((d) => {
                const pct = Math.round((d.value / total) * 100);
                return (
                  <div key={d.name} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: d.color }}
                      />
                      {d.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {d.value} · {pct}%
                    </span>
                  </div>
                );
              })}
              <p className="mt-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{total}</span>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="px-6 py-10 text-center text-sm text-muted-foreground">{label}</p>;
}

// Referenced icons kept to preserve tree-shaking hints
void Video;
void CalendarClock;