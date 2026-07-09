import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Monitor, X } from "lucide-react";

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
import { ElementBody, TemplateBackground } from "./element-body";
import type { CanvasTemplate, TemplateElement } from "@/lib/studio/types";

export type PreviewTemplate = CanvasTemplate & {
  scaling_mode?: string | null;
  background_media_id?: string | null;
};

type ResPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  group: "landscape" | "portrait" | "other";
};

const RES_PRESETS: ResPreset[] = [
  { id: "hd", label: "HD (1280×720)", width: 1280, height: 720, group: "landscape" },
  { id: "fhd", label: "Full HD (1920×1080)", width: 1920, height: 1080, group: "landscape" },
  { id: "qhd", label: "2K QHD (2560×1440)", width: 2560, height: 1440, group: "landscape" },
  { id: "4k", label: "4K UHD (3840×2160)", width: 3840, height: 2160, group: "landscape" },
  { id: "uw", label: "Ultrawide (3440×1440)", width: 3440, height: 1440, group: "other" },
  { id: "sq", label: "Square (1080×1080)", width: 1080, height: 1080, group: "other" },
  { id: "p-hd", label: "HD retrato (720×1280)", width: 720, height: 1280, group: "portrait" },
  { id: "p-fhd", label: "Full HD retrato (1080×1920)", width: 1080, height: 1920, group: "portrait" },
  { id: "p-4k", label: "4K retrato (2160×3840)", width: 2160, height: 3840, group: "portrait" },
];

export function PreviewDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: PreviewTemplate;
}) {
  const elementsQ = useQuery({
    queryKey: ["studio_preview_elements", template.id, open],
    enabled: open,
    queryFn: async (): Promise<TemplateElement[]> => {
      const { data, error } = await supabase
        .from("template_elements")
        .select(
          "id, template_id, element_type, x, y, width, height, rotation, z_index, opacity, locked, visible, content",
        )
        .eq("template_id", template.id)
        .order("z_index");
      if (error) throw error;
      return (data ?? []) as TemplateElement[];
    },
  });

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!open) return;
    const update = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  // Resolução alvo simulada. "match" = a mesma proporção do canvas do template.
  const [targetId, setTargetId] = useState<string>("match");

  const target = useMemo(() => {
    if (targetId === "match") {
      return {
        id: "match",
        label: "Igual ao template",
        width: template.canvas_width,
        height: template.canvas_height,
      };
    }
    const preset = RES_PRESETS.find((p) => p.id === targetId);
    return preset ?? {
      id: "match",
      label: "Igual ao template",
      width: template.canvas_width,
      height: template.canvas_height,
    };
  }, [targetId, template.canvas_width, template.canvas_height]);

  const scaling = (template.scaling_mode ?? "letterbox").toLowerCase();
  const bgColor = template.background_color ?? "#000000";

  // "Tela" simulada: área com a proporção do target, ajustada ao viewport.
  // Deixa margem para o header (72px) e footer badge (48px).
  const screenStyle = useMemo<React.CSSProperties>(() => {
    const availW = Math.max(0, viewport.w - 32);
    const availH = Math.max(0, viewport.h - 120);
    if (!availW || !availH || !target.width || !target.height)
      return { width: 0, height: 0 };
    const scale = Math.min(availW / target.width, availH / target.height);
    return {
      width: `${target.width * scale}px`,
      height: `${target.height * scale}px`,
    };
  }, [viewport, target]);

  // Canvas dentro da tela: em stretch preenche 100%; em letterbox mantém a
  // proporção do template dentro da tela (barras onde sobrar).
  const stageStyle = useMemo<React.CSSProperties>(() => {
    if (scaling === "stretch") {
      return { width: "100%", height: "100%" };
    }
    return {
      width: "100%",
      height: "100%",
      aspectRatio: `${template.canvas_width} / ${template.canvas_height}`,
      maxWidth: "100%",
      maxHeight: "100%",
    };
  }, [scaling, template.canvas_width, template.canvas_height]);

  const els = elementsQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!fixed !inset-0 !left-0 !top-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 !p-0 !bg-black !h-screen !w-screen data-[state=open]:!animate-none data-[state=closed]:!animate-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className="relative h-full w-full bg-neutral-950"
        >
          {/* Top control bar */}
          <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-white backdrop-blur">
                <Monitor className="h-4 w-4" />
                <span className="text-xs font-medium">Simular resolução</span>
              </div>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="h-9 min-w-[220px] rounded-xl border-white/10 bg-white/10 text-xs text-white backdrop-blur hover:bg-white/15">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="match">
                    Igual ao template ({template.canvas_width}×
                    {template.canvas_height})
                  </SelectItem>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Paisagem
                    </SelectLabel>
                    {RES_PRESETS.filter((p) => p.group === "landscape").map(
                      (p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Retrato
                    </SelectLabel>
                    {RES_PRESETS.filter((p) => p.group === "portrait").map(
                      (p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Outras
                    </SelectLabel>
                    {RES_PRESETS.filter((p) => p.group === "other").map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl bg-white/10 text-white backdrop-blur hover:bg-white/20"
              onClick={() => onOpenChange(false)}
            >
              <X className="mr-1.5 h-4 w-4" />
              Fechar (Esc)
            </Button>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            {/* Screen frame — proporção do alvo simulado */}
            <div
              className="relative flex items-center justify-center overflow-hidden shadow-2xl ring-1 ring-white/10"
              style={{ ...screenStyle, backgroundColor: bgColor }}
            >
              {/* Stage — canvas dentro da tela, respeitando scaling_mode */}
              <div className="relative overflow-hidden" style={stageStyle}>
                <TemplateBackground
                  color={bgColor}
                  mediaId={template.background_media_id ?? null}
                />
                {els
                  .filter((e) => e.visible ?? true)
                  .map((el) => (
                    <div
                      key={el.id}
                      style={{
                        position: "absolute",
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: `${el.width}%`,
                        height: `${el.height}%`,
                        transform: `rotate(${el.rotation ?? 0}deg)`,
                        transformOrigin: "center center",
                        opacity: el.opacity ?? 1,
                      }}
                    >
                      <ElementBody el={el} />
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider text-white/80 backdrop-blur">
            {scaling === "stretch" ? "Stretch" : "Letterbox"} · Template{" "}
            {template.canvas_width}×{template.canvas_height} · Tela{" "}
            {target.width}×{target.height}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}