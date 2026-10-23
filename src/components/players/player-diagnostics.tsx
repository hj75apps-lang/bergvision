import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

type Action = "PAUSE" | "RESUME" | "SKIP" | "RELOAD_MANIFEST" | "RESTART_APP" | "CLEAR_CACHE";

const ACTIONS: { action: Action; label: string; confirm: string }[] = [
  { action: "PAUSE", label: "Pausar", confirm: "A tela vai pausar a reprodução." },
  { action: "RESUME", label: "Retomar", confirm: "A tela vai retomar a reprodução." },
  { action: "SKIP", label: "Pular item", confirm: "A tela vai pular para o próximo item." },
  { action: "RELOAD_MANIFEST", label: "Recarregar programação", confirm: "A tela vai buscar a programação de novo." },
  { action: "RESTART_APP", label: "Reiniciar app", confirm: "O app da tela será reiniciado. A tela fica preta por alguns segundos." },
  { action: "CLEAR_CACHE", label: "Limpar arquivos salvos", confirm: "A tela apaga os vídeos e imagens salvos e baixa tudo de novo." },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando a tela",
  received: "Recebido",
  executed: "Executado",
  failed: "Falhou",
  expired: "Expirou",
};

const PLAYBACK_LABEL: Record<string, string> = {
  playing: "Tocando",
  buffering: "Carregando",
  paused: "Pausado",
  idle: "Parado",
  error: "Com erro",
};

type DeviceStatusRow = {
  desired_revision: number | null;
  active_revision: number | null;
  manifest_state: string | null;
  playback: string | null;
  current_item_id: string | null;
  player_version: string | null;
  android_version: string | null;
  webview_version: string | null;
  free_storage_bytes: number | null;
  last_error: string | null;
  reported_at: string;
};

type CommandRow = {
  id: string;
  action: string;
  status: string;
  detail: string | null;
  created_at: string;
};

function fmtBytes(n: number | null): string {
  if (n === null || n === undefined) return "Não informado";
  const gb = n / 1024 / 1024 / 1024;
  return gb >= 1 ? gb.toFixed(1) + " GB" : Math.round(n / 1024 / 1024) + " MB";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function show(v: string | number | null): string {
  return v === null || v === undefined || v === "" ? "Não informado" : String(v);
}

export function PlayerDiagnostics({
  playerId,
  organizationId,
  canCommand,
  open,
}: {
  playerId: string;
  organizationId: string;
  canCommand: boolean;
  open: boolean;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null);

  const statusQ = useQuery({
    queryKey: ["device-status", playerId],
    enabled: open,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_status" as never)
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();
      if (error) throw error;
      return data as DeviceStatusRow | null;
    },
  });

  const cmdsQ = useQuery({
    queryKey: ["device-commands", playerId],
    enabled: open,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_commands" as never)
        .select("id, action, status, detail, created_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as CommandRow[];
    },
  });

  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel("diag-" + playerId)
      .on("postgres_changes", { event: "*", schema: "public", table: "device_status", filter: "player_id=eq." + playerId }, () =>
        qc.invalidateQueries({ queryKey: ["device-status", playerId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "device_commands", filter: "player_id=eq." + playerId }, () =>
        qc.invalidateQueries({ queryKey: ["device-commands", playerId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, playerId, qc]);

  const send = useMutation({
    mutationFn: async (action: Action) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("device_commands" as never).insert({
        organization_id: organizationId,
        player_id: playerId,
        action,
        args: {},
        expected_revision: null,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        status: "pending",
        created_by: u.user ? u.user.id : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comando enviado. Aguardando confirmação da tela.");
      qc.invalidateQueries({ queryKey: ["device-commands", playerId] });
    },
    onError: (e: Error) => toast.error("Não foi possível enviar: " + e.message),
  });

  const s = statusQ.data;
  const tableMissing = statusQ.error && /does not exist|schema cache/i.test(String((statusQ.error as Error).message));

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Diagnóstico da tela</h3>
        <p className="text-xs text-muted-foreground">Dados enviados pelo próprio aparelho. Nada é estimado.</p>
      </div>

      {tableMissing ? (
        <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          As tabelas de diagnóstico ainda não foram criadas no banco.
        </p>
      ) : statusQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !s ? (
        <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Esta tela ainda não enviou diagnóstico. O app das telas precisa estar atualizado.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Info label="Reprodução" value={s.playback ? PLAYBACK_LABEL[s.playback] || s.playback : "Não informado"} />
          <Info label="Último relatório" value={fmtTime(s.reported_at)} />
          <Info label="Versão desejada / ativa" value={show(s.desired_revision) + " / " + show(s.active_revision)} />
          <Info label="Programação" value={show(s.manifest_state)} />
          <Info label="Item atual" value={show(s.current_item_id)} />
          <Info label="Espaço livre" value={fmtBytes(s.free_storage_bytes)} />
          <Info label="App da tela" value={show(s.player_version)} />
          <Info label="Android / WebView" value={show(s.android_version) + " / " + show(s.webview_version)} />
          {s.last_error && (
            <div className="col-span-2 rounded-xl bg-destructive/10 p-2 text-destructive">Último erro: {s.last_error}</div>
          )}
        </div>
      )}

      {canCommand && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Comandos</div>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <Button key={a.action} variant="outline" size="sm" className="h-8 rounded-xl" disabled={send.isPending} onClick={() => setPending(a)}>
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {(cmdsQ.data ?? []).length > 0 && (
        <ul className="space-y-1 text-xs">
          {(cmdsQ.data ?? []).map((c) => {
            const meta = ACTIONS.find((a) => a.action === c.action);
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
                <span className="truncate">{meta ? meta.label : c.action} · {fmtTime(c.created_at)}</span>
                <span className={c.status === "executed" ? "text-emerald-500" : c.status === "failed" || c.status === "expired" ? "text-destructive" : "text-muted-foreground"}>
                  {STATUS_LABEL[c.status] || c.status}
                  {c.detail ? " (" + c.detail + ")" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? pending.label : ""}?</AlertDialogTitle>
            <AlertDialogDescription>{pending ? pending.confirm + " O comando vale por 10 minutos." : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) send.mutate(pending.action);
                setPending(null);
              }}
            >
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
