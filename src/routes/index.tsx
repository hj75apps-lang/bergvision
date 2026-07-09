import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Berg Vision" },
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

const stats: Stat[] = [
  {
    label: "Total de players",
    value: "42",
    hint: "12 unidades ativas nesta semana",
    trend: "+3",
    icon: MonitorPlay,
    tone: "primary",
  },
  {
    label: "Players online",
    value: "38",
    hint: "90% da rede conectada agora",
    trend: "+2",
    icon: Signal,
    tone: "success",
  },
  {
    label: "Players offline",
    value: "4",
    hint: "Última desconexão há 12 min",
    trend: "-1",
    icon: SignalZero,
    tone: "danger",
  },
  {
    label: "Próximos agendamentos",
    value: "07",
    hint: "Nas próximas 24 horas",
    icon: CalendarClock,
    tone: "warning",
  },
];

const upcoming = [
  { title: "Campanha de Verão · Loja Centro", when: "Hoje, 14:00", tag: "Playlist" },
  { title: "Promoção Relâmpago · Shopping Norte", when: "Hoje, 18:30", tag: "Template" },
  { title: "Cardápio Digital · Filial Sul", when: "Amanhã, 07:00", tag: "Mídia" },
  { title: "Institucional Q4 · Recepção HQ", when: "Amanhã, 09:00", tag: "Template" },
];

const toneRing: Record<Stat["tone"], string> = {
  primary: "from-primary/25 to-primary/0 text-primary",
  success: "from-success/25 to-success/0 text-success",
  danger: "from-destructive/25 to-destructive/0 text-destructive",
  warning: "from-warning/25 to-warning/0 text-warning",
};

function DashboardPage() {
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
          Dados mockados
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
                  Próximos agendamentos
                </CardTitle>
                <CardDescription>
                  Campanhas programadas nas próximas 24 horas.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {upcoming.length} itens
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {upcoming.map((item) => (
              <div
                key={item.title}
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
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Saúde da rede</CardTitle>
            <CardDescription>Status agregado dos players.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StatusRow label="Online" value={38} total={42} tone="success" />
            <StatusRow label="Offline" value={4} total={42} tone="danger" />
            <StatusRow label="Sincronizando" value={2} total={42} tone="warning" />
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
  const pct = Math.round((value / total) * 100);
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
