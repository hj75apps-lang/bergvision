import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImageIcon, KeyRound, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · Berg Vision" },
      {
        name: "description",
        content:
          "Preferências da organização, identidade visual e conta do usuário.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

const BUCKET = "media";
const LOGO_FOLDER = "_system";
const LOGO_NAME = "organization-logo";

type LogoRow = {
  id: string;
  storage_path: string;
  mime_type: string | null;
};

function slugifyExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function ConfiguracoesPage() {
  const { membership, user, refresh } = useAuth();
  const role = membership?.role ?? "viewer";
  const canManageOrg = role === "owner" || role === "admin";
  const orgId = membership?.organization_id ?? null;
  const qc = useQueryClient();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie sua organização, identidade visual e sua conta.
        </p>
      </header>

      <OrganizationSection
        orgId={orgId}
        currentName={membership?.organization?.name ?? ""}
        canManage={canManageOrg}
        onUpdated={() => refresh()}
      />

      <LogoSection orgId={orgId} canManage={canManageOrg} qc={qc} />

      <PasswordSection userEmail={user?.email ?? null} />
    </div>
  );
}

function OrganizationSection({
  orgId,
  currentName,
  canManage,
  onUpdated,
}: {
  orgId: string | null;
  currentName: string;
  canManage: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  useEffect(() => setName(currentName), [currentName]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organização não identificada.");
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error("Nome muito curto.");
      if (trimmed.length > 80) throw new Error("Nome muito longo (máx. 80).");
      const { error } = await supabase
        .from("organizations")
        .update({ name: trimmed })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Organização atualizada.");
      await onUpdated();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao salvar."),
  });

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Organização</CardTitle>
            <CardDescription>
              Nome exibido nos convites e no cabeçalho do painel.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Nome da organização</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage}
            className="h-10 rounded-xl"
          />
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              Apenas owners e admins podem editar.
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || name.trim() === currentName.trim()}
              className="rounded-xl"
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogoSection({
  orgId,
  canManage,
  qc,
}: {
  orgId: string | null;
  canManage: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const logoQ = useQuery({
    queryKey: ["org-logo", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<LogoRow | null> => {
      const { data, error } = await supabase
        .from("media_files")
        .select("id, storage_path, thumbnail_path, mime_type")
        .eq("organization_id", orgId!)
        .eq("folder", LOGO_FOLDER)
        .eq("name", LOGO_NAME)
        .maybeSingle();
      if (error) throw error;
      return (data as LogoRow | null) ?? null;
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const logo = logoQ.data;
      if (!logo?.storage_path) {
        setSignedUrl(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(logo.storage_path, 3600);
      if (!cancelled) setSignedUrl(error ? null : (data?.signedUrl ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [logoQ.data]);

  const upload = async (file: File) => {
    if (!orgId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("O logo precisa ser uma imagem (PNG, JPG, SVG ou WEBP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB).");
      return;
    }
    setUploading(true);
    try {
      const ext = slugifyExt(file.type);
      const path = `${orgId}/${crypto.randomUUID()}-logo.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      // Substitui o registro anterior (se houver) e o arquivo antigo do Storage.
      const previous = logoQ.data;
      if (previous) {
        const { error: delErr } = await supabase
          .from("media_files")
          .delete()
          .eq("id", previous.id);
        if (delErr) {
          // rollback do upload novo para não deixar dois arquivos no Storage
          await supabase.storage.from(BUCKET).remove([path]);
          throw delErr;
        }
        const previousPaths = [previous.storage_path, previous.thumbnail_path].filter(
          (p): p is string => !!p,
        );
        if (previousPaths.length) {
          await supabase.storage.from(BUCKET).remove(previousPaths);
        }
      }

      const { error: dbErr } = await supabase.from("media_files").insert({
        organization_id: orgId,
        name: LOGO_NAME,
        folder: LOGO_FOLDER,
        type: "image",
        mime_type: file.type,
        size: file.size,
        file_size: file.size,
        storage_path: path,
      });
      if (dbErr) {
        // rollback do upload
        await supabase.storage.from(BUCKET).remove([path]);
        throw dbErr;
      }

      toast.success("Logo atualizado.");
      qc.invalidateQueries({ queryKey: ["org-logo", orgId] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao enviar logo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Logo da organização</CardTitle>
            <CardDescription>
              PNG, JPG, SVG ou WEBP até 5 MB. Recomendado: 512×512, fundo transparente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
            {logoQ.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : signedUrl ? (
              <img
                src={signedUrl}
                alt="Logo"
                className="h-full w-full object-contain"
                loading="lazy"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground/60" />
            )}
          </div>
          {canManage && (
            <div className="flex flex-col gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="rounded-xl"
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {logoQ.data ? "Substituir logo" : "Enviar logo"}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordSection({ userEmail }: { userEmail: string | null }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userEmail) {
      toast.error("Sessão não identificada.");
      return;
    }
    if (next.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (next !== confirm) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }
    setSubmitting(true);
    try {
      // Revalida a senha atual antes de trocar.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: current,
      });
      if (signErr) throw new Error("Senha atual incorreta.");

      const { error: upErr } = await supabase.auth.updateUser({ password: next });
      if (upErr) throw upErr;

      toast.success("Senha atualizada.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao atualizar senha.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Alterar senha</CardTitle>
            <CardDescription>
              Mínimo de 8 caracteres. Você continuará logado após a troca.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pw-current">Senha atual</Label>
            <Input
              id="pw-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="h-10 rounded-xl"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">Nova senha</Label>
            <Input
              id="pw-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="h-10 rounded-xl"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
            <Input
              id="pw-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="h-10 rounded-xl"
              required
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={submitting} className="rounded-xl">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Alterar senha
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}