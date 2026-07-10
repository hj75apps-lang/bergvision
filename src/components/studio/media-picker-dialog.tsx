import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search, Upload } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { uploadToStorage } from "@/lib/storage-upload";
import {
  ACCEPT_ATTR,
  extractImageMeta,
  extractVideoMeta,
  slugifyFilename,
  validateFile,
} from "@/lib/media-utils";

const BUCKET = "media";

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
  const { membership, user } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canUpload = ["owner", "admin", "editor"].includes(role);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const qc = useQueryClient();

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

  const handleUpload = async (files: FileList | null) => {
    if (!files || !files.length || !orgId) return;
    const file = files[0];
    const v = validateFile(file);
    if ("error" in v) {
      toast.error(v.error);
      return;
    }
    if (v.kind !== filter) {
      toast.error(
        `Este slot aceita apenas ${filter === "image" ? "imagens" : "vídeos"}.`,
      );
      return;
    }
    setUploadName(file.name);
    setUploadProgress(5);
    try {
      let width: number | null = null;
      let height: number | null = null;
      let duration: number | null = null;
      let thumbBlob: Blob | null = null;
      if (v.kind === "image") {
        const meta = await extractImageMeta(file);
        width = meta.width;
        height = meta.height;
      } else {
        const meta = await extractVideoMeta(file);
        width = meta.width;
        height = meta.height;
        duration = meta.duration;
        thumbBlob = meta.thumbnail;
      }
      const uid =
        (crypto as { randomUUID?: () => string }).randomUUID?.() ??
        Math.random().toString(36).slice(2);
      const safe = slugifyFilename(file.name);
      const storagePath = `${orgId}/${uid}-${safe}`;
      setUploadProgress(20);
      await uploadToStorage(BUCKET, storagePath, file, {
        contentType: file.type,
        onProgress: (pct) => {
          // Reserva 20% para thumbnail + insert final
          setUploadProgress(20 + Math.round(pct * 0.65));
        },
      });
      setUploadProgress(85);
      let thumbnailPath: string | null = null;
      if (thumbBlob) {
        const tp = `${orgId}/${uid}-thumb.jpg`;
        try {
          await uploadToStorage(BUCKET, tp, thumbBlob, {
            contentType: "image/jpeg",
          });
          thumbnailPath = tp;
        } catch {
          thumbnailPath = null;
        }
      }
      setUploadProgress(92);
      const payload: Record<string, unknown> = {
        organization_id: orgId,
        name: file.name,
        type: v.kind,
        mime_type: file.type,
        size: file.size,
        file_size: file.size,
        width,
        height,
        duration,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        uploaded_by: user?.id ?? null,
      };
      const { data: inserted, error: insErr } = await supabase
        .from("media_files")
        .insert(payload)
        .select("id, name, type, storage_path, thumbnail_path, width, height")
        .single();
      if (insErr) {
        await supabase.storage
          .from(BUCKET)
          .remove([storagePath, thumbnailPath].filter((p): p is string => !!p));
        throw insErr;
      }
      setUploadProgress(100);
      toast.success(`${file.name} enviado.`);
      await qc.invalidateQueries({ queryKey: ["studio_media_picker"] });
      await qc.invalidateQueries({ queryKey: ["media_files"] });
      if (inserted) {
        onPick(inserted as PickerMediaFile);
        onOpenChange(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no upload.";
      toast.error(msg);
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
        setUploadName(null);
      }, 400);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Selecionar {filter === "image" ? "imagem" : "vídeo"}
          </DialogTitle>
          <DialogDescription>
            Escolha um arquivo da sua biblioteca ou envie um novo do seu computador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="pl-9"
            />
          </div>
          {canUpload && (
            <>
              <Button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploadProgress !== null}
                className="h-10 rounded-xl"
              >
                <Upload className="mr-2 h-4 w-4" />
                {filter === "image" ? "Enviar imagem" : "Enviar vídeo"}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept={filter === "image" ? "image/*" : "video/*"}
                className="hidden"
                onChange={(e) => {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>

        {uploadProgress !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{uploadName}</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2 rounded-full" />
          </div>
        )}

        <ScrollArea className="h-[420px] pr-2">
          {filesQ.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <p>Nenhum arquivo encontrado.</p>
              {canUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploadProgress !== null}
                  className="rounded-xl"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Enviar do computador
                </Button>
              )}
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