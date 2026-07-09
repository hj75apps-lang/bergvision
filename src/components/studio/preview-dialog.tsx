import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ElementBody, TemplateBackground } from "./element-body";
import type { CanvasTemplate, TemplateElement } from "@/lib/studio/types";

export type PreviewTemplate = CanvasTemplate & {
  scaling_mode?: string | null;
  background_media_id?: string | null;
};

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

  const scaling = (template.scaling_mode ?? "letterbox").toLowerCase();
  const bgColor = template.background_color ?? "#000000";

  const stageStyle = useMemo<React.CSSProperties>(() => {
    if (scaling === "stretch") {
      return { width: "100%", height: "100%" };
    }
    // letterbox: fit inside viewport preserving canvas aspect ratio
    const tw = template.canvas_width;
    const th = template.canvas_height;
    if (!viewport.w || !viewport.h || !tw || !th)
      return { width: "100%", height: "100%" };
    const scale = Math.min(viewport.w / tw, viewport.h / th);
    return {
      width: `${tw * scale}px`,
      height: `${th * scale}px`,
    };
  }, [scaling, viewport, template]);

  const els = elementsQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!fixed !inset-0 !left-0 !top-0 !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 !p-0 !bg-black !h-screen !w-screen data-[state=open]:!animate-none data-[state=closed]:!animate-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className="relative h-full w-full"
          style={{ backgroundColor: bgColor }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative overflow-hidden" style={stageStyle}>
              <TemplateBackground
                color={bgColor}
                mediaId={template.background_media_id ?? null}
              />
              {els
                .filter((e) => (e.visible ?? true))
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

          <Button
            variant="secondary"
            size="sm"
            className="absolute right-4 top-4 rounded-xl bg-white/10 text-white backdrop-blur hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1.5 h-4 w-4" />
            Fechar (Esc)
          </Button>

          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider text-white/80 backdrop-blur">
            Modo Preview · {scaling === "stretch" ? "Stretch" : "Letterbox"} ·{" "}
            {template.canvas_width}×{template.canvas_height}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}