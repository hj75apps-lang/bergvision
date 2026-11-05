import { useRef, useState } from "react";
import { AudioLines, FileQuestion, Film, Folder, FolderPlus, Image as ImageIcon, Loader2, MoreVertical, Pencil, Search, Shapes, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSignedUrl } from "@/lib/studio/use-signed-url";
import { ACCEPT, ASSET_DRAG_MIME, aspectLabel, filterAssets, formatBytes, formatDuration, KIND_LABEL, type AssetKind, type EditorAsset } from "@/lib/video-editor/media";
import { isMissingTable, useEditorAssets, useEditorFolders, useEditorMediaMutations } from "@/lib/video-editor/use-editor-media";

const KIND_ICON: Record<AssetKind, typeof Film> = { video: Film, audio: AudioLines, image: ImageIcon, graphic: Shapes, text: Type, other: FileQuestion };

type NameDialog = { mode: "folder-new" } | { mode: "folder-rename"; id: string } | { mode: "asset"; id: string };

export function MediaLibrary({ orgId, canEdit, onPreview }: { orgId: string | undefined; canEdit: boolean; onPreview: (a: EditorAsset) => void }) {
  const assets = useEditorAssets();
  const folders = useEditorFolders();
  const m = useEditorMediaMutations(orgId);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [folder, setFolder] = useState<string>("all");
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [toDelete, setToDelete] = useState<EditorAsset | null>(null);

  const missing = isMissingTable(assets.error) || isMissingTable(folders.error);
  const list = filterAssets(assets.data ?? [], { query, kind, folder: folder as "all" });
  const folderList = folders.data ?? [];

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const targetFolder = folder === "all" || folder === "none" ? null : folder;
    await Promise.all(Array.from(files).map(async (file) => {
      const key = `${file.name}-${crypto.randomUUID()}`;
      setUploads((u) => ({ ...u, [key]: 0 }));
      try {
        await m.upload.mutateAsync({ file, folderId: targetFolder, onProgress: (p) => setUploads((u) => ({ ...u, [key]: p })) });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Falha ao enviar ${file.name}`);
      } finally {
        setUploads((u) => { const n = { ...u }; delete n[key]; return n; });
      }
    }));
    if (input.current) input.current.value = "";
  };

  const saveName = async () => {
    const v = nameValue.replace(/\s+/g, " ").trim();
    if (!v || !nameDialog) return;
    try {
      if (nameDialog.mode === "folder-new") await m.createFolder.mutateAsync(v);
      else if (nameDialog.mode === "folder-rename") await m.renameFolder.mutateAsync({ id: nameDialog.id, name: v });
      else await m.rename.mutateAsync({ id: nameDialog.id, name: v });
      setNameDialog(null);
    } catch (e) {
      const msg = (e as { code?: string }).code === "23505" ? "Já existe uma pasta com esse nome." : "Não foi possível salvar.";
      toast.error(msg);
    }
  };

  if (missing) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
        A biblioteca do editor ainda não foi ativada. Rode o SQL <code>20261105_video_editor_assets.sql</code> no Supabase.
      </div>
    );
  }

  const pending = Object.values(uploads);
  const currentFolder = folderList.find((f) => f.id === folder);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome" className="rounded-xl pl-8" />
        </div>
        {canEdit && (
          <Button size="icon" className="rounded-xl" onClick={() => input.current?.click()} aria-label="Importar arquivos">
            <Upload className="h-4 w-4" />
          </Button>
        )}
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => onFiles(e.target.files)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as AssetKind | "all")}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as pastas</SelectItem>
            <SelectItem value="none">Sem pasta</SelectItem>
            {folderList.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setNameValue(""); setNameDialog({ mode: "folder-new" }); }}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />Nova pasta
          </Button>
          {currentFolder && (
            <>
              <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setNameValue(currentFolder.name); setNameDialog({ mode: "folder-rename", id: currentFolder.id }); }}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />Renomear pasta
              </Button>
              <Button variant="ghost" size="sm" className="rounded-xl text-destructive" onClick={async () => { await m.removeFolder.mutateAsync(currentFolder.id); setFolder("all"); toast.success("Pasta excluída; arquivos ficaram sem pasta."); }}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />Excluir pasta
              </Button>
            </>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Enviando {pending.length} arquivo(s) · {Math.round(pending.reduce((a, b) => a + b, 0) / pending.length)}%
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
        onDrop={(e) => { if (canEdit && e.dataTransfer.files.length) { e.preventDefault(); onFiles(e.dataTransfer.files); } }}
      >
        {assets.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {canEdit ? "Nenhum arquivo. Clique em importar ou solte arquivos aqui." : "Nenhum arquivo."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {list.map((a) => (
              <AssetCard key={a.id} asset={a} canEdit={canEdit} folders={folderList} onPreview={() => onPreview(a)}
                onRename={() => { setNameValue(a.name); setNameDialog({ mode: "asset", id: a.id }); }}
                onMove={(fid) => m.move.mutate({ id: a.id, folderId: fid })}
                onDelete={() => setToDelete(a)} />
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!nameDialog} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{nameDialog?.mode === "folder-new" ? "Nova pasta" : nameDialog?.mode === "folder-rename" ? "Renomear pasta" : "Renomear arquivo"}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={nameValue} maxLength={nameDialog?.mode === "asset" ? 200 : 80} onChange={(e) => setNameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNameDialog(null)}>Cancelar</Button>
            <Button onClick={saveName}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo?</AlertDialogTitle>
            <AlertDialogDescription>“{toDelete?.name}” será removido do editor de vídeo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (toDelete) m.remove.mutate(toDelete, { onError: () => toast.error("Não foi possível excluir.") }); setToDelete(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AssetCard({ asset: a, canEdit, folders, onPreview, onRename, onMove, onDelete }: {
  asset: EditorAsset; canEdit: boolean; folders: { id: string; name: string }[];
  onPreview: () => void; onRename: () => void; onMove: (id: string | null) => void; onDelete: () => void;
}) {
  const thumb = useSignedUrl(a.thumbnail_path);
  const Icon = KIND_ICON[a.kind];
  const info = [formatDuration(a.duration_ms), a.width && a.height ? `${a.width}×${a.height} · ${aspectLabel(a.width, a.height)}` : "", formatBytes(a.size_bytes)].filter(Boolean).join(" · ");
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(ASSET_DRAG_MIME, a.id); e.dataTransfer.effectAllowed = "copy"; }}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 transition hover:border-primary/40"
    >
      <button type="button" onClick={onPreview} className="block w-full text-left">
        <div className="flex aspect-video items-center justify-center bg-muted/40">
          {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="p-2">
          <p className="truncate text-xs font-medium">{a.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{info}</p>
        </div>
      </button>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="secondary" className="absolute right-1 top-1 h-7 w-7 rounded-lg opacity-80" aria-label="Ações">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}><Pencil className="mr-2 h-4 w-4" />Renomear</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Folder className="mr-2 h-4 w-4" />Mover para</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => onMove(null)}>Sem pasta</DropdownMenuItem>
                {folders.map((f) => <DropdownMenuItem key={f.id} onClick={() => onMove(f.id)}>{f.name}</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
