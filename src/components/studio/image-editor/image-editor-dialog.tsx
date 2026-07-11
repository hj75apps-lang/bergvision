import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { toast } from "sonner";
import {
  Brush,
  Crop as CropIcon,
  Eraser,
  Loader2,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Sliders,
  Undo2,
  Wand2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { saveEditedImage } from "@/lib/studio/image-editor/save";
import type { PickerMediaFile } from "@/components/studio/media-picker-dialog";

/**
 * Editor de imagens do Studio.
 * Roda 100% no navegador — nenhuma imagem sai do dispositivo do usuário.
 * Cada aba aplica sua operação sobre o blob atual e empilha um novo estado
 * no histórico (undo/redo). Ao salvar, o operador escolhe entre substituir
 * o arquivo original na Biblioteca ou criar uma cópia editada.
 */

type MediaSource = {
  mediaFileId: string;
  storagePath: string;
  thumbnailPath: string | null;
  name: string;
};

export type ImageEditorSave = {
  mediaFile: PickerMediaFile;
  cacheBust: number;
};

export function ImageEditorDialog({
  open,
  onOpenChange,
  source,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: MediaSource | null;
  onSaved: (result: ImageEditorSave) => void;
}) {
  const { membership, user } = useAuth();
  const orgId = membership?.organization_id ?? null;

  const signedUrl = useSignedUrl(source?.storagePath ?? null);
  const [history, setHistory] = useState<Blob[]>([]);
  const [cursor, setCursor] = useState(0);
  const currentBlob = history[cursor] ?? null;

  const currentUrl = useObjectUrl(currentBlob);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [tab, setTab] = useState<"crop" | "bg" | "draw" | "adjust">("crop");
  const [loadingSource, setLoadingSource] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Carrega o blob original ao abrir.
  useEffect(() => {
    if (!open || !signedUrl) return;
    let alive = true;
    setLoadingSource(true);
    (async () => {
      try {
        const res = await fetch(signedUrl);
        const b = await res.blob();
        if (!alive) return;
        setHistory([b]);
        setCursor(0);
      } catch {
        if (alive) toast.error("Falha ao carregar a imagem.");
      } finally {
        if (alive) setLoadingSource(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, signedUrl]);

  // Reseta ao fechar
  useEffect(() => {
    if (!open) {
      setHistory([]);
      setCursor(0);
      setTab("crop");
    }
  }, [open]);

  // Descobre dimensões do blob atual
  useEffect(() => {
    if (!currentUrl) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = currentUrl;
  }, [currentUrl]);

  const pushBlob = useCallback(
    (b: Blob) => {
      setHistory((prev) => {
        const next = prev.slice(0, cursor + 1);
        next.push(b);
        return next;
      });
      setCursor((c) => c + 1);
    },
    [cursor],
  );

  const canUndo = cursor > 0;
  const canRedo = cursor < history.length - 1;
  const dirty = cursor > 0;

  const doSave = async (mode: "new" | "replace") => {
    if (!currentBlob || !orgId || !source) return;
    setSaving(true);
    try {
      const result = await saveEditedImage({
        blob: currentBlob,
        width: dims.w,
        height: dims.h,
        orgId,
        uploaderId: user?.id ?? null,
        mode,
        original: {
          id: source.mediaFileId,
          name: source.name,
          storage_path: source.storagePath,
          thumbnail_path: source.thumbnailPath,
        },
      });
      onSaved({ mediaFile: result.mediaFile, cacheBust: result.cacheBust });
      toast.success(
        mode === "replace" ? "Original substituído." : "Cópia editada salva.",
      );
      setSaveOpen(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && dirty) {
            if (!window.confirm("Descartar edições não salvas?")) return;
          }
          onOpenChange(v);
        }}
      >
        <DialogContent className="flex h-[95vh] max-h-[95vh] w-[96vw] max-w-6xl flex-col overflow-hidden rounded-2xl p-0 sm:h-[92vh]">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-primary" />
              Editor de imagem
            </DialogTitle>
            <DialogDescription className="text-xs">
              Todas as edições rodam localmente no seu navegador. Nada é enviado
              a servidores externos.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[1fr_320px]">
            {/* Canvas */}
            <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-[repeating-conic-gradient(#0000_0deg_90deg,#ffffff10_90deg_180deg)] bg-[length:20px_20px] p-2 sm:p-4 md:min-h-0">
              {loadingSource || !currentUrl ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : tab === "crop" ? (
                <CropStage url={currentUrl} onApply={pushBlob} />
              ) : tab === "draw" ? (
                <DrawStage url={currentUrl} onApply={pushBlob} />
              ) : (
                <img
                  src={currentUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain shadow-lg"
                />
              )}
            </div>

            {/* Sidebar */}
            <div className="flex max-h-[45vh] flex-col border-t border-border/60 bg-card/40 md:max-h-none md:border-l md:border-t-0">
              <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!canUndo}
                  onClick={() => setCursor((c) => Math.max(0, c - 1))}
                  title="Desfazer"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!canRedo}
                  onClick={() =>
                    setCursor((c) => Math.min(history.length - 1, c + 1))
                  }
                  title="Refazer"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!dirty}
                  onClick={() => setCursor(0)}
                  title="Reverter tudo"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <div className="ml-auto text-[10px] text-muted-foreground">
                  {dims.w ? `${dims.w}×${dims.h}` : ""}
                </div>
              </div>

              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as typeof tab)}
                className="flex flex-1 flex-col"
              >
                <TabsList className="mx-3 mt-3 grid grid-cols-4">
                  <TabsTrigger value="crop" title="Recortar">
                    <CropIcon className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="bg" title="Remover fundo">
                    <Scissors className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="draw" title="Pincel">
                    <Brush className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="adjust" title="Ajustes">
                    <Sliders className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto p-3">
                  <TabsContent value="crop" className="m-0 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Arraste no canvas para definir a área. Use os presets para
                      travar a proporção. Clique em <strong>Aplicar</strong>{" "}
                      para confirmar.
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Dica: use os botões dentro do painel do canvas.
                    </p>
                  </TabsContent>

                  <TabsContent value="bg" className="m-0 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Remove o fundo automaticamente e gera um PNG transparente.
                      A primeira execução baixa um modelo (~50&nbsp;MB) — depois
                      fica em cache offline.
                    </p>
                    {currentBlob && (
                      <BgRemoveButton
                        blob={currentBlob}
                        onApply={pushBlob}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="draw" className="m-0 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Desenhe livremente sobre a imagem. As opções de cor,
                      espessura e borracha aparecem sobre o canvas.
                    </p>
                  </TabsContent>

                  <TabsContent value="adjust" className="m-0">
                    {currentBlob && (
                      <AdjustPanel blob={currentBlob} onApply={pushBlob} />
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!dirty || saving}
              onClick={() => setSaveOpen(true)}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Como salvar as edições?</AlertDialogTitle>
            <AlertDialogDescription>
              Você pode manter o arquivo original intacto e criar uma cópia
              editada, ou sobrescrever o original — nesse caso a mudança vale
              para todos os templates que já usam essa mídia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              disabled={saving}
              onClick={() => void doSave("new")}
              className="justify-start"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar como nova mídia (recomendado)
            </Button>
            <Button
              disabled={saving}
              variant="destructive"
              onClick={() => {
                if (
                  window.confirm(
                    "Substituir o arquivo original? Todos os templates que usam esta mídia serão afetados.",
                  )
                ) {
                  void doSave("replace");
                }
              }}
              className="justify-start"
            >
              Substituir arquivo original
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="hidden" />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------- URL utilitário ----------

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

// ============================================================
// CROP
// ============================================================

const CROP_ASPECTS: Array<{ id: string; label: string; value?: number }> = [
  { id: "free", label: "Livre" },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
];

function CropStage({
  url,
  onApply,
}: {
  url: string;
  onApply: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const apply = async () => {
    const img = imgRef.current;
    if (!img || !completed || completed.width < 1 || completed.height < 1)
      return;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const sx = completed.x * scaleX;
    const sy = completed.y * scaleY;
    const sw = completed.width * scaleX;
    const sh = completed.height * scaleY;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas);
    if (blob) onApply(blob);
  };

  return (
    <div className="flex max-h-full w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {CROP_ASPECTS.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={
              (a.value ?? undefined) === aspect ? "default" : "outline"
            }
            className="h-7 px-2 text-[11px]"
            onClick={() => setAspect(a.value)}
          >
            {a.label}
          </Button>
        ))}
        <div className="mx-2 h-4 w-px bg-border" />
        <Button size="sm" className="h-7 px-3 text-[11px]" onClick={apply}>
          Aplicar recorte
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setCompleted(c)}
          aspect={aspect}
          keepSelection
        >
          <img
            ref={imgRef}
            src={url}
            alt=""
            className="max-h-[55vh] max-w-full object-contain md:max-h-[65vh]"
          />
        </ReactCrop>
      </div>
    </div>
  );
}

// ============================================================
// REMOVER FUNDO
// ============================================================

function BgRemoveButton({
  blob,
  onApply,
}: {
  blob: Blob;
  onApply: (b: Blob) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const run = async () => {
    setBusy(true);
    setProgress(0);
    try {
      const mod = await import("@imgly/background-removal");
      const removeBackground =
        (mod as { removeBackground?: (...a: unknown[]) => Promise<Blob> })
          .removeBackground ??
        (mod as unknown as { default: (...a: unknown[]) => Promise<Blob> })
          .default;
      const out = await removeBackground(blob, {
        progress: (_key: string, current: number, total: number) => {
          if (total > 0) setProgress(Math.round((current / total) * 100));
        },
      });
      onApply(out);
      toast.success("Fundo removido.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Falha ao remover o fundo.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={run}
        disabled={busy}
        className="w-full"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Scissors className="mr-2 h-4 w-4" />
        )}
        Remover fundo
      </Button>
      {progress !== null && (
        <div className="text-center text-[11px] text-muted-foreground">
          Processando… {progress}%
        </div>
      )}
    </div>
  );
}

// ============================================================
// PINCEL / CANETA
// ============================================================

function DrawStage({
  url,
  onApply,
}: {
  url: string;
  onApply: (b: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [color, setColor] = useState("#FF3B30");
  const [size, setSize] = useState(8);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [ready, setReady] = useState(false);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokesRef = useRef<ImageData[]>([]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      strokesRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
      setReady(true);
    };
    img.src = url;
  }, [url]);

  const posFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    drawing.current = true;
    last.current = posFromEvent(e);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = posFromEvent(e);
    ctx.save();
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    last.current = p;
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    strokesRef.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    );
  };

  const undoStroke = () => {
    if (strokesRef.current.length <= 1) return;
    strokesRef.current.pop();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = strokesRef.current[strokesRef.current.length - 1];
    if (ctx && last) ctx.putImageData(last, 0, 0);
  };

  const apply = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await canvasToBlob(canvas);
    if (blob) onApply(blob);
  };

  return (
    <div className="flex max-h-full w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2">
        <Button
          size="sm"
          variant={tool === "brush" ? "default" : "outline"}
          className="h-7 px-2"
          onClick={() => setTool("brush")}
        >
          <Brush className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant={tool === "eraser" ? "default" : "outline"}
          className="h-7 px-2"
          onClick={() => setTool("eraser")}
        >
          <Eraser className="h-3.5 w-3.5" />
        </Button>
        <div className="h-4 w-px bg-border" />
        <Input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-10 p-0.5"
          disabled={tool === "eraser"}
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">px</span>
          <Slider
            value={[size]}
            min={1}
            max={80}
            step={1}
            onValueChange={([v]) => setSize(v)}
            className="w-28"
          />
          <span className="w-6 text-[10px] tabular-nums text-muted-foreground">
            {size}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={undoStroke}
        >
          <Undo2 className="mr-1 h-3 w-3" /> Traço
        </Button>
        <Button size="sm" className="h-7 px-3 text-[11px]" onClick={apply}>
          Aplicar desenho
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className={cn(
            "max-h-[65vh] max-w-full touch-none shadow-lg",
            tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
          )}
          style={{ objectFit: "contain" }}
        />
      </div>
    </div>
  );
}

