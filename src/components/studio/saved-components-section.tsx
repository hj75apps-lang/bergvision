import { useMemo, useState } from "react";
import { BookmarkPlus, Copy, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMPONENT_CATEGORIES, buildPartsFromElements, filterComponents, suggestCategory,
  type ComponentCategory, type SavedComponent, type SavedPart,
} from "@/lib/studio/component-library";
import { isMissingTable, useSavedComponentMutations, useSavedComponents } from "@/lib/studio/use-saved-components";
import type { TemplateElement } from "@/lib/studio/types";
import type { LibraryItem } from "./components-panel";

type Form = { id?: string; name: string; category: ComponentCategory; collection: string };

const catLabel = (v: string) => COMPONENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Erro desconhecido";

function partColor(p: SavedPart): string {
  const c = p.defaultContent;
  const v = (p.type === "text" ? c.color : c.fill) as string | undefined;
  if (typeof v === "string" && v !== "transparent") return v;
  return p.type === "image" || p.type === "logo" || p.type === "video" ? "#64748B" : "#94A3B8";
}

function Thumb({ parts }: { parts: SavedPart[] }) {
  return (
    <svg viewBox="0 0 100 56.25" className="h-full w-full rounded-md bg-muted/60" aria-hidden>
      {parts.map((p, i) => (
        <rect
          key={i}
          x={p.x} y={p.y * 0.5625} width={Math.max(p.width, 0.8)} height={Math.max(p.height * 0.5625, 0.8)}
          rx={p.type === "text" ? 0.4 : 1}
          fill={partColor(p)}
          fillOpacity={p.type === "text" ? 0.85 : (p.opacity ?? 1)}
          transform={p.rotation ? `rotate(${p.rotation} ${p.x + p.width / 2} ${(p.y + p.height / 2) * 0.5625})` : undefined}
        />
      ))}
    </svg>
  );
}

