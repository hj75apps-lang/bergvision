import { useEffect, useState } from "react";
import { Copy, Film, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSequences } from "@/lib/video-editor/sequence-store";
import { useVideoTimeline } from "@/lib/video-editor/timeline-store";
import {
  applyAspect, ASPECTS, clampDim, FRAME_RATES, nearestAspect, RESOLUTION_PRESETS, SAMPLE_RATES,
  type AspectRatio, type FrameRate, type SampleRate, type SequenceSettings,
} from "@/lib/video-editor/sequences";

/** Abas de sequências + autosave da linha do tempo na sequência ativa. */
export function SequenceBar({ orgId }: { orgId: string | undefined }) {
  const { sequences, activeId, hydrate, create, rename, duplicate, remove, setActive, updateSettings, saveContent } = useSequences();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const active = sequences.find((s) => s.id === activeId) ?? null;

  useEffect(() => { if (orgId) hydrate(orgId); }, [orgId, hydrate]);

  // Ao trocar de sequência, carrega a montagem dela na linha do tempo.
  useEffect(() => {
    const seq = useSequences.getState().sequences.find((s) => s.id === activeId);
    if (seq) useVideoTimeline.getState().load(seq.tracks, seq.clips);
  }, [activeId]);

  // Autosave (debounce 600 ms) das trilhas/clipes na sequência ativa.
  useEffect(() => {
    if (!activeId) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useVideoTimeline.subscribe((s, prev) => {
      if (s.tracks === prev.tracks && s.clips === prev.clips) return;
      clearTimeout(t);
      t = setTimeout(() => saveContent(activeId, s.tracks, s.clips), 600);
    });
    return () => {
      unsub();
      if (t) { clearTimeout(t); const s = useVideoTimeline.getState(); saveContent(activeId, s.tracks, s.clips); }
    };
  }, [activeId, saveContent]);

  const commitRename = () => { if (renaming) rename(renaming, draft); setRenaming(null); };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur">
      <div className="flex items-center gap-1 overflow-x-auto">
        {sequences.map((s) => (
          renaming === s.id ? (
            <Input key={s.id} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
              className="h-8 w-40 rounded-lg" aria-label="Nome da sequência" />
          ) : (
            <button key={s.id} type="button" onClick={() => setActive(s.id)}
              onDoubleClick={() => { setRenaming(s.id); setDraft(s.name); }}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors ${s.id === activeId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <Film className="h-3.5 w-3.5" />{s.name}
            </button>
          )
        ))}
        <Button size="sm" variant="ghost" className="h-8 shrink-0 rounded-lg" onClick={() => create(active?.settings)} title="Nova sequência">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {active && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="mr-auto px-1">
            {active.settings.width}×{active.settings.height} · {active.settings.aspect} · {active.settings.fps} fps · {active.settings.sampleRate / 1000} kHz · salvo automaticamente
          </span>
          <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => { setRenaming(active.id); setDraft(active.name); }}><Pencil className="mr-1 h-3.5 w-3.5" />Renomear</Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => duplicate(active.id)}><Copy className="mr-1 h-3.5 w-3.5" />Duplicar</Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1 h-3.5 w-3.5" />Configurar</Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-destructive" onClick={() => setConfirmDel(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Excluir</Button>
        </div>
      )}
      {active && (
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} value={active.settings}
          onSave={(v) => updateSettings(active.id, v)} />
      )}
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{active?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>A montagem desta sequência será apagada. Os arquivos da biblioteca não são afetados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => active && remove(active.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsDialog({ open, onOpenChange, value, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; value: SequenceSettings; onSave: (v: SequenceSettings) => void;
}) {
  const [s, setS] = useState(value);
  useEffect(() => { if (open) setS(value); }, [open, value]);
  const preset = RESOLUTION_PRESETS.find((p) => p.width === s.width && p.height === s.height);
  const setDim = (k: "width" | "height", n: number) => setS((p) => {
    const next = { ...p, [k]: n };
    return { ...next, aspect: nearestAspect(next.width || 1, next.height || 1) };
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader><DialogTitle>Configurações da sequência</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Resolução</Label>
            <Select value={preset ? `${preset.width}x${preset.height}` : "custom"} onValueChange={(v) => {
              const p = RESOLUTION_PRESETS.find((r) => `${r.width}x${r.height}` === v);
              if (p) setS((x) => ({ ...x, width: p.width, height: p.height, aspect: "16:9" }));
            }}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOLUTION_PRESETS.map((p) => <SelectItem key={p.label} value={`${p.width}x${p.height}`}>{p.label}</SelectItem>)}
                <SelectItem value="custom">Personalizada</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="numeric" aria-label="Largura" value={s.width} className="rounded-xl"
                onChange={(e) => setDim("width", Number(e.target.value))} />
              <span className="text-muted-foreground">×</span>
              <Input type="number" inputMode="numeric" aria-label="Altura" value={s.height} className="rounded-xl"
                onChange={(e) => setDim("height", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Proporção</Label>
              <Select value={s.aspect} onValueChange={(v) => setS((x) => applyAspect(x, v as AspectRatio))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{ASPECTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Frame rate</Label>
              <Select value={String(s.fps)} onValueChange={(v) => setS((x) => ({ ...x, fps: Number(v) as FrameRate }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{FRAME_RATES.map((f) => <SelectItem key={f} value={String(f)}>{f} fps</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Áudio</Label>
              <Select value={String(s.sampleRate)} onValueChange={(v) => setS((x) => ({ ...x, sampleRate: Number(v) as SampleRate }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{SAMPLE_RATES.map((r) => <SelectItem key={r} value={String(r)}>{r / 1000} kHz</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" onClick={() => {
            onSave({ ...s, width: clampDim(s.width), height: clampDim(s.height) });
            onOpenChange(false);
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
