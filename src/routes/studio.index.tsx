import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { slugify } from "@/lib/template-utils";

export const Route = createFileRoute("/studio/")({
  head: () => ({
    meta: [
      { title: "Studio · Berg Vision" },
      {
        name: "description",
        content:
          "Crie templates personalizados com posicionamento livre de elementos.",
      },
    ],
  }),
  component: StudioPage,
});

type CanvasTemplate = {
  id: string;
  name: string;
  orientation: string | null;
  canvas_width: number | null;
  canvas_height: number | null;
  background_color: string | null;
  thumbnail_url: string | null;
};

type Orientation = "landscape" | "portrait";

const DEFAULT_CANVAS_LAYOUT_CSS = JSON.stringify({
  kind: "canvas",
  version: 1,
  elements: [],
});

function StudioPage() {
  const { membership, user } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const role = membership?.role ?? "viewer";
  const canManage = role === "owner" || role === "admin";
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const templatesQ = useQuery({
    queryKey: ["studio_templates", orgId],
    enabled: !!orgId,
      queryFn: async (): Promise<CanvasTemplate[]> => {
      let query = supabase
        .from("templates")
        .select(
          "id, name, orientation, canvas_width, canvas_height, background_color, thumbnail_url, type",
        )
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      let { data, error } = await query;
      if (error && /column .*type/i.test(error.message)) {
        // Coluna 'type' ainda não existe no schema — lista todos os templates da org.
        const retry = await supabase
          .from("templates")
          .select(
            "id, name, orientation, canvas_width, canvas_height, background_color, thumbnail_url",
          )
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false });
        if (retry.error) throw retry.error;
        return (retry.data ?? []) as CanvasTemplate[];
      }
      if (error) throw error;
      // Org filter already scopes to user's own templates (system templates
      // have organization_id = null). Do not filter by `type` on the client
      // because rows created before the column existed (or via a retry that
      // stripped it) may have NULL/'grid' — dropping them here hides the
      // template the operator just created.
      return (data ?? []) as CanvasTemplate[];
    },
  });

  const createMut = useMutation({
    mutationFn: async (input: { name: string; orientation: Orientation }) => {
      if (!orgId) throw new Error("Organização ausente.");
      const width = input.orientation === "landscape" ? 1920 : 1080;
      const height = input.orientation === "landscape" ? 1080 : 1920;
      const basePayload: Record<string, unknown> = {
        name: input.name.trim(),
        slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`,
        type: "canvas",
        orientation: input.orientation,
        canvas_width: width,
        canvas_height: height,
        aspect_ratio: input.orientation === "landscape" ? "16:9" : "9:16",
        background_color: "#0F172A",
        layout_css: DEFAULT_CANVAS_LAYOUT_CSS,
        scaling_mode: "fit",
        is_system: false,
        organization_id: orgId,
        created_by: user?.id ?? null,
        zone_count: 0,
      };

      // Retry stripping optional columns that may not exist in this schema.
      const optionalKeys = [
        "type",
        "aspect_ratio",
        "scaling_mode",
        "zone_count",
        "background_color",
        "canvas_width",
        "canvas_height",
      ];
      let payload = { ...basePayload };
      let lastError: { message: string; details?: string; hint?: string; code?: string } | null = null;
      for (let attempt = 0; attempt <= optionalKeys.length; attempt++) {
        const { data, error } = await supabase
          .from("templates")
          .insert(payload as never)
          .select("id")
          .single();
        if (!error) return (data as { id: string }).id;
        lastError = {
          message: error.message,
          details: error.details ?? undefined,
          hint: error.hint ?? undefined,
          code: error.code ?? undefined,
        };
        // If the error is about a missing column, strip it and retry.
        const msg = `${error.message} ${error.details ?? ""}`.toLowerCase();
        const missingCol = optionalKeys.find(
          (k) => msg.includes(`"${k}"`) || msg.includes(` ${k} `) || msg.includes(`'${k}'`),
        );
        if (missingCol && missingCol in payload) {
          const next = { ...payload };
          delete (next as Record<string, unknown>)[missingCol];
          payload = next;
          continue;
        }
        break;
      }
      // Se sobrou erro de coluna faltando depois de todos os retries, o
      // schema do Studio ainda não foi aplicado — mensagem acionável.
      const raw = `${lastError?.message ?? ""} ${lastError?.details ?? ""}`.toLowerCase();
      if (/column .* does not exist/.test(raw) || raw.includes("template_elements")) {
        throw new Error(
          "Schema do Studio não aplicado no Supabase. Rode docs/sql/20260710_studio_canvas_schema.sql no SQL Editor.",
        );
      }
      throw new Error(
        [lastError?.message, lastError?.details, lastError?.hint, lastError?.code]
          .filter(Boolean)
          .join(" · ") || "Falha desconhecida ao criar template",
      );
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["studio_templates"] });
      setCreating(false);
      toast.success("Template criado.");
      navigate({ to: "/studio/$templateId", params: { templateId: id } });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha ao criar template.";
      // eslint-disable-next-line no-console
      console.error("[studio] createTemplate error:", e);
      toast.error(msg, { duration: 8000 });
    },
  });

  const templates = templatesQ.data ?? [];

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("template_elements").delete().eq("template_id", id);
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio_templates"] });
      toast.success("Template excluído.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha ao excluir."),
  });
  const [deleteTarget, setDeleteTarget] = useState<CanvasTemplate | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Wand2 className="h-3.5 w-3.5" />
            Studio
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Templates personalizados
          </h1>
          <p className="text-sm text-muted-foreground">
            Posicionamento livre de elementos em um canvas responsivo.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setCreating(true)}
            className="rounded-xl"
            size="lg"
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar novo template
          </Button>
        )}
      </header>

      {templatesQ.isLoading ? (
        <GridSkeleton count={6} />
      ) : templates.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Wand2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Nenhum template ainda</h2>
              <p className="text-sm text-muted-foreground">
                Crie seu primeiro template personalizado para começar.
              </p>
            </div>
            {!canManage && (
              <div className="mt-2 max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
                Seu papel atual é <strong>{role}</strong>. Apenas{" "}
                <strong>owner</strong> ou <strong>admin</strong> podem criar
                templates no Studio. Peça a um administrador para elevar seu
                papel em <em>Equipe</em>.
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const w = t.canvas_width ?? 1920;
            const h = t.canvas_height ?? 1080;
            const isPortrait = h > w;
            return (
              <Card
                key={t.id}
                className="group cursor-pointer overflow-hidden rounded-2xl transition hover:border-primary/40 hover:shadow-lg"
                onClick={() =>
                  navigate({
                    to: "/studio/$templateId",
                    params: { templateId: t.id },
                  })
                }
              >
                <div className="flex h-56 w-full items-center justify-center overflow-hidden border-b border-border/60 bg-neutral-950/60 p-3">
                  <div
                    className={
                      isPortrait
                        ? "h-full w-auto rounded-md shadow-md ring-1 ring-white/5"
                        : "w-full h-auto rounded-md shadow-md ring-1 ring-white/5"
                    }
                    style={{
                      aspectRatio: `${w} / ${h}`,
                      backgroundColor: t.background_color ?? "#0F172A",
                      backgroundImage: t.thumbnail_url
                        ? `url(${t.thumbnail_url})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(t);
                        }}
                        title="Excluir template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardFooter className="justify-between text-xs text-muted-foreground">
                  <span>
                    {w}×{h}
                  </span>
                  <span className="capitalize">
                    {t.orientation === "portrait" ? "Retrato" : "Paisagem"}
                  </span>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        onSubmit={(v) => createMut.mutate(v)}
        submitting={createMut.isPending}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" e todos os seus elementos serão removidos
              permanentemente. Players que usam este template ficarão sem layout
              ativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMut.mutate(deleteTarget.id, {
                    onSettled: () => setDeleteTarget(null),
                  });
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: { name: string; orientation: Orientation }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("landscape");

  const reset = () => {
    setName("");
    setOrientation("landscape");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar novo template</DialogTitle>
          <DialogDescription>
            Escolha um nome e a orientação do canvas.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Vitrine promocional"
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Orientação</Label>
            <RadioGroup
              value={orientation}
              onValueChange={(v) => setOrientation(v as Orientation)}
              className="grid grid-cols-2 gap-3"
            >
              <label
                htmlFor="orient-landscape"
                data-selected={orientation === "landscape"}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border/60 p-3 transition hover:border-primary/40 data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
              >
                <RadioGroupItem
                  id="orient-landscape"
                  value="landscape"
                  className="sr-only"
                />
                <div className="h-10 w-16 rounded-md bg-muted" />
                <span className="text-xs font-medium">Paisagem</span>
                <span className="text-[10px] text-muted-foreground">
                  1920 × 1080
                </span>
              </label>
              <label
                htmlFor="orient-portrait"
                data-selected={orientation === "portrait"}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border/60 p-3 transition hover:border-primary/40 data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
              >
                <RadioGroupItem
                  id="orient-portrait"
                  value="portrait"
                  className="sr-only"
                />
                <div className="h-16 w-10 rounded-md bg-muted" />
                <span className="text-xs font-medium">Retrato</span>
                <span className="text-[10px] text-muted-foreground">
                  1080 × 1920
                </span>
              </label>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => onSubmit({ name, orientation })}
            disabled={submitting || name.trim().length < 2}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar e abrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}