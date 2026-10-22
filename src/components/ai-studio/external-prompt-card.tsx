import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = { prompt: string; kind: "imagem" | "vídeo" };

export function ExternalPromptCard({ prompt, kind }: Props) {
  const [open, setOpen] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <ExternalLink className="h-3.5 w-3.5" />
          Usar em outra plataforma
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Ocultar" : "Ver prompt"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={copy}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Prompt profissional para gerar a {kind} no ChatGPT, Gemini, Midjourney, Runway, Sora ou outra ferramenta.
      </p>
      {open && <Textarea readOnly className="mt-2 font-mono text-xs" rows={12} value={prompt} />}
    </div>
  );
}
