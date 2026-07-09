import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Monitor, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const PLAYER_PREVIEW_URL = (
  import.meta.env.VITE_PLAYER_PREVIEW_URL ?? ""
).replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Resoluções simuladas
// ---------------------------------------------------------------------------

type Resolution = {
  id: string;
  label: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
};

const RESOLUTIONS: Resolution[] = [
  { id: "fhd", label: "Full HD (1920×1080)", width: 1920, height: 1080, orientation: "landscape" },
  { id: "qhd", label: "2K (2560×1440)", width: 2560, height: 1440, orientation: "landscape" },
  { id: "4k", label: "4K (3840×2160)", width: 3840, height: 2160, orientation: "landscape" },
  { id: "p-fhd", label: "Full HD retrato (1080×1920)", width: 1080, height: 1920, orientation: "portrait" },
  { id: "p-qhd", label: "2K retrato (1440×2560)", width: 1440, height: 2560, orientation: "portrait" },
  { id: "p-4k", label: "4K retrato (2160×3840)", width: 2160, height: 3840, orientation: "portrait" },
];

// ---------------------------------------------------------------------------
// PostMessage protocolo
// ---------------------------------------------------------------------------

type IncomingMessage = { type: "PREVIEW_READY" };
type OutgoingMessage = {
  type: "PREVIEW_DRAFT_UPDATE";
  payload: unknown;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type PreviewScope = "template" | "player" | "playlist";

export type PreviewPanelProps = {
  scope: PreviewScope;
  /** Alvo real quando não há draft. */
  targetId?: string;
  /** Payload de rascunho — quando presente, ignora targetId/token. */
  draftData?: unknown;
  mode: "modal" | "inline";
  /** Somente para o modo modal — controla abertura. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Resolução inicial (default: Full HD). */
  defaultResolutionId?: string;
  className?: string;
};

// ---------------------------------------------------------------------------
// Hook interno com toda a lógica do iframe
// ---------------------------------------------------------------------------

function usePreviewController({
  scope,
  targetId,
  draftData,
  active,
  defaultResolutionId,
}: {
  scope: PreviewScope;
  targetId?: string;
  draftData?: unknown;
  active: boolean;
  defaultResolutionId?: string;
}) {
  const isDraft = draftData !== undefined;

  const [resolutionId, setResolutionId] = useState<string>(
    defaultResolutionId ?? "fhd",
  );
  const resolution =
    RESOLUTIONS.find((r) => r.id === resolutionId) ?? RESOLUTIONS[0];

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Cria token via Edge Function quando não é draft.
  const tokenMut = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("targetId ausente");
      const { data, error } = await supabase.functions.invoke(
        "create-preview-token",
        { body: { scope, target_id: targetId } },
      );
      if (error) throw error;
      const t = (data as { token?: string })?.token;
      if (!t) throw new Error("Resposta sem token");
      return t;
    },
    onSuccess: (t) => {
      setToken(t);
      setError(null);
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Falha ao gerar preview"),
  });

  useEffect(() => {
    if (!active) return;
    if (isDraft) return;
    setReady(false);
    setToken(null);
    tokenMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isDraft, scope, targetId]);

  // URL do iframe
  const iframeSrc = useMemo(() => {
    if (!PLAYER_PREVIEW_URL) return "";
    if (isDraft) return `${PLAYER_PREVIEW_URL}/preview`;
    if (!token) return "";
    const qs = new URLSearchParams({
      token,
      resolution: `${resolution.width}x${resolution.height}`,
      orientation: resolution.orientation,
    });
    return `${PLAYER_PREVIEW_URL}/preview?${qs.toString()}`;
  }, [isDraft, token, resolution]);

  // Recebe PREVIEW_READY do iframe
  useEffect(() => {
    if (!active) return;
    const onMessage = (ev: MessageEvent) => {
      if (!PLAYER_PREVIEW_URL) return;
      if (ev.origin !== PLAYER_PREVIEW_URL) return;
      const msg = ev.data as IncomingMessage | null;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "PREVIEW_READY") setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active]);

  // Reseta "ready" quando trocamos a URL (novo token/resolução/draft mount)
  useEffect(() => {
    setReady(false);
  }, [iframeSrc]);

  // ---- Draft: envia PREVIEW_DRAFT_UPDATE ao iframe ----
  const postDraft = (payload: unknown) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !PLAYER_PREVIEW_URL) return;
    const message: OutgoingMessage = {
      type: "PREVIEW_DRAFT_UPDATE",
      payload,
    };
    win.postMessage(message, PLAYER_PREVIEW_URL);
  };

  // Envio imediato quando iframe fica ready (modo draft)
  useEffect(() => {
    if (!isDraft || !ready) return;
    postDraft(draftData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isDraft]);

  // Reenvio com debounce sempre que draftData muda por identidade
  useEffect(() => {
    if (!isDraft || !ready) return;
    const handle = window.setTimeout(() => postDraft(draftData), 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftData, isDraft, ready]);

  return {
    iframeRef,
    iframeSrc,
    ready,
    error,
    isTokenLoading: !isDraft && (tokenMut.isPending || (!token && !error)),
    resolutionId,
    setResolutionId,
    resolution,
    isDraft,
  };
}

// ---------------------------------------------------------------------------
// UI compartilhada (toolbar + palco do iframe)
// ---------------------------------------------------------------------------

function PreviewBody({
  ctrl,
  onClose,
  variant,
}: {
  ctrl: ReturnType<typeof usePreviewController>;
  onClose?: () => void;
  variant: "modal" | "inline";
}) {
  const {
    iframeRef,
    iframeSrc,
    ready,
    error,
    isTokenLoading,
    resolutionId,
    setResolutionId,
    isDraft,
  } = ctrl;

  const envMissing = !PLAYER_PREVIEW_URL;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden",
        variant === "modal" ? "bg-neutral-950" : "bg-neutral-950/60 rounded-xl border border-border/60",
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1 text-white">
            <Monitor className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Preview {isDraft ? "· rascunho" : "· ao vivo"}
            </span>
          </div>
          <Select value={resolutionId} onValueChange={setResolutionId}>
            <SelectTrigger className="h-8 min-w-[220px] rounded-lg border-white/10 bg-white/10 text-xs text-white hover:bg-white/15">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Paisagem
                </SelectLabel>
                {RESOLUTIONS.filter((r) => r.orientation === "landscape").map(
                  (r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Retrato
                </SelectLabel>
                {RESOLUTIONS.filter((r) => r.orientation === "portrait").map(
                  (r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {onClose && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 rounded-lg bg-white/10 text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Fechar
          </Button>
        )}
      </div>

      {/* Palco */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {envMissing ? (
          <StatusOverlay
            title="VITE_PLAYER_PREVIEW_URL não configurada"
            detail="Defina a URL do Player publicado para habilitar o preview."
          />
        ) : error ? (
          <StatusOverlay title="Falha ao gerar preview" detail={error} />
        ) : (
          <>
            {iframeSrc && (
              <iframe
                ref={iframeRef}
                key={iframeSrc}
                src={iframeSrc}
                title="Preview do Player"
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                allow="autoplay; fullscreen"
              />
            )}
            {(isTokenLoading || !ready) && (
              <StatusOverlay
                spinner
                title={isTokenLoading ? "Preparando preview…" : "Carregando conteúdo…"}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusOverlay({
  title,
  detail,
  spinner = false,
}: {
  title: string;
  detail?: string;
  spinner?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl bg-white/5 px-6 py-5 text-center text-white shadow-xl ring-1 ring-white/10">
        {spinner && <Loader2 className="h-5 w-5 animate-spin text-white/80" />}
        <p className="text-sm font-medium">{title}</p>
        {detail && (
          <p className="max-w-xs text-xs text-white/70">{detail}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente público
// ---------------------------------------------------------------------------

export function PreviewPanel(props: PreviewPanelProps) {
  const {
    scope,
    targetId,
    draftData,
    mode,
    open,
    onOpenChange,
    defaultResolutionId,
    className,
  } = props;

  const active = mode === "inline" ? true : !!open;

  const ctrl = usePreviewController({
    scope,
    targetId,
    draftData,
    active,
    defaultResolutionId,
  });

  if (mode === "modal") {
    return (
      <Dialog open={!!open} onOpenChange={onOpenChange}>
        <DialogContent
          className="!fixed !inset-0 !left-0 !top-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 !p-0 !bg-black !h-screen !w-screen data-[state=open]:!animate-none data-[state=closed]:!animate-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <PreviewBody
            ctrl={ctrl}
            variant="modal"
            onClose={() => onOpenChange?.(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <PreviewBody ctrl={ctrl} variant="inline" />
    </div>
  );
}

export default PreviewPanel;