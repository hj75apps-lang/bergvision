import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Wand2 } from "lucide-react";
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
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GridSkeleton } from "@/components/layout/grid-skeleton";
import { slugify } from "@/lib/template-utils";

export const Route = createFileRoute("/studio")({
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
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, name, orientation, canvas_width, canvas_height, background_color, thumbnail_url",
        )
        .eq("type", "canvas")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CanvasTemplate[];
    },
  });

  const createMut = useMutation({
    mutationFn: async (input: { name: string; orientation: Orientation }) => {
      if (!orgId) throw new Error("Organização ausente.");
      const width = input.orientation === "landscape" ? 1920 : 1080;
      const height = input.orientation === "landscape" ? 1080 : 1920;
      const { data, error } = await supabase
        .from("templates")
        .insert({
          name: input.name.trim(),
          slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`,
          type: "canvas",
          orientation: input.orientation,
          canvas_width: width,
          canvas_height: height,
          aspect_ratio: input.orientation === "landscape" ? "16:9" : "9:16",
          background_color: "#0F172A",
          scaling_mode: "fit",
          is_system: false,
          organization_id: orgId,
          created_by: user?.id ?? null,
          zone_count: 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["studio_templates"] });
      setCreating(false);
      toast.success("Template criado.");
      navigate({ to: "/studio/$templateId", params: { templateId: id } });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Falha ao criar template.");
    },
  });

  const templates = templatesQ.data ?? [];

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
            {canManage && (
              <Button onClick={() => setCreating(true)} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Criar novo template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const w = t.canvas_width ?? 1920;
            const h = t.canvas_height ?? 1080;
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
                <div
                  className="w-full overflow-hidden border-b border-border/60"
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t.name}</CardTitle>
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
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border/60 p-3 transition hover:border-primary/40 has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
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
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border/60 p-3 transition hover:border-primary/40 has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
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