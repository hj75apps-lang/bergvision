import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileVideo,
  FolderTree,
  ImageIcon,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { uploadToStorage } from "@/lib/storage-upload";
import {
  extractImageMeta,
  extractVideoMeta,
  formatBytes,
  formatDuration,
  slugifyFilename,
  validateFile,
  ACCEPT_ATTR,
  type MediaKind,
} from "@/lib/media-utils";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca · Berg Vision" },
      {
        name: "description",
        content:
          "Sua biblioteca de mídias — imagens, vídeos e assets prontos para publicação.",
      },
    ],
  }),
  component: BibliotecaPage,
});

const BUCKET = "media";

type MediaFile = {
  id: string;
  organization_id: string;
  name: string;
  folder: string | null;
  type: MediaKind | string;
  mime_type: string | null;
  size: number | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  storage_path: string;
  thumbnail_path: string | null;
  created_at?: string | null;
};

const MEDIA_FILE_COLUMNS = [
  "id",
  "organization_id",
  "name",
  "folder",
  "type",
  "mime_type",
  "size",
  "file_size",
  "width",
  "height",
  "duration",
  "storage_path",
  "thumbnail_path",
  "created_at",
];

function getMissingSchemaColumn(error: unknown): string | null {
  const text = [
    (error as any)?.message,
    (error as any)?.details,
    (error as any)?.hint,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    text.match(/Could not find the '([^']+)' column/)?.[1] ??
    text.match(/column\s+(?:\w+\.)?"?([a-zA-Z_][\w]*)"?\s+does not exist/)?.[1] ??
    null
  );
}

function normalizeMediaFile(row: Partial<MediaFile>): MediaFile {
  return {
    id: row.id ?? "",
    organization_id: row.organization_id ?? "",
    name: row.name ?? "Sem nome",
    folder: row.folder ?? null,
    type: row.type ?? "image",
    mime_type: row.mime_type ?? null,
    size: row.size ?? row.file_size ?? null,
    file_size: row.file_size ?? row.size ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    duration: row.duration ?? null,
    storage_path: row.storage_path ?? "",
    thumbnail_path: row.thumbnail_path ?? null,
    created_at: row.created_at ?? null,
  };
}

async function fetchMediaFiles(orgId: string): Promise<MediaFile[]> {
  let columns = [...MEDIA_FILE_COLUMNS];

  for (let attempt = 0; attempt < MEDIA_FILE_COLUMNS.length; attempt += 1) {
    let query = supabase
      .from("media_files")
      .select(columns.join(", "))
      .eq("organization_id", orgId);

    if (columns.includes("created_at")) {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (!error) {
      return (data ?? []).map((row) => normalizeMediaFile(row as Partial<MediaFile>));
    }

    const missing = getMissingSchemaColumn(error);
    if (missing && columns.includes(missing)) {
      columns = columns.filter((column) => column !== missing);
      continue;
    }

    throw error;
  }

  return [];
}

async function insertMediaFileWithSchemaFallback(payload: Record<string, unknown>) {
  const optionalColumns = new Set([
    "mime_type",
    "size",
    "width",
    "height",
    "duration",
    "thumbnail_path",
    "uploaded_by",
  ]);
  const body = { ...payload };

  for (let attempt = 0; attempt < optionalColumns.size + 1; attempt += 1) {
    const { error } = await supabase.from("media_files").insert(body);
    if (!error) return;

    const missing = getMissingSchemaColumn(error);
    if (missing === "file_size") {
      throw new Error(
        "O Supabase ainda não reconheceu a coluna obrigatória file_size no cache do schema. Rode notify pgrst, 'reload schema'; no SQL Editor e tente novamente.",
      );
    }
    if (missing && optionalColumns.has(missing) && missing in body) {
      delete body[missing];
      continue;
    }

    throw error;
  }
}

function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

function BibliotecaPage() {
  const { membership } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canManage = ["owner", "admin", "editor"].includes(role);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [preview, setPreview] = useState<MediaFile | null>(null);

  const filesQ = useQuery({
    queryKey: ["media_files", orgId],
    enabled: !!orgId,
    queryFn: () => fetchMediaFiles(orgId!),
  });

  const files = filesQ.data ?? [];

  const folders = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      if (f.folder && f.folder.trim()) set.add(f.folder.trim());
    });
    return Array.from(set).sort();
  }, [files]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (kindFilter !== "all" && (f.type ?? "").toString().toLowerCase() !== kindFilter)
        return false;
      if (folderFilter !== "all") {
        const folder = (f.folder || "").trim();
        if (folderFilter === "__none__" ? folder !== "" : folder !== folderFilter)
          return false;
      }
      if (q && !(f.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, search, kindFilter, folderFilter]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["media_files", orgId] });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted-foreground">
            {files.length} arquivo(s) na sua organização
          </p>
        </div>
      </header>

      {canManage && orgId && <Uploader orgId={orgId} onUploaded={invalidate} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
          <SelectTrigger className="h-10 w-[140px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="image">Imagens</SelectItem>
            <SelectItem value="video">Vídeos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={folderFilter} onValueChange={setFolderFilter}>
          <SelectTrigger className="h-10 w-[180px] rounded-xl">
            <FolderTree className="mr-1.5 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as pastas</SelectItem>
            <SelectItem value="__none__">Sem pasta</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filesQ.isLoading ? (
        <GridSkeleton count={8} heightClass="h-52" />
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border/60 bg-card/40">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nenhum arquivo encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((f) => (
            <MediaCard
              key={f.id}
              file={f}
              canManage={canManage}
              onPreview={() => setPreview(f)}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}

      <PreviewDialog file={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </div>
  );
}

