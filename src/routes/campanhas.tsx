import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  differenceInCalendarDays,
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  min as dfMin,
  max as dfMax,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Megaphone,
  Plus,
  Loader2,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  MonitorPlay,
  Trash2,
  CircleAlert,
  CircleDot,
  CalendarX2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  CalendarDays,
  History,
  ListChecks,
  GanttChartSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { PlaylistEditor, type Playlist } from "@/routes/playlists";

export const Route = createFileRoute("/campanhas")({
  head: () => ({
    meta: [
      { title: "Campanhas · Berg Vision" },
      {
        name: "description",
        content:
          "Programe, publique e organize suas campanhas de mídia indoor com alertas de conflitos e prazos.",
      },
    ],
  }),
  component: CampanhasPage,
});

type CampaignRow = Playlist & {
  items_count?: { count: number }[];
  players_count?: { count: number }[];
};

type Targeting = {
  playlist_id: string;
  player_id: string;
};

type CampaignStatus =
  | "agendada"
  | "no_ar"
  | "encerrada"
  | "inativa"
  | "sem_janela";

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  return new Date(`${s}T00:00:00`);
}

function fmt(d: Date | null): string {
  return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "—";
}

function statusOf(c: CampaignRow): CampaignStatus {
  if (!c.is_active) return "inativa";
  const start = parseDate(c.schedule_date_start);
  const end = parseDate(c.schedule_date_end);
  const now = today();
  if (!start && !end) return "sem_janela";
  if (start && start > now) return "agendada";
  if (end && end < now) return "encerrada";
  return "no_ar";
}

function statusMeta(s: CampaignStatus) {
  switch (s) {
    case "no_ar":
      return {
        label: "No ar",
        className: "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15",
        icon: CircleDot,
      };
    case "agendada":
      return {
        label: "Agendada",
        className: "bg-sky-500/15 text-sky-500 hover:bg-sky-500/15",
        icon: CalendarClock,
      };
    case "encerrada":
      return {
        label: "Encerrada",
        className: "bg-muted text-muted-foreground",
        icon: CalendarX2,
      };
    case "inativa":
      return {
        label: "Inativa",
        className: "bg-muted text-muted-foreground",
        icon: CircleAlert,
      };
    default:
      return {
        label: "Sem janela",
        className: "bg-amber-500/15 text-amber-500 hover:bg-amber-500/15",
        icon: Clock,
      };
  }
}

type CampaignAlert = {
  id: string;
  campaignId: string;
  campaignName: string;
  severity: "warn" | "error" | "info";
  message: string;
};

