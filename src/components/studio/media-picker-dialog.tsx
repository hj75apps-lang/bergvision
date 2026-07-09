import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useSignedUrl } from "@/lib/studio/use-signed-url";

export type PickerMediaFile = {
  id: string;
  name: string;
  type: string;
  storage_path: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
};

export function MediaPickerDialog({
  open,
  onOpenChange,
  filter,
  onPick,
  requiredWidth,
  requiredHeight,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filter: "image" | "video";
  onPick: (file: PickerMediaFile) => void;
  /** Área de exibição em pixels do slot onde a mídia será renderizada.
   *  Se informado, arquivos com resolução nativa menor recebem aviso. */
  requiredWidth?: number;
  requiredHeight?: number;
}) {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const [search, setSearch] = useState("");

  const filesQ = useQuery({
    queryKey: ["studio_media_picker", orgId, filter],
    enabled: !!orgId && open,
    queryFn: async (): Promise<PickerMediaFile[]> => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, name, type, storage_path, thumbnail_path, width, height")
        .eq("organization_id", orgId!)
        .eq("type", filter)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PickerMediaFile[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filesQ.data ?? [];
    return (filesQ.data ?? []).filter((f) => f.name.toLowerCase().includes(q));
  }, [filesQ.data, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Selecionar {filter === "image" ? "imagem" : "vídeo"}
          </DialogTitle>
          <DialogDescription>
            Escolha um arquivo da sua biblioteca de mídia.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[420px] pr-2">
          {filesQ.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <p>Nenhum arquivo encontrado.</p>
              <Button variant="link" size="sm" asChild>
                <a href="/biblioteca" target="_blank" rel="noreferrer">
                  Fazer upload na Biblioteca
                </a>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((f) => (
                <PickerCard
                  key={f.id}
                  file={f}
                  requiredWidth={requiredWidth}
                  requiredHeight={requiredHeight}
                  onPick={() => {
                    if (
                      requiredWidth &&
                      requiredHeight &&
                      isLowRes(f, requiredWidth, requiredHeight)
                    ) {
                      toast.warning(
                        `Esta imagem pode ficar borrada nesta área — resolução recomendada: ${Math.round(
                          requiredWidth,
                        )}×${Math.round(requiredHeight)} ou maior.`,
                      );
                    }
                    onPick(f);
                    onOpenChange(false);
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function isLowRes(
  file: { width: number | null; height: number | null },
  requiredWidth: number,
  requiredHeight: number,
): boolean {
  if (!file.width || !file.height) return false;
  return file.width < requiredWidth || file.height < requiredHeight;
}

function PickerCard({
  file,
  onPick,
  requiredWidth,
  requiredHeight,
}: {
  file: PickerMediaFile;
  onPick: () => void;
  requiredWidth?: number;
  requiredHeight?: number;
}) {
  const url = useSignedUrl(file.thumbnail_path ?? file.storage_path);
  const lowRes =
    requiredWidth && requiredHeight
      ? isLowRes(file, requiredWidth, requiredHeight)
      : false;
  return (
    <button
      type="button"
      onClick={onPick}
      className="group overflow-hidden rounded-xl border border-border/60 bg-card transition hover:border-primary/60 hover:shadow"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {url ? (
          <img
            src={url}
            alt={file.name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {lowRes && (
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-semibold text-black shadow">
            <AlertTriangle className="h-3 w-3" />
            Baixa resolução
          </div>
        )}
      </div>
      <div className="p-2 text-left">
        <div className="truncate text-xs font-medium">{file.name}</div>
        {file.width && file.height && (
          <div className="text-[10px] text-muted-foreground">
            {file.width}×{file.height}
          </div>
        )}
      </div>
    </button>
  );
}