import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileVideo,
  Folder,
  FolderPlus,
  FolderTree,
  MoreVertical,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const FOLDER_NAME_MAX = 60;
const DRAG_MIME = "application/x-bv-media-id";

function normalizeFolderName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, FOLDER_NAME_MAX);
}

/** Pastas vazias ainda sem arquivos (ficam neste dispositivo até receberem o 1º arquivo). */
function useLocalFolders(orgId: string | null) {
  const key = orgId ? `bv:media-folders:${orgId}` : null;
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setList(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
    } catch {
      setList([]);
    }
  }, [key]);
  const save = (next: string[]) => {
    setList(next);
    if (key) window.localStorage.setItem(key, JSON.stringify(next));
  };
  return { list, save };
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
  const invalidate = () => qc.invalidateQueries({ queryKey: ["media_files", orgId] });

  const filesQ = useQuery({
    queryKey: ["media_files", orgId],
    enabled: !!orgId,
    queryFn: () => fetchMediaFiles(orgId!),
  });

  const files = useMemo(() => filesQ.data ?? [], [filesQ.data]);
  const localFolders = useLocalFolders(orgId);
  const [folderDialog, setFolderDialog] = useState<
    { mode: "create" } | { mode: "rename"; name: string } | null
  >(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    files.forEach((f) => {
      const name = (f.folder ?? "").trim();
      if (name) map.set(name, (map.get(name) ?? 0) + 1);
    });
    return map;
  }, [files]);

  const folders = useMemo(() => {
    const set = new Set<string>(folderCounts.keys());
    localFolders.list.forEach((f) => set.add(f));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [folderCounts, localFolders.list]);

  const noFolderCount = files.length - Array.from(folderCounts.values()).reduce((a, b) => a + b, 0);
  const activeFolder = folderFilter !== "all" && folderFilter !== "__none__" ? folderFilter : "";

  const renameFolder = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      if ((folderCounts.get(from) ?? 0) > 0) {
        const { error } = await supabase
          .from("media_files")
          .update({ folder: to })
          .eq("organization_id", orgId!)
          .eq("folder", from);
        if (error) throw error;
      }
    },
    onSuccess: (_d, { from, to }) => {
      localFolders.save(
        Array.from(new Set(localFolders.list.map((f) => (f === from ? to : f)))),
      );
      if (folderFilter === from) setFolderFilter(to);
      toast.success("Pasta renomeada.");
      setFolderDialog(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao renomear a pasta."),
  });

  const deleteFolder = useMutation({
    mutationFn: async (name: string) => {
      if ((folderCounts.get(name) ?? 0) > 0) {
        const { error } = await supabase
          .from("media_files")
          .update({ folder: null })
          .eq("organization_id", orgId!)
          .eq("folder", name);
        if (error) throw error;
      }
    },
    onSuccess: (_d, name) => {
      localFolders.save(localFolders.list.filter((f) => f !== name));
      if (folderFilter === name) setFolderFilter("all");
      toast.success("Pasta excluída. Os arquivos foram mantidos em \"Sem pasta\".");
      setFolderToDelete(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao excluir a pasta."),
  });

  const moveFile = useMutation({
    mutationFn: async ({ id, folder }: { id: string; folder: string | null }) => {
      const { data, error } = await supabase
        .from("media_files")
        .update({ folder })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Você não tem permissão para mover este arquivo.");
      }
    },
    onSuccess: (_d, { folder }) => {
      toast.success(folder ? `Arquivo movido para "${folder}".` : "Arquivo movido para \"Sem pasta\".");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao mover o arquivo."),
  });

  const dropOn = (folder: string | null) =>
    canManage
      ? (id: string) => {
          const file = files.find((f) => f.id === id);
          if (!file || (file.folder ?? null) === folder) return;
          moveFile.mutate({ id, folder });
        }
      : undefined;

  const submitFolderName = (raw: string) => {
    const name = normalizeFolderName(raw);
    if (!name) {
      toast.error("Digite um nome para a pasta.");
      return;
    }
    if (folderDialog?.mode === "rename") {
      if (name === folderDialog.name) return setFolderDialog(null);
      if (folders.includes(name)) return toast.error("Já existe uma pasta com esse nome.");
      renameFolder.mutate({ from: folderDialog.name, to: name });
      return;
    }
    if (folders.includes(name)) return toast.error("Já existe uma pasta com esse nome.");
    localFolders.save([...localFolders.list, name]);
    setFolderFilter(name);
    setFolderDialog(null);
    toast.success(`Pasta "${name}" criada. Envie arquivos para ela.`);
  };

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

      {canManage && orgId && (
        <Uploader orgId={orgId} folder={activeFolder} onUploaded={invalidate} />
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Pastas</h2>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setFolderDialog({ mode: "create" })}
            >
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Nova pasta
            </Button>
          )}
        </div>
        {canManage && files.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Dica: arraste um arquivo até uma pasta para movê-lo.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <FolderTile
            label="Todos os arquivos"
            count={files.length}
            active={folderFilter === "all"}
            onClick={() => setFolderFilter("all")}
          />
          <FolderTile
            label="Sem pasta"
            count={noFolderCount}
            active={folderFilter === "__none__"}
            onClick={() => setFolderFilter("__none__")}
            onDropFile={dropOn(null)}
          />
          {folders.map((name) => (
            <FolderTile
              key={name}
              label={name}
              count={folderCounts.get(name) ?? 0}
              active={folderFilter === name}
              onClick={() => setFolderFilter(name)}
              onDropFile={dropOn(name)}
              onRename={canManage ? () => setFolderDialog({ mode: "rename", name }) : undefined}
              onDelete={canManage ? () => setFolderToDelete(name) : undefined}
            />
          ))}
        </div>
      </section>

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
              folders={folders}
              onPreview={() => setPreview(f)}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}

      <PreviewDialog file={preview} onOpenChange={(o) => !o && setPreview(null)} />

      <FolderNameDialog
        state={folderDialog}
        pending={renameFolder.isPending}
        onOpenChange={(o) => !o && setFolderDialog(null)}
        onSubmit={submitFolderName}
      />

      <AlertDialog open={!!folderToDelete} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              A pasta &ldquo;{folderToDelete}&rdquo; será removida. Os arquivos dentro dela não
              serão apagados — eles irão para &ldquo;Sem pasta&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => folderToDelete && deleteFolder.mutate(folderToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir pasta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FolderTile({
  label,
  count,
  active,
  onClick,
  onRename,
  onDelete,
  onDropFile,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onDropFile?: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!onDropFile || !e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragEnter={(e) => {
        if (onDropFile && e.dataTransfer.types.includes(DRAG_MIME)) setOver(true);
      }}
      onDragLeave={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_MIME);
        if (!onDropFile || !id) return;
        e.preventDefault();
        e.stopPropagation();
        onDropFile(id);
      }}
      className={`group relative flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
        over
          ? "border-primary bg-primary/20 ring-2 ring-primary/40"
          : active
          ? "border-primary/60 bg-primary/10"
          : "border-border/60 bg-card/50 hover:border-border hover:bg-card/80"
      }`}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            active ? "bg-primary/20 text-primary" : "bg-muted/60 text-muted-foreground"
          }`}
        >
          <Folder className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium" title={label}>
            {label}
          </span>
          <span className="block text-xs text-muted-foreground">
            {count} {count === 1 ? "arquivo" : "arquivos"}
          </span>
        </span>
      </button>
      {(onRename || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Opções da pasta ${label}`}
              className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRename && (
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 h-4 w-4" /> Renomear
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir pasta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function FolderNameDialog({
  state,
  pending,
  onOpenChange,
  onSubmit,
}: {
  state: { mode: "create" } | { mode: "rename"; name: string } | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (state) setValue(state.mode === "rename" ? state.name : "");
  }, [state]);
  const isRename = state?.mode === "rename";
  return (
    <Dialog open={!!state} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{isRename ? "Renomear pasta" : "Nova pasta"}</DialogTitle>
            <DialogDescription>
              {isRename
                ? "Todos os arquivos desta pasta passarão a usar o novo nome."
                : "Dê um nome para organizar seus arquivos."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Nome da pasta</Label>
            <Input
              id="folder-name"
              autoFocus
              maxLength={FOLDER_NAME_MAX}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ex.: Campanha de Verão"
              className="h-10 rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-xl">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isRename ? "Salvar" : "Criar pasta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MediaCard({
  file,
  canManage,
  folders,
  onPreview,
  onChanged,
}: {
  file: MediaFile;
  canManage: boolean;
  folders: string[];
  onPreview: () => void;
  onChanged: () => void;
}) {
  const thumbUrl = useSignedUrl(file.thumbnail_path ?? file.storage_path);
  const isVideo = (file.type ?? "").toString().toLowerCase() === "video";
  const [folderOpen, setFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

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
    <Card
      draggable={canManage}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, file.id);
        e.dataTransfer.setData("text/plain", file.name);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={`group overflow-hidden rounded-2xl transition-opacity ${dragging ? "opacity-40" : ""} ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}
      data-x="group overflow-hidden rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <button
        type="button"
        onClick={onPreview}
        className="relative block aspect-video w-full overflow-hidden bg-muted/40"
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={file.name}
            draggable={false}
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
            <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Renomear arquivo"
              title="Renomear"
              onClick={() => setRenameOpen(true)}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
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
            </div>
          )}
        </div>
      </CardContent>

      <RenameFileDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        file={file}
        onSaved={onChanged}
      />

      <FolderDialog
        open={folderOpen}
        onOpenChange={setFolderOpen}
        file={file}
        folders={folders}
        onSaved={onChanged}
      />
    </Card>
  );
}

function RenameFileDialog({
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
  const [value, setValue] = useState(file.name);
  useEffect(() => {
    if (open) setValue(file.name);
  }, [open, file.name]);

  const save = useMutation({
    mutationFn: async () => {
      const name = value.replace(/\s+/g, " ").trim().slice(0, 120);
      if (!name) throw new Error("Digite um nome para o arquivo.");
      const { error } = await supabase.from("media_files").update({ name }).eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Arquivo renomeado.");
      onOpenChange(false);
      onSaved();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao renomear."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Renomear arquivo</DialogTitle>
            <DialogDescription>O nome é usado apenas para organização no painel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`rename-${file.id}`}>Nome</Label>
            <Input
              id={`rename-${file.id}`}
              autoFocus
              maxLength={120}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending} className="rounded-xl">
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FolderDialog({
  open,
  onOpenChange,
  file,
  folders,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  file: MediaFile;
  folders: string[];
  onSaved: () => void;
}) {
  const [value, setValue] = useState(file.folder ?? "");
  useEffect(() => {
    if (open) setValue(file.folder ?? "");
  }, [open, file.folder]);

  const save = useMutation({
    mutationFn: async () => {
      const folder = normalizeFolderName(value) || null;
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
            Escolha uma pasta ou digite um nome novo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            <Button
              type="button"
              size="sm"
              variant={value.trim() === "" ? "default" : "outline"}
              className="h-8 rounded-full"
              onClick={() => setValue("")}
            >
              Sem pasta
            </Button>
            {folders.map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={value.trim() === f ? "default" : "outline"}
                className="h-8 max-w-full rounded-full"
                onClick={() => setValue(f)}
              >
                <Folder className="mr-1 h-3.5 w-3.5" />
                <span className="truncate">{f}</span>
              </Button>
            ))}
          </div>
          <Label htmlFor="folder-input">Pasta</Label>
          <Input
            id="folder-input"
            maxLength={FOLDER_NAME_MAX}
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

function Uploader({
  orgId,
  folder,
  onUploaded,
}: {
  orgId: string;
  folder: string;
  onUploaded: () => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [currentName, setCurrentName] = useState<string | null>(null);

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
      await uploadToStorage(BUCKET, storagePath, file, {
        contentType: file.type,
        onProgress: (pct) => setProgress(15 + Math.round(pct * 0.7)),
      });
      setProgress(85);

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
      setProgress(92);

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
          <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Folder className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{folder ? `Enviar para: ${folder}` : "Enviar sem pasta"}</span>
          </span>
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