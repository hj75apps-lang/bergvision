import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Image as ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaPickerDialog, isLowRes } from "./media-picker-dialog";

export type TemplateSettings = {
  id: string;
  scaling_mode: string | null;
  background_color: string | null;
  background_media_id: string | null;
  canvas_width: number;
  canvas_height: number;
};

export function TemplateSettingsDialog({
  open,
  onOpenChange,
  template,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: TemplateSettings;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [scaling, setScaling] = useState<string>(
    template.scaling_mode ?? "letterbox",
  );
  const [color, setColor] = useState<string>(
    template.background_color ?? "#0F172A",
  );
  const [mediaId, setMediaId] = useState<string | null>(
    template.background_media_id ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState<false | "image" | "video">(
    false,
  );

  useEffect(() => {
    if (open) {
      setScaling(template.scaling_mode ?? "letterbox");
      setColor(template.background_color ?? "#0F172A");
      setMediaId(template.background_media_id ?? null);
    }
  }, [open, template]);

  const mediaInfoQ = useQuery({
    queryKey: ["studio_bg_media_info", mediaId],
    enabled: !!mediaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, name, type, width, height")
        .eq("id", mediaId!)
        .single();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        type: string;
        width: number | null;
        height: number | null;
      };
    },
  });

  const bgLowRes = useMemo(() => {
    if (!mediaInfoQ.data) return false;
    return isLowRes(
      mediaInfoQ.data,
      template.canvas_width,
      template.canvas_height,
    );
  }, [mediaInfoQ.data, template.canvas_width, template.canvas_height]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("templates")
        .update({
          scaling_mode: scaling,
          background_color: color,
          background_media_id: mediaId,
        })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["studio_template", template.id] });
      await qc.invalidateQueries({ queryKey: ["studio_templates"] });
      toast.success("Configurações salvas.");
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurações do template</DialogTitle>
            <DialogDescription>
              Ajuste como o conteúdo é exibido em diferentes telas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Modo de escala</Label>
              <Select
                value={scaling}
                onValueChange={setScaling}
                disabled={disabled}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="letterbox">
                    Letterbox — mantém proporção (com barras)
                  </SelectItem>
                  <SelectItem value="stretch">
                    Stretch — preenche toda a tela
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Letterbox preserva o layout em qualquer proporção. Stretch estica
                para preencher tudo.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Cor de fundo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  disabled={disabled}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-border/60 bg-transparent"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 rounded-xl"
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Mídia de fundo (opcional)</Label>
              {mediaId ? (
                <>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-xs">
                      <div className="truncate font-medium">
                        {mediaInfoQ.data?.name ?? "Mídia selecionada"}
                      </div>
                      <div className="text-muted-foreground">
                        {mediaInfoQ.data?.type === "video" ? "Vídeo" : "Imagem"}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setMediaId(null)}
                    disabled={disabled}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {bgLowRes && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>
                      Esta mídia pode ficar borrada nesta área — resolução
                      recomendada:{" "}
                      <strong>
                        {template.canvas_width}×{template.canvas_height}
                      </strong>{" "}
                      ou maior.
                      {mediaInfoQ.data?.width && mediaInfoQ.data?.height && (
                        <>
                          {" "}
                          Atual: {mediaInfoQ.data.width}×{mediaInfoQ.data.height}.
                        </>
                      )}
                    </span>
                  </div>
                )}
                </>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => setPickerOpen("image")}
                    disabled={disabled}
                  >
                    Escolher imagem
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => setPickerOpen("video")}
                    disabled={disabled}
                  >
                    Escolher vídeo
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Vídeos em loop reproduzem atrás de todos os elementos.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saveMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={disabled || saveMut.isPending}
            >
              {saveMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pickerOpen && (
        <MediaPickerDialog
          open={!!pickerOpen}
          onOpenChange={(v) => !v && setPickerOpen(false)}
          filter={pickerOpen}
          onPick={(file) => {
            setMediaId(file.id);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}