function MediaCard({
  file,
  canManage,
  onPreview,
  onChanged,
}: {
  file: MediaFile;
  canManage: boolean;
  onPreview: () => void;
  onChanged: () => void;
}) {
  const thumbUrl = useSignedUrl(file.thumbnail_path ?? file.storage_path);
  const isVideo = (file.type ?? "").toString().toLowerCase() === "video";
  const [folderOpen, setFolderOpen] = useState(false);

  const remove = useMutation({
    mutationFn: async () => {
      const paths = [file.storage_path, file.thumbnail_path].filter(
        (p): p is string => !!p,
      );
      // 1) Remove o registro do banco (fonte da verdade + RLS decide permissão).
      const { error: dErr } = await supabase
        .from("media_files")
        .delete()
        .eq("id", file.id);
      if (dErr) throw new Error("Falha ao remover do banco: " + dErr.message);

      // 2) Sempre limpa os binários do Storage para não inflar o armazenamento.
      if (paths.length) {
        const { error: sErr } = await supabase.storage.from(BUCKET).remove(paths);
        if (sErr) {
          throw new Error(
            "Registro removido, mas o arquivo permaneceu no Storage: " +
              sErr.message,
          );
        }
      }
    },
    onSuccess: () => {
      toast.success("Arquivo removido.");
      onChanged();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover."),
  });

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <button
        type="button"
        onClick={onPreview}
        className="relative block aspect-video w-full overflow-hidden bg-muted/40"
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            {isVideo ? <FileVideo className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
          </div>
        )}
        <div className="absolute left-2 top-2">
          <Badge
            variant="secondary"
            className="rounded-full bg-black/60 text-[10px] text-white backdrop-blur"
          >
            {isVideo ? (
              <>
                <FileVideo className="mr-1 h-3 w-3" /> Vídeo
              </>
            ) : (
              <>
                <ImageIcon className="mr-1 h-3 w-3" /> Imagem
              </>
            )}
          </Badge>
        </div>
      </button>

      <CardContent className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {file.width && file.height ? `${file.width}×${file.height}` : "Dimensões indisponíveis"}
            {file.size ? ` · ${formatBytes(file.size)}` : ""}
            {isVideo && file.duration ? ` · ${formatDuration(file.duration)}` : ""}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => canManage && setFolderOpen(true)}
            disabled={!canManage}
            className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:cursor-not-allowed"
          >
            <FolderTree className="h-3 w-3 shrink-0" />
            <span className="truncate">{file.folder || "sem pasta"}</span>
            {canManage && <Pencil className="h-3 w-3 shrink-0 opacity-60" />}
          </button>
          {canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover arquivo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &ldquo;{file.name}&rdquo; será removido do Storage e da
                    biblioteca. Playlists que o referenciam podem quebrar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => remove.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>

      <FolderDialog
        open={folderOpen}
        onOpenChange={setFolderOpen}
        file={file}
        onSaved={onChanged}
      />
    </Card>
  );
}

