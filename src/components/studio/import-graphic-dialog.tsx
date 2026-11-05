import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  importPng,
  importPsd,
  validateImportFile,
  detectKind,
  type ImportReport,
} from "@/lib/studio/graphic-import";

type Phase =
  | { s: "idle" }
  | { s: "reading" }
  | { s: "ready"; report: ImportReport; fileName: string }
  | { s: "saving"; done: number; total: number }
  | { s: "error"; message: string };

export function ImportGraphicDialog({
  open,
  onOpenChange,
  canvasWidth,
  canvasHeight,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canvasWidth: number;
  canvasHeight: number;
  /** Persiste as camadas. Deve lançar erro em caso de falha. */
  onConfirm: (
    report: ImportReport,
    fileName: string,
    onProgress: (done: number, total: number) => void,
  ) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [includeHidden, setIncludeHidden] = useState(false);

  const reset = () => setPhase({ s: "idle" });

  const handleFile = async (file: File) => {
    setPhase({ s: "reading" });
    try {
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const err = validateImportFile(file.name, file.size, head);
      if (err) {
        setPhase({ s: "error", message: err });
        return;
      }
      const kind = detectKind(head);
      const report = kind === "png" ? await importPng(file, canvasWidth, canvasHeight) : await importPsd(file);
      if (report.layers.length === 0) {
        setPhase({ s: "error", message: "Nenhuma camada compatível foi encontrada no arquivo." });
        return;
      }
      if (kind === "psd") {
        const psdRatio = report.sourceWidth / report.sourceHeight;
        const canvasRatio = canvasWidth / canvasHeight;
        if (Math.abs(psdRatio - canvasRatio) > 0.02) {
          report.warnings.unshift(
            `O PSD (${report.sourceWidth}×${report.sourceHeight}) tem proporção diferente do template (${canvasWidth}×${canvasHeight}); as posições serão ajustadas à área do template e as camadas podem ficar esticadas.`,
          );
        }
      }
      console.log("[ImportGraphic:read]", { file: file.name, kind, layers: report.layers.length, warnings: report.warnings.length });
      setPhase({ s: "ready", report, fileName: file.name });
    } catch (e) {
      console.log("[ImportGraphic:error]", e);
      setPhase({ s: "error", message: e instanceof Error ? e.message : "Falha ao processar o arquivo." });
    }
  };

  const confirm = async () => {
    if (phase.s !== "ready") return;
    const report: ImportReport = {
      ...phase.report,
      layers: includeHidden ? phase.report.layers : phase.report.layers.filter((l) => l.visible),
    };
    if (report.layers.length === 0) {
      setPhase({ s: "error", message: "Todas as camadas estão ocultas. Ative \"Incluir camadas ocultas\"." });
      return;
    }
    const keep = phase;
    setPhase({ s: "saving", done: 0, total: report.layers.length });
    try {
      await onConfirm(report, phase.fileName.replace(/\.(png|psd)$/i, ""), (done, total) =>
        setPhase({ s: "saving", done, total }),
      );
      reset();
      onOpenChange(false);
    } catch (e) {
      console.log("[ImportGraphic:saveError]", e);
      setPhase({ s: "error", message: e instanceof Error ? e.message : "Falha ao salvar a importação." });
      void keep;
    }
  };

  const images = phase.s === "ready" ? phase.report.layers.filter((l) => l.kind === "image").length : 0;
  const texts = phase.s === "ready" ? phase.report.layers.filter((l) => l.kind === "text").length : 0;
  const hidden = phase.s === "ready" ? phase.report.layers.filter((l) => !l.visible).length : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (phase.s !== "saving") { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar PNG ou PSD</DialogTitle>
          <DialogDescription>
            PNG mantém a transparência. No PSD, camadas de imagem e de texto viram objetos editáveis, com nomes, ordem e posição originais.
          </DialogDescription>
        </DialogHeader>

        <input ref={inputRef} type="file" accept=".png,.psd,image/png,image/vnd.adobe.photoshop" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleFile(f); }} />

        {(phase.s === "idle" || phase.s === "error") && (
          <div className="space-y-3">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-primary">
              <FileUp className="h-6 w-6" />
              Escolher arquivo (.png até 25 MB, .psd até 150 MB)
            </button>
            {phase.s === "error" && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {phase.message}
              </p>
            )}
          </div>
        )}

        {phase.s === "reading" && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo o arquivo…
          </p>
        )}

        {phase.s === "ready" && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {phase.fileName}: {images} imagem(ns) e {texts} texto(s) prontos para importar.
            </p>
            {hidden > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-2">
                <Label className="text-xs">Incluir {hidden} camada(s) oculta(s)</Label>
                <Switch checked={includeHidden} onCheckedChange={setIncludeHidden} />
              </div>
            )}
            {phase.report.warnings.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-auto rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                {phase.report.warnings.map((w) => (
                  <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>
                ))}
              </ul>
            )}
            {texts > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Textos usam a fonte do PSD quando ela estiver disponível; caso contrário, aparecem com uma fonte parecida.
              </p>
            )}
          </div>
        )}

        {phase.s === "saving" && (
          <div className="space-y-2 py-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando camadas para a Biblioteca ({phase.done}/{phase.total})…
            </p>
            <Progress value={(phase.done / Math.max(1, phase.total)) * 100} />
          </div>
        )}

        <DialogFooter>
          {phase.s === "ready" && (
            <>
              <Button variant="ghost" onClick={reset}>Escolher outro</Button>
              <Button onClick={() => void confirm()}>Importar para o canvas</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
