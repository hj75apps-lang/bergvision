// Visual layout editor for CUSTOM templates. Owner/admin only.
// - Canvas with drag/resize/snap (via TemplateCanvas edit mode)
// - Side panel: template metadata + zone list + selected-zone properties
// - Undo/redo stack (max 30 snapshots)
// - Add zone / delete zone
// - Save persists the full zone set with an upsert + delete-diff

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Loader2,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { supabase } from "@/integrations/supabase/client";
import { TemplateCanvas } from "@/components/template/template-canvas";
import {
  clampZoneRect,
  snapPct,
  type AspectRatio,
  type Template,
  type Zone,
} from "@/lib/template-utils";

const MAX_HISTORY = 30;

function tempId() {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`;
}

function makeZone(index: number): Zone {
  return {
    id: tempId(),
    template_id: "",
    zone_index: index,
    zone_name: `Zona ${index + 1}`,
    grid_area: null,
    pos_x: 10 + index * 5,
    pos_y: 10 + index * 5,
    width_pct: 30,
    height_pct: 30,
    z_index: index,
    content_type: "empty",
    media_file_id: null,
    playlist_id: null,
    widget_type: null,
    widget_config: null,
  };
}

export function LayoutEditorDialog({
  template,
  initialZones,
  open,
  onOpenChange,
  onSaved,
}: {
  template: Template;
  initialZones: Zone[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();

  const [name, setName] = useState(template.name);
  const [aspect, setAspect] = useState<AspectRatio>(template.aspect_ratio);
  const [canvasW, setCanvasW] = useState(template.canvas_width);
  const [canvasH, setCanvasH] = useState(template.canvas_height);
  const [allowOverlap, setAllowOverlap] = useState(template.allow_overlap);
  const [snap, setSnap] = useState<number>(1);

  const [zones, setZones] = useState<Zone[]>(() => initialZones.map((z) => ({ ...z })));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Undo/redo history — snapshots of zones only (metadata is edited via inputs
  // and doesn't need to participate in the drag/resize history).
  const historyRef = useRef<Zone[][]>([]);
  const futureRef = useRef<Zone[][]>([]);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (open) {
      setName(template.name);
      setAspect(template.aspect_ratio);
      setCanvasW(template.canvas_width);
      setCanvasH(template.canvas_height);
      setAllowOverlap(template.allow_overlap);
      setZones(initialZones.map((z) => ({ ...z })));
      setSelectedId(null);
      historyRef.current = [];
      futureRef.current = [];
      dirtyRef.current = false;
    }
  }, [open, template.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushHistory = (snapshot: Zone[]) => {
    historyRef.current.push(snapshot.map((z) => ({ ...z })));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    futureRef.current = [];
    dirtyRef.current = true;
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(zones.map((z) => ({ ...z })));
    setZones(prev);
  };
  const redo = () => {
    const nxt = futureRef.current.pop();
    if (!nxt) return;
    historyRef.current.push(zones.map((z) => ({ ...z })));
    setZones(nxt);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, zones]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(
    () => zones.find((z) => z.id === selectedId) ?? null,
    [zones, selectedId],
  );

  const addZone = () => {
    pushHistory(zones);
    const z = makeZone(zones.length);
    setZones([...zones, z]);
    setSelectedId(z.id);
  };

  const removeZone = (id: string) => {
    pushHistory(zones);
    setZones(zones.filter((z) => z.id !== id).map((z, i) => ({ ...z, zone_index: i })));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelected = (patch: Partial<Zone>) => {
    if (!selected) return;
    pushHistory(zones);
    setZones(
      zones.map((z) => {
        if (z.id !== selected.id) return z;
        const merged = { ...z, ...patch };
        if (
          patch.pos_x != null ||
          patch.pos_y != null ||
          patch.width_pct != null ||
          patch.height_pct != null
        ) {
          const c = clampZoneRect({
            pos_x: snapPct(merged.pos_x ?? 0, snap),
            pos_y: snapPct(merged.pos_y ?? 0, snap),
            width_pct: snapPct(merged.width_pct ?? 30, snap),
            height_pct: snapPct(merged.height_pct ?? 30, snap),
          });
          return { ...merged, ...c };
        }
        return merged;
      }),
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe um nome.");
      if (zones.length === 0) throw new Error("Adicione pelo menos uma zona.");
      if (aspect === "custom" && (canvasW < 100 || canvasH < 100)) {
        throw new Error("Dimensões inválidas para canvas customizado.");
      }

      // 1. Update template metadata
      const { error: tErr } = await supabase
        .from("templates")
        .update({
          name: name.trim(),
          aspect_ratio: aspect,
          canvas_width: canvasW,
          canvas_height: canvasH,
          allow_overlap: allowOverlap,
          zone_count: zones.length,
        })
        .eq("id", template.id);
      if (tErr) throw tErr;

      // 2. Delete zones removed in the editor
      const keepIds = zones.filter((z) => !z.id.startsWith("tmp_")).map((z) => z.id);
      const existingIds = initialZones.map((z) => z.id);
      const toDelete = existingIds.filter((id) => !keepIds.includes(id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from("template_zones").delete().in("id", toDelete);
        if (error) throw error;
      }

      // 3. Upsert zones — insert new (tmp_ ids) and update existing
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const payload = {
          template_id: template.id,
          zone_index: i,
          zone_name: z.zone_name,
          pos_x: z.pos_x,
          pos_y: z.pos_y,
          width_pct: z.width_pct,
          height_pct: z.height_pct,
          z_index: z.z_index,
          content_type: z.content_type,
          media_file_id: z.media_file_id,
          playlist_id: z.playlist_id,
          widget_type: z.widget_type,
          widget_config: z.widget_config,
        };
        if (z.id.startsWith("tmp_")) {
          const { error } = await supabase.from("template_zones").insert(payload);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("template_zones")
            .update(payload)
            .eq("id", z.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Layout salvo.");
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["template_zones", template.id] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar layout."),
  });

  const attemptClose = (v: boolean) => {
    if (!v && dirtyRef.current) {
      if (!window.confirm("Descartar alterações não salvas?")) return;
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={attemptClose}>
      <DialogContent className="max-h-[95vh] overflow-hidden rounded-2xl sm:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>Editor de Layout · {template.name}</DialogTitle>
          <DialogDescription>
            Arraste e redimensione as zonas. Snap {snap}% · Ctrl+Z desfaz.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* CANVAS */}
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="rounded-xl" onClick={addZone}>
                <Plus className="mr-1.5 h-4 w-4" /> Nova zona
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl"
                onClick={undo}
                disabled={historyRef.current.length === 0}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl"
                onClick={redo}
                disabled={futureRef.current.length === 0}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
              <div className="ml-auto flex items-center gap-2 text-xs">
                <Label className="text-xs">Snap</Label>
                <Select value={String(snap)} onValueChange={(v) => setSnap(Number(v))}>
                  <SelectTrigger className="h-8 w-20 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1%</SelectItem>
                    <SelectItem value="2">2%</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mx-2 h-4 w-px bg-border" />
                <Label htmlFor="overlap" className="text-xs">
                  Sobreposição
                </Label>
                <Switch id="overlap" checked={allowOverlap} onCheckedChange={setAllowOverlap} />
              </div>
            </div>

            <TemplateCanvas
              template={{
                aspect_ratio: aspect,
                canvas_width: canvasW,
                canvas_height: canvasH,
                allow_overlap: allowOverlap,
              }}
              zones={zones}
              mode="edit"
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={(next) => setZones(next)}
              onCommit={(committed) => pushHistory(committed)}
              snap={snap}
            />
          </div>

          {/* SIDE PANEL */}
          <div className="space-y-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/40 p-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                className="h-9 rounded-xl"
                value={name}
                onChange={(e) => {
                  dirtyRef.current = true;
                  setName(e.target.value);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Aspect ratio</Label>
                <Select
                  value={aspect}
                  onValueChange={(v) => {
                    dirtyRef.current = true;
                    setAspect(v as AspectRatio);
                  }}
                >
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9</SelectItem>
                    <SelectItem value="9:16">9:16</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="21:9">21:9</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {aspect === "custom" && (
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Largura (px)</Label>
                    <Input
                      type="number"
                      min={100}
                      className="h-9 rounded-xl"
                      value={canvasW}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setCanvasW(Number(e.target.value) || 0);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Altura (px)</Label>
                    <Input
                      type="number"
                      min={100}
                      className="h-9 rounded-xl"
                      value={canvasH}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setCanvasH(Number(e.target.value) || 0);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Zonas ({zones.length})</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border/50 bg-background/40 p-1">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setSelectedId(z.id)}
                    className={
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors " +
                      (selectedId === z.id
                        ? "bg-primary/20 text-foreground"
                        : "hover:bg-muted/50 text-muted-foreground")
                    }
                  >
                    <span className="truncate">{z.zone_name}</span>
                    <span className="tabular-nums text-[10px] opacity-70">
                      {Math.round(z.width_pct ?? 0)}×{Math.round(z.height_pct ?? 0)}
                    </span>
                  </button>
                ))}
                {zones.length === 0 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    Nenhuma zona
                  </div>
                )}
              </div>
            </div>

            {selected && (
              <div className="space-y-2 rounded-xl border border-border/50 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Zona selecionada</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-500"
                    onClick={() => removeZone(selected.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    className="h-8 rounded-lg text-xs"
                    value={selected.zone_name}
                    onChange={(e) => updateSelected({ zone_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="X %"
                    value={selected.pos_x ?? 0}
                    onChange={(v) => updateSelected({ pos_x: v })}
                  />
                  <NumberField
                    label="Y %"
                    value={selected.pos_y ?? 0}
                    onChange={(v) => updateSelected({ pos_y: v })}
                  />
                  <NumberField
                    label="Largura %"
                    value={selected.width_pct ?? 0}
                    onChange={(v) => updateSelected({ width_pct: v })}
                  />
                  <NumberField
                    label="Altura %"
                    value={selected.height_pct ?? 0}
                    onChange={(v) => updateSelected({ height_pct: v })}
                  />
                </div>
                {allowOverlap && (
                  <div className="grid grid-cols-3 items-end gap-2">
                    <NumberField
                      label="Camada"
                      value={selected.z_index}
                      onChange={(v) => updateSelected({ z_index: Math.round(v) })}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() =>
                        updateSelected({ z_index: Math.max(0, selected.z_index - 1) })
                      }
                    >
                      <ArrowLeftRight className="h-3 w-3" /> trás
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => updateSelected({ z_index: selected.z_index + 1 })}
                    >
                      <ArrowLeftRight className="h-3 w-3" /> frente
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => attemptClose(false)} className="rounded-xl">
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-xl"
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar layout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        step={1}
        className="h-8 rounded-lg text-xs"
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}