// ============================================================
// AJUSTES (brilho/contraste/saturação/blur/grayscale)
// ============================================================

type Adjust = {
  brightness: number; // 0..200 (100 = normal)
  contrast: number; // 0..200
  saturate: number; // 0..200
  blur: number; // 0..20 px
  grayscale: number; // 0..100 %
};

const ADJUST_DEFAULT: Adjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
};

function adjustToFilter(a: Adjust): string {
  return [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturate}%)`,
    a.blur ? `blur(${a.blur}px)` : "",
    a.grayscale ? `grayscale(${a.grayscale}%)` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function AdjustPanel({
  blob,
  onApply,
}: {
  blob: Blob;
  onApply: (b: Blob) => void;
}) {
  const [a, setA] = useState<Adjust>(ADJUST_DEFAULT);
  const url = useObjectUrl(blob);

  const set = (k: keyof Adjust, v: number) =>
    setA((prev) => ({ ...prev, [k]: v }));

  const apply = async () => {
    if (!url) return;
    const img = new Image();
    img.src = url;
    await new Promise<void>((r) => {
      img.onload = () => r();
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = adjustToFilter(a);
    ctx.drawImage(img, 0, 0);
    const out = await canvasToBlob(canvas);
    if (out) {
      onApply(out);
      setA(ADJUST_DEFAULT);
    }
  };

  return (
    <div className="space-y-3">
      {url && (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-black/20">
          <img
            src={url}
            alt=""
            style={{ filter: adjustToFilter(a) }}
            className="mx-auto max-h-40 w-auto"
          />
        </div>
      )}
      <SliderRow
        label="Brilho"
        value={a.brightness}
        min={0}
        max={200}
        onChange={(v) => set("brightness", v)}
      />
      <SliderRow
        label="Contraste"
        value={a.contrast}
        min={0}
        max={200}
        onChange={(v) => set("contrast", v)}
      />
      <SliderRow
        label="Saturação"
        value={a.saturate}
        min={0}
        max={200}
        onChange={(v) => set("saturate", v)}
      />
      <SliderRow
        label="Desfoque (px)"
        value={a.blur}
        min={0}
        max={20}
        onChange={(v) => set("blur", v)}
      />
      <SliderRow
        label="Escala de cinza (%)"
        value={a.grayscale}
        min={0}
        max={100}
        onChange={(v) => set("grayscale", v)}
      />
      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setA(ADJUST_DEFAULT)}
        >
          Redefinir
        </Button>
        <Button size="sm" onClick={apply}>
          Aplicar ajustes
        </Button>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <Label className="text-[11px]">{label}</Label>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}