function FolderDialog({
  open,
  onOpenChange,
  file,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  file: MediaFile;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(file.folder ?? "");
  useEffect(() => {
    if (open) setValue(file.folder ?? "");
  }, [open, file.folder]);

  const save = useMutation({
    mutationFn: async () => {
      const folder = value.trim() || null;
      const { error } = await supabase
        .from("media_files")
        .update({ folder })
        .eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pasta atualizada.");
      onOpenChange(false);
      onSaved();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Mover para pasta</DialogTitle>
          <DialogDescription>
            Digite o nome da pasta (deixe vazio para tirar da pasta).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="folder-input">Pasta</Label>
          <Input
            id="folder-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex.: Campanhas"
            className="h-10 rounded-xl"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-xl"
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  file,
  onOpenChange,
}: {
  file: MediaFile | null;
  onOpenChange: (open: boolean) => void;
}) {
  const url = useSignedUrl(file?.storage_path);
  const isVideo = (file?.type ?? "").toString().toLowerCase() === "video";

  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="truncate">{file?.name}</DialogTitle>
          <DialogDescription>
            {file
              ? `${file.width && file.height ? `${file.width}×${file.height}` : "Dimensões indisponíveis"}${
                  isVideo && file.duration ? ` · ${formatDuration(file.duration)}` : ""
                }`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid place-items-center bg-black/60 p-4 sm:p-6">
          {!url ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : isVideo ? (
            <video src={url} controls className="max-h-[70vh] w-full rounded-xl bg-black" />
          ) : (
            <img
              src={url}
              alt={file?.name}
              className="max-h-[70vh] w-auto rounded-xl object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Uploader({ orgId, onUploaded }: { orgId: string; onUploaded: () => void }) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [folder, setFolder] = useState("");

  const uploadFile = async (file: File) => {
    const v = validateFile(file);
    if ("error" in v) {
      toast.error(v.error);
      return;
    }
    const kind = v.kind;
    setCurrentName(file.name);
    setProgress(1);

    try {
      setProgress(5);
      let width: number | null = null;
      let height: number | null = null;
      let duration: number | null = null;
      let thumbBlob: Blob | null = null;
      if (kind === "image") {
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
        (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2);
      const safe = slugifyFilename(file.name);
      const storagePath = `${orgId}/${uid}-${safe}`;

      setProgress(15);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(70);

      let thumbnailPath: string | null = null;
      if (thumbBlob) {
        const tp = `${orgId}/${uid}-thumb.jpg`;
        const { error: tErr } = await supabase.storage
          .from(BUCKET)
          .upload(tp, thumbBlob, { contentType: "image/jpeg", upsert: false });
        if (!tErr) thumbnailPath = tp;
      }
      setProgress(85);

      try {
        await insertMediaFileWithSchemaFallback({
          organization_id: orgId,
          name: file.name,
          folder: folder.trim() || null,
          type: kind,
          mime_type: file.type,
          size: file.size,
          file_size: file.size,
          width,
          height,
          duration,
          storage_path: storagePath,
          thumbnail_path: thumbnailPath,
          uploaded_by: user?.id ?? null,
        });
      } catch (insErr) {
        await supabase.storage
          .from(BUCKET)
          .remove([storagePath, thumbnailPath].filter((p): p is string => !!p));
        throw insErr;
      }

      setProgress(100);
      toast.success(`${file.name} enviado.`);
      onUploaded();
    } catch (err: any) {
      toast.error(err?.message || `Falha ao enviar ${file.name}.`);
    } finally {
      setTimeout(() => {
        setProgress(null);
        setCurrentName(null);
      }, 400);
    }
  };

  const uploadMany = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(f);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) uploadMany(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-2xl border-2 border-dashed p-6 transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border/60 bg-card/40 hover:border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Arraste arquivos aqui</p>
            <p className="text-xs text-muted-foreground">
              Imagens até 20 MB · vídeos até 500 MB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Pasta (opcional)"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="h-10 w-40 rounded-xl"
          />
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-10 rounded-xl"
          >
            Selecionar arquivos
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadMany(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {progress !== null && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{currentName}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 rounded-full" />
        </div>
      )}
    </div>
  );
}