function CampanhasPage() {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canManage = role !== "viewer";
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Playlist | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const campaignsQ = useQuery({
    queryKey: ["campaigns-list", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select(
          "id, organization_id, name, is_active, schedule_start, schedule_end, schedule_days, schedule_date_start, schedule_date_end, created_at, items_count:playlist_items(count), players_count:playlist_players(count)",
        )
        .eq("organization_id", orgId!)
        .order("schedule_date_start", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const targetingQ = useQuery({
    queryKey: ["campaigns-targeting", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Targeting[]> => {
      const { data, error } = await supabase
        .from("playlist_players")
        .select("playlist_id, player_id")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Targeting[];
    },
  });

  const playersCountQ = useQuery({
    queryKey: ["players-count", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const campaigns = campaignsQ.data ?? [];
  const targeting = targetingQ.data ?? [];

  const playersByCampaign = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const t of targeting) {
      if (!m.has(t.playlist_id)) m.set(t.playlist_id, new Set());
      m.get(t.playlist_id)!.add(t.player_id);
    }
    return m;
  }, [targeting]);

  const alerts = useMemo<CampaignAlert[]>(() => {
    const list: CampaignAlert[] = [];
    const now = today();

    // Duplicated names
    const byName = new Map<string, CampaignRow[]>();
    for (const c of campaigns) {
      const k = c.name.trim().toLowerCase();
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(c);
    }
    for (const [, group] of byName) {
      if (group.length < 2) continue;
      for (const c of group) {
        list.push({
          id: `dup:${c.id}`,
          campaignId: c.id,
          campaignName: c.name,
          severity: "warn",
          message: `Existe(m) ${group.length - 1} outra(s) campanha(s) com o mesmo nome.`,
        });
      }
    }

    // Overlap on shared players
    const active = campaigns.filter((c) => c.is_active);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        const aStart = parseDate(a.schedule_date_start);
        const aEnd = parseDate(a.schedule_date_end);
        const bStart = parseDate(b.schedule_date_start);
        const bEnd = parseDate(b.schedule_date_end);
        const overlap =
          (!aEnd || !bStart || aEnd >= bStart) &&
          (!bEnd || !aStart || bEnd >= aStart);
        if (!overlap) continue;
        const setA = playersByCampaign.get(a.id) ?? new Set<string>();
        const setB = playersByCampaign.get(b.id) ?? new Set<string>();
        const shared = [...setA].filter((p) => setB.has(p));
        if (shared.length === 0) continue;
        list.push({
          id: `conflict:${a.id}:${b.id}`,
          campaignId: a.id,
          campaignName: a.name,
          severity: "error",
          message: `Conflito com "${b.name}" em ${shared.length} player(s) no mesmo período.`,
        });
      }
    }

    for (const c of campaigns) {
      const s = statusOf(c);
      const end = parseDate(c.schedule_date_end);
      const start = parseDate(c.schedule_date_start);
      const players = playersByCampaign.get(c.id)?.size ?? 0;
      const items = c.items_count?.[0]?.count ?? 0;

      if (s === "no_ar" && end) {
        const days = differenceInCalendarDays(end, now);
        if (days <= 7) {
          list.push({
            id: `expiring:${c.id}`,
            campaignId: c.id,
            campaignName: c.name,
            severity: days <= 2 ? "error" : "warn",
            message:
              days === 0
                ? "Encerra hoje."
                : days === 1
                  ? "Encerra amanhã."
                  : `Faltam ${days} dias para o término.`,
          });
        }
      }

      if (s === "encerrada" && c.is_active) {
        list.push({
          id: `ended:${c.id}`,
          campaignId: c.id,
          campaignName: c.name,
          severity: "warn",
          message: `Campanha encerrada em ${fmt(end)} — ainda marcada como ativa.`,
        });
      }

      if (s === "agendada" && start) {
        const days = differenceInCalendarDays(start, now);
        if (days <= 3) {
          list.push({
            id: `starting:${c.id}`,
            campaignId: c.id,
            campaignName: c.name,
            severity: "info",
            message:
              days === 0
                ? "Estreia hoje."
                : `Estreia em ${days} dia(s).`,
          });
        }
      }

      if (c.is_active && s !== "encerrada") {
        if (players === 0) {
          list.push({
            id: `noplayers:${c.id}`,
            campaignId: c.id,
            campaignName: c.name,
            severity: "warn",
            message: "Nenhum player selecionado para esta campanha.",
          });
        }
        if (items === 0) {
          list.push({
            id: `noitems:${c.id}`,
            campaignId: c.id,
            campaignName: c.name,
            severity: "warn",
            message: "Nenhum item na playlist da campanha.",
          });
        }
      }
    }

    return list;
  }, [campaigns, playersByCampaign]);

  // Fire toast once per unique alert per session
  useEffect(() => {
    for (const a of alerts) {
      if (notifiedRef.current.has(a.id)) continue;
      notifiedRef.current.add(a.id);
      const label = `${a.campaignName}: ${a.message}`;
      if (a.severity === "error") toast.error(label);
      else if (a.severity === "warn") toast.warning(label);
      else toast.info(label);
    }
  }, [alerts]);

  const kpis = useMemo(() => {
    let noAr = 0,
      agendadas = 0,
      encerradas = 0,
      inativas = 0;
    for (const c of campaigns) {
      const s = statusOf(c);
      if (s === "no_ar") noAr++;
      else if (s === "agendada") agendadas++;
      else if (s === "encerrada") encerradas++;
      else if (s === "inativa") inativas++;
    }
    return { total: campaigns.length, noAr, agendadas, encerradas, inativas };
  }, [campaigns]);

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organização não identificada");
      const start = today();
      const end = addDays(start, 30);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("playlists")
        .insert({
          organization_id: orgId,
          name: "Nova campanha",
          is_active: true,
          schedule_date_start: iso(start),
          schedule_date_end: iso(end),
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Playlist;
    },
    onSuccess: (p) => {
      toast.success("Campanha criada.");
      qc.invalidateQueries({ queryKey: ["campaigns-list", orgId] });
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
      setEditing(p);
    },
    onError: (err: any) =>
      toast.error(err?.message || "Falha ao criar campanha."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha removida.");
      qc.invalidateQueries({ queryKey: ["campaigns-list", orgId] });
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover."),
  });

  const toggleActive = useMutation({
    mutationFn: async (c: CampaignRow) => {
      const { error } = await supabase
        .from("playlists")
        .update({ is_active: !c.is_active })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns-list", orgId] });
      qc.invalidateQueries({ queryKey: ["playlists-list", orgId] });
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao atualizar."),
  });

  const [tab, setTab] = useState<"todas" | CampaignStatus>("todas");

  const filtered = useMemo(() => {
    if (tab === "todas") return campaigns;
    return campaigns.filter((c) => statusOf(c) === tab);
  }, [campaigns, tab]);

  const [view, setView] = useState<
    "programadas" | "timeline" | "calendario" | "historico"
  >("programadas");
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(today()));

  const timelineRange = useMemo(() => {
    const dates: Date[] = [];
    for (const c of campaigns) {
      const s = parseDate(c.schedule_date_start);
      const e = parseDate(c.schedule_date_end);
      if (s) dates.push(s);
      if (e) dates.push(e);
    }
    if (dates.length === 0) {
      const s = today();
      return { start: s, end: addDays(s, 30) };
    }
    return { start: dfMin(dates), end: dfMax(dates) };
  }, [campaigns]);

  function exportReport(
    scope: "programadas" | "timeline" | "calendario" | "historico" | "alertas",
    fmtKind: "csv" | "json" | "html",
  ) {
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    const filename = `campanhas-${scope}-${stamp}.${fmtKind}`;

    const rows = campaigns.map((c) => {
      const s = statusOf(c);
      const start = parseDate(c.schedule_date_start);
      const end = parseDate(c.schedule_date_end);
      const players =
        playersByCampaign.get(c.id)?.size ??
        (c.players_count?.[0]?.count ?? 0);
      const items = c.items_count?.[0]?.count ?? 0;
      return {
        nome: c.name,
        status: statusMeta(s).label,
        ativa: c.is_active ? "Sim" : "Não",
        inicio: c.schedule_date_start ?? "",
        fim: c.schedule_date_end ?? "",
        janela_inicio: c.schedule_start ?? "",
        janela_fim: c.schedule_end ?? "",
        itens: items,
        players,
        criada_em: c.created_at ?? "",
        dias_restantes: end ? differenceInCalendarDays(end, today()) : "",
        _start: start,
        _end: end,
      };
    });

    let dataset: Record<string, unknown>[] = [];
    let title = "";

    if (scope === "programadas") {
      title = "Campanhas programadas";
      dataset = rows.map(({ _start, _end, ...r }) => {
        void _start;
        void _end;
        return r;
      });
    } else if (scope === "timeline") {
      title = "Linha do tempo das campanhas";
      dataset = rows
        .filter((r) => r._start || r._end)
        .sort((a, b) => {
          const av = a._start?.getTime() ?? Infinity;
          const bv = b._start?.getTime() ?? Infinity;
          return av - bv;
        })
        .map(({ _start, _end, ...r }) => {
          void _start;
          void _end;
          return r;
        });
    } else if (scope === "calendario") {
      title = `Calendário — ${format(cursor, "MMMM yyyy", { locale: ptBR })}`;
      const start = startOfMonth(cursor);
      const end = endOfMonth(cursor);
      dataset = eachDayOfInterval({ start, end }).flatMap((d) => {
        const day = format(d, "yyyy-MM-dd");
        const inDay = rows.filter(
          (r) =>
            r._start &&
            r._end &&
            d >= r._start &&
            d <= r._end &&
            r.ativa === "Sim",
        );
        if (inDay.length === 0) return [];
        return inDay.map((r) => ({
          data: day,
          campanha: r.nome,
          status: r.status,
          players: r.players,
          itens: r.itens,
        }));
      });
    } else if (scope === "historico") {
      title = "Histórico de campanhas";
      dataset = [...rows]
        .sort((a, b) => (b.criada_em || "").localeCompare(a.criada_em || ""))
        .map(({ _start, _end, ...r }) => {
          void _start;
          void _end;
          return r;
        });
    } else if (scope === "alertas") {
      title = "Alertas de campanhas";
      dataset = alerts.map((a) => ({
        campanha: a.campaignName,
        severidade:
          a.severity === "error"
            ? "Erro"
            : a.severity === "warn"
              ? "Aviso"
              : "Info",
        mensagem: a.message,
      }));
    }

    const download = (content: string, mime: string) => {
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (fmtKind === "json") {
      download(
        JSON.stringify(
          { titulo: title, geradoEm: new Date().toISOString(), dados: dataset },
          null,
          2,
        ),
        "application/json",
      );
    } else if (fmtKind === "csv") {
      if (dataset.length === 0) {
        download("\uFEFFsem dados\r\n", "text/csv");
      } else {
        const headers = Object.keys(dataset[0]);
        const esc = (v: unknown) => {
          const s = v == null ? "" : String(v);
          return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [headers.join(";")];
        for (const row of dataset) {
          lines.push(headers.map((h) => esc(row[h])).join(";"));
        }
        download("\uFEFF" + lines.join("\r\n"), "text/csv");
      }
    } else {
      const escHtml = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const headers = dataset.length ? Object.keys(dataset[0]) : [];
      const body = dataset
        .map(
          (r) =>
            "<tr>" +
            headers.map((h) => `<td>${escHtml(String(r[h] ?? ""))}</td>`).join("") +
            "</tr>",
        )
        .join("");
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escHtml(
        title,
      )}</title><style>body{font-family:-apple-system,Segoe UI,Inter,Roboto,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px;margin:0 0 4px}p{color:#64748b;font-size:12px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #e2e8f0;padding:8px 10px;text-align:left}th{background:#f1f5f9;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#475569}@media print{body{padding:12px}}</style></head><body><h1>${escHtml(
        title,
      )}</h1><p>Gerado em ${escHtml(
        new Date().toLocaleString("pt-BR"),
      )} · ${dataset.length} registro(s)</p><table><thead><tr>${headers
        .map((h) => `<th>${escHtml(h)}</th>`)
        .join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
      download(html, "text/html");
    }
    toast.success("Relatório exportado.");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Programe, publique e acompanhe suas campanhas nos players.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu onExport={exportReport} />
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
              Nova Campanha
            </Button>
          )}
        </div>
      </header>

      {campaignsQ.isLoading ? (
        <GridSkeleton count={4} heightClass="h-28" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Total"
              value={kpis.total}
              icon={Layers}
              tone="default"
            />
            <KpiCard
              label="No ar"
              value={kpis.noAr}
              icon={CircleDot}
              tone="success"
            />
            <KpiCard
              label="Agendadas"
              value={kpis.agendadas}
              icon={CalendarClock}
              tone="info"
            />
            <KpiCard
              label="Encerradas"
              value={kpis.encerradas}
              icon={CalendarX2}
              tone="muted"
            />
            <KpiCard
              label="Players"
              value={playersCountQ.data ?? 0}
              icon={MonitorPlay}
              tone="default"
            />
          </div>

          {alerts.length > 0 && (
            <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Alertas ({alerts.length})
                </CardTitle>
                <CardDescription>
                  Conflitos, prazos e pendências detectadas automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.slice(0, 12).map((a) => {
                  const tone =
                    a.severity === "error"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : a.severity === "warn"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400";
                  const camp = campaigns.find((c) => c.id === a.campaignId);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => camp && setEditing(camp)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left text-xs transition hover:brightness-110",
                        tone,
                      )}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {a.campaignName}
                        </div>
                        <div className="opacity-90">{a.message}</div>
                      </div>
                    </button>
                  );
                })}
                {alerts.length > 12 && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    +{alerts.length - 12} outros alertas.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Tabs
            value={view}
            onValueChange={(v) => setView(v as typeof view)}
            className="space-y-4"
          >
            <TabsList className="rounded-xl">
              <TabsTrigger value="programadas" className="gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Programadas
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5">
                <GanttChartSquare className="h-3.5 w-3.5" /> Linha do tempo
              </TabsTrigger>
              <TabsTrigger value="calendario" className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Calendário
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5">
                <History className="h-3.5 w-3.5" /> Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="programadas" className="mt-0">
          <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Campanhas programadas
                  </CardTitle>
                  <CardDescription>
                    Toda campanha é uma playlist com janela de datas e players
                    associados.
                  </CardDescription>
                </div>
                <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                  <TabsList className="rounded-xl">
                    <TabsTrigger value="todas">Todas</TabsTrigger>
                    <TabsTrigger value="no_ar">No ar</TabsTrigger>
                    <TabsTrigger value="agendada">Agendadas</TabsTrigger>
                    <TabsTrigger value="encerrada">Encerradas</TabsTrigger>
                    <TabsTrigger value="inativa">Inativas</TabsTrigger>
                  </TabsList>
                  <TabsContent value={tab} />
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
                    <Megaphone className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-semibold">
                    Nenhuma campanha nesta visão
                  </h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Crie uma nova campanha para começar a programar seus
                    conteúdos nos players.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campanha</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Janela</TableHead>
                        <TableHead className="text-center">Itens</TableHead>
                        <TableHead className="text-center">Players</TableHead>
                        <TableHead>Progresso</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const s = statusOf(c);
                        const meta = statusMeta(s);
                        const Icon = meta.icon;
                        const start = parseDate(c.schedule_date_start);
                        const end = parseDate(c.schedule_date_end);
                        const items = c.items_count?.[0]?.count ?? 0;
                        const players =
                          playersByCampaign.get(c.id)?.size ??
                          (c.players_count?.[0]?.count ?? 0);
                        const now = today();
                        let progress = 0;
                        if (start && end) {
                          const total = Math.max(
                            1,
                            differenceInCalendarDays(end, start),
                          );
                          const done = Math.min(
                            Math.max(0, differenceInCalendarDays(now, start)),
                            total,
                          );
                          progress = Math.round((done / total) * 100);
                        } else if (s === "no_ar") progress = 50;
                        const hasAlert = alerts.some(
                          (a) =>
                            a.campaignId === c.id && a.severity !== "info",
                        );
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <div className="flex items-center gap-2 font-medium">
                                {hasAlert && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                )}
                                <span className="truncate max-w-[220px]">
                                  {c.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "rounded-full gap-1 text-[10px]",
                                  meta.className,
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {fmt(start)} → {fmt(end)}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {items}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {players}
                            </TableCell>
                            <TableCell className="min-w-[120px]">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    s === "encerrada"
                                      ? "bg-muted-foreground/40"
                                      : s === "no_ar"
                                        ? "bg-emerald-500"
                                        : "bg-sky-500",
                                  )}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                {progress}%
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-lg text-xs"
                                    onClick={() => toggleActive.mutate(c)}
                                  >
                                    {c.is_active ? "Pausar" : "Ativar"}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg text-xs"
                                  onClick={() => setEditing(c)}
                                >
                                  Editar
                                </Button>
                                {canManage && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          Remover campanha?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {c.name} e todos os seus itens serão
                                          removidos.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          Cancelar
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => remove.mutate(c.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Remover
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
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
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <TimelineView
                campaigns={campaigns}
                range={timelineRange}
                onSelect={(c) => setEditing(c)}
              />
            </TabsContent>

            <TabsContent value="calendario" className="mt-0">
              <CalendarView
                campaigns={campaigns}
                cursor={cursor}
                onCursorChange={setCursor}
                onSelect={(c) => setEditing(c)}
              />
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <HistoryView
                campaigns={campaigns}
                onSelect={(c) => setEditing(c)}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {editing && (
        <PlaylistEditor
          playlist={editing}
          open={!!editing}
          canManage={canManage}
          onOpenChange={(v) => {
            if (!v) {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["campaigns-list", orgId] });
              qc.invalidateQueries({
                queryKey: ["campaigns-targeting", orgId],
              });
            }
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Layers;
  tone: "default" | "success" | "info" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500 bg-emerald-500/15"
      : tone === "info"
        ? "text-sky-500 bg-sky-500/15"
        : tone === "muted"
          ? "text-muted-foreground bg-muted"
          : "text-primary bg-primary/15";
  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl",
            toneClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// unused imports guard
void CheckCircle2;

function ExportMenu({
  onExport,
}: {
  onExport: (
    scope: "programadas" | "timeline" | "calendario" | "historico" | "alertas",
    fmt: "csv" | "json" | "html",
  ) => void;
}) {
  const [scope, setScope] = useState<
    "programadas" | "timeline" | "calendario" | "historico" | "alertas"
  >("programadas");
  const scopeLabels: Record<typeof scope, string> = {
    programadas: "Programadas",
    timeline: "Linha do tempo",
    calendario: "Calendário",
    historico: "Histórico",
    alertas: "Alertas",
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 rounded-xl">
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Relatório</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as typeof scope)}
        >
          {(Object.keys(scopeLabels) as (keyof typeof scopeLabels)[]).map(
            (k) => (
              <DropdownMenuRadioItem key={k} value={k}>
                {scopeLabels[k]}
              </DropdownMenuRadioItem>
            ),
          )}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="mr-2 h-4 w-4" /> Baixar como…
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => onExport(scope, "html")}>
                HTML / PDF (imprimir)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport(scope, "csv")}>
                CSV (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExport(scope, "json")}>
                JSON
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TimelineView({
  campaigns,
  range,
  onSelect,
}: {
  campaigns: CampaignRow[];
  range: { start: Date; end: Date };
  onSelect: (c: CampaignRow) => void;
}) {
  const scheduled = campaigns.filter(
    (c) => c.schedule_date_start || c.schedule_date_end,
  );
  const total = Math.max(
    1,
    differenceInCalendarDays(range.end, range.start) + 1,
  );
  const now = today();
  const nowPct =
    now >= range.start && now <= range.end
      ? (differenceInCalendarDays(now, range.start) / total) * 100
      : null;

  const ticks = 6;
  const tickDates = Array.from({ length: ticks + 1 }, (_, i) =>
    addDays(range.start, Math.round((total - 1) * (i / ticks))),
  );

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Linha do tempo</CardTitle>
        <CardDescription>
          Visão horizontal de todas as campanhas por janela de datas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {scheduled.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma campanha com datas definidas.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="relative h-6 border-b border-border/60">
              {tickDates.map((d, i) => (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
                  style={{ left: `${(i / ticks) * 100}%` }}
                >
                  {format(d, "dd/MM", { locale: ptBR })}
                </div>
              ))}
            </div>
            <div className="relative space-y-2">
              {nowPct != null && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary/70"
                  style={{ left: `${nowPct}%` }}
                >
                  <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-primary" />
                </div>
              )}
              {scheduled.map((c) => {
                const s = parseDate(c.schedule_date_start) ?? range.start;
                const e = parseDate(c.schedule_date_end) ?? range.end;
                const left =
                  (Math.max(0, differenceInCalendarDays(s, range.start)) /
                    total) *
                  100;
                const width = Math.max(
                  2,
                  ((differenceInCalendarDays(e, s) + 1) / total) * 100,
                );
                const st = statusOf(c);
                const color =
                  st === "no_ar"
                    ? "bg-emerald-500/80 hover:bg-emerald-500"
                    : st === "agendada"
                      ? "bg-sky-500/80 hover:bg-sky-500"
                      : st === "encerrada"
                        ? "bg-muted-foreground/40 hover:bg-muted-foreground/60"
                        : "bg-amber-500/80 hover:bg-amber-500";
                return (
                  <div
                    key={c.id}
                    className="relative h-8 rounded-lg bg-muted/40"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(c)}
                      title={`${c.name} — ${fmt(s)} → ${fmt(e)}`}
                      className={cn(
                        "absolute top-0 h-full rounded-lg px-2 text-left text-[11px] font-medium text-white transition-all",
                        color,
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className="line-clamp-1 leading-8">{c.name}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CalendarView({
  campaigns,
  cursor,
  onCursorChange,
  onSelect,
}: {
  campaigns: CampaignRow[];
  cursor: Date;
  onCursorChange: (d: Date) => void;
  onSelect: (c: CampaignRow) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const now = today();

  const perDay = (d: Date) =>
    campaigns.filter((c) => {
      const s = parseDate(c.schedule_date_start);
      const e = parseDate(c.schedule_date_end);
      if (!s || !e) return false;
      return d >= s && d <= e && c.is_active;
    });

  const colorFor = (c: CampaignRow) => {
    const st = statusOf(c);
    if (st === "no_ar") return "bg-emerald-500/80";
    if (st === "agendada") return "bg-sky-500/80";
    if (st === "encerrada") return "bg-muted-foreground/40";
    return "bg-amber-500/80";
  };

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base capitalize">
              {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
            </CardTitle>
            <CardDescription>
              Campanhas ativas por dia — clique numa faixa para editar.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onCursorChange(subMonths(cursor, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg text-xs"
              onClick={() => onCursorChange(startOfMonth(today()))}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onCursorChange(addMonths(cursor, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const inMonth = isSameMonth(d, cursor);
            const isToday = isSameDay(d, now);
            const list = perDay(d);
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "min-h-[92px] rounded-lg border border-border/40 bg-background/40 p-1.5 text-left",
                  !inMonth && "opacity-40",
                  isToday && "border-primary/60 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[11px] font-semibold",
                      isToday && "text-primary",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                  {list.length > 0 && (
                    <span className="text-[9px] text-muted-foreground">
                      {list.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {list.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.name}
                      onClick={() => onSelect(c)}
                      className={cn(
                        "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-white transition-opacity hover:opacity-90",
                        colorFor(c),
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                  {list.length > 3 && (
                    <div className="pl-1 text-[9px] text-muted-foreground">
                      +{list.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <LegendDot className="bg-emerald-500/80" label="No ar" />
          <LegendDot className="bg-sky-500/80" label="Agendada" />
          <LegendDot className="bg-amber-500/80" label="Sem janela" />
          <LegendDot className="bg-muted-foreground/40" label="Encerrada" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function HistoryView({
  campaigns,
  onSelect,
}: {
  campaigns: CampaignRow[];
  onSelect: (c: CampaignRow) => void;
}) {
  const events = useMemo(() => {
    const evs: Array<{
      at: string;
      campaign: CampaignRow;
      kind: "created" | "start" | "end" | "paused";
      label: string;
    }> = [];
    const now = today();
    for (const c of campaigns) {
      if (c.created_at) {
        evs.push({
          at: c.created_at,
          campaign: c,
          kind: "created",
          label: "Campanha criada",
        });
      }
      const s = parseDate(c.schedule_date_start);
      if (s) {
        evs.push({
          at: `${c.schedule_date_start}T00:00:00`,
          campaign: c,
          kind: "start",
          label: s <= now ? "Estreia" : "Estreia programada",
        });
      }
      const e = parseDate(c.schedule_date_end);
      if (e) {
        evs.push({
          at: `${c.schedule_date_end}T23:59:00`,
          campaign: c,
          kind: "end",
          label: e < now ? "Encerrou" : "Encerramento previsto",
        });
      }
      if (!c.is_active) {
        evs.push({
          at: c.created_at ?? new Date().toISOString(),
          campaign: c,
          kind: "paused",
          label: "Pausada / inativa",
        });
      }
    }
    return evs.sort((a, b) => b.at.localeCompare(a.at));
  }, [campaigns]);

  const kindMeta = {
    created: { icon: Plus, tone: "text-primary bg-primary/15" },
    start: { icon: CircleDot, tone: "text-emerald-500 bg-emerald-500/15" },
    end: { icon: CalendarX2, tone: "text-muted-foreground bg-muted" },
    paused: { icon: CircleAlert, tone: "text-amber-500 bg-amber-500/15" },
  } as const;

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Histórico</CardTitle>
        <CardDescription>
          Eventos derivados da programação das campanhas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem eventos por enquanto.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-border/60 pl-5">
            {events.slice(0, 100).map((ev, i) => {
              const meta = kindMeta[ev.kind];
              const Icon = meta.icon;
              const when = new Date(ev.at);
              return (
                <li key={`${ev.campaign.id}-${ev.kind}-${i}`} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full",
                      meta.tone,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect(ev.campaign)}
                    className="block w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-left transition hover:bg-background"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {ev.campaign.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(when, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ev.label}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}