export function SavedComponentsSection({
  selectedElements,
  canEdit,
  onInsert,
  search,
}: {
  selectedElements: TemplateElement[];
  canEdit: boolean;
  onInsert: (item: LibraryItem) => void;
  search: string;
}) {
  const q = useSavedComponents();
  const m = useSavedComponentMutations();
  const [category, setCategory] = useState<ComponentCategory | "all">("all");
  const [collection, setCollection] = useState<string>("all");
  const [form, setForm] = useState<Form | null>(null);
  const [toDelete, setToDelete] = useState<SavedComponent | null>(null);

  const list = q.data ?? [];
  const collections = useMemo(
    () => Array.from(new Set(list.map((c) => c.collection).filter((c): c is string => !!c))).sort(),
    [list],
  );
  const shown = useMemo(() => filterComponents(list, search, category, collection), [list, search, category, collection]);
  const selParts = useMemo(() => buildPartsFromElements(selectedElements), [selectedElements]);

  const openSave = () => {
    if (selParts.length === 0) return toast.error("Selecione um ou mais elementos no canvas para salvar.");
    setForm({ name: "", category: suggestCategory(selParts), collection: "" });
  };

  const submit = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return toast.error("Dê um nome ao componente.");
    const payload = { name, category: form.category, collection: form.collection.trim() || null };
    try {
      if (form.id) await m.update.mutateAsync({ id: form.id, ...payload });
      else await m.create.mutateAsync({ ...payload, parts: selParts });
      toast.success(form.id ? "Componente atualizado" : "Componente salvo na biblioteca");
      setForm(null);
    } catch (e) {
      toast.error(`Não foi possível salvar: ${errMsg(e)}`);
    }
  };

  const insert = (c: SavedComponent) =>
    onInsert({ type: c.parts[0]?.type ?? "shape", label: c.name, icon: BookmarkPlus, defaultContent: {}, defaultSize: { width: 0, height: 0 }, parts: c.parts });

  const replaceWithSelection = async (c: SavedComponent) => {
    if (selParts.length === 0) return toast.error("Selecione os elementos que vão substituir este componente.");
    try {
      await m.update.mutateAsync({ id: c.id, parts: selParts });
      toast.success(`"${c.name}" atualizado com a seleção`);
    } catch (e) { toast.error(`Não foi possível atualizar: ${errMsg(e)}`); }
  };

  const missing = q.isError && isMissingTable(q.error);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">Meus componentes</span>
        <span className="text-[10px] text-muted-foreground">{list.length}</span>
      </div>

      <Button size="sm" variant="secondary" className="mb-2 h-8 w-full gap-1.5 text-xs" disabled={!canEdit || missing} onClick={openSave}>
        <BookmarkPlus className="h-3.5 w-3.5" />
        {selParts.length > 0 ? `Salvar seleção (${selParts.length})` : "Salvar seleção"}
      </Button>

      {list.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <Select value={category} onValueChange={(v) => setCategory(v as ComponentCategory | "all")}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {COMPONENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas coleções</SelectItem>
              {collections.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {q.isLoading && <div className="py-4 text-center text-xs text-muted-foreground">Carregando biblioteca…</div>}
      {missing && (
        <div className="rounded-xl border border-dashed border-border/70 p-3 text-[11px] leading-relaxed text-muted-foreground">
          A biblioteca ainda não está ativada. Aplique o SQL da Fase 5 no Supabase para salvar componentes.
        </div>
      )}
      {q.isError && !missing && (
        <div className="rounded-xl border border-destructive/40 p-3 text-[11px] text-destructive">
          Erro ao carregar: {errMsg(q.error)}
        </div>
      )}
      {q.isSuccess && list.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/70 p-3 text-center text-[11px] text-muted-foreground">
          Nenhum componente salvo. Selecione elementos no canvas e clique em “Salvar seleção”.
        </div>
      )}
      {q.isSuccess && list.length > 0 && shown.length === 0 && (
        <div className="py-3 text-center text-[11px] text-muted-foreground">Nenhum componente com esse filtro</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {shown.map((c) => (
          <div key={c.id} className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:border-primary/60">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => insert(c)}
              className="block w-full p-1.5 text-left disabled:opacity-60"
              title={`Inserir ${c.name}`}
            >
              <div className="aspect-video w-full"><Thumb parts={c.parts} /></div>
              <div className="mt-1 truncate text-[11px] font-medium">{c.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {catLabel(c.category)}{c.collection ? ` · ${c.collection}` : ""}
              </div>
            </button>
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="secondary" className="absolute right-1 top-1 h-6 w-6 opacity-90" aria-label={`Ações de ${c.name}`}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setForm({ id: c.id, name: c.name, category: c.category, collection: c.collection ?? "" })}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear / organizar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void replaceWithSelection(c)}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Substituir pela seleção
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => m.duplicate.mutate(c, {
                    onSuccess: () => toast.success("Componente duplicado"),
                    onError: (e) => toast.error(`Não foi possível duplicar: ${errMsg(e)}`),
                  })}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(c)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar componente" : "Salvar na biblioteca"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sc-name">Nome</Label>
                <Input id="sc-name" autoFocus maxLength={120} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && void submit()} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ComponentCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPONENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sc-col">Coleção (opcional)</Label>
                <Input id="sc-col" list="sc-collections" maxLength={80} placeholder="Ex.: Jornal da manhã"
                  value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })} />
                <datalist id="sc-collections">{collections.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              {!form.id && <p className="text-xs text-muted-foreground">{selParts.length} camada(s) serão salvas.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={m.create.isPending || m.update.isPending}>
              {m.create.isPending || m.update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O componente sai da biblioteca. Templates onde ele já foi inserido não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && m.remove.mutate(toDelete.id, {
                onSuccess: () => toast.success("Componente excluído"),
                onError: (e) => toast.error(`Não foi possível excluir: ${errMsg(e)}`),
              })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
