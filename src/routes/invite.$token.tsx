import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Aceitar convite · Berg Vision" },
      { name: "description", content: "Junte-se à sua organização no Berg Vision." },
    ],
  }),
  component: InvitePage,
});

type InviteInfo = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  organization_name?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
};

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc("get_invite_by_token", {
          invite_token: token,
        });
        if (rpcErr) throw rpcErr;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setError("Convite inválido ou já utilizado.");
        } else if (row.accepted_at) {
          setError("Este convite já foi aceito.");
        } else if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
          setError("Este convite expirou.");
        } else {
          setInvite(row as InviteInfo);
        }
      } catch (err: any) {
        setError(err?.message || "Não foi possível carregar o convite.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const acceptInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          data: { full_name: fullName, invite_token: token },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (signUpErr) throw signUpErr;

      const userId = signUpData.user?.id;
      if (!signUpData.session || !userId) {
        toast.success("Conta criada! Confirme seu e-mail para concluir o convite.");
        return;
      }

      const { error: userErr } = await supabase.from("users").insert({
        id: userId,
        organization_id: invite.organization_id,
        role: invite.role,
        email: invite.email,
        full_name: fullName || null,
      });
      if (userErr) throw userErr;

      await supabase
        .from("invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      toast.success("Convite aceito. Bem-vindo!");
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível aceitar o convite.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Aceitar convite</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invite?.organization_name
              ? `Você foi convidado para ${invite.organization_name}.`
              : "Complete seu cadastro para entrar na organização."}
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-xl backdrop-blur-2xl">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-destructive">{error}</div>
          ) : invite ? (
            <form onSubmit={acceptInvite} className="space-y-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={invite.email} disabled className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-name">Seu nome</Label>
                <Input
                  id="inv-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-password">Senha</Label>
                <Input
                  id="inv-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Papel atribuído: <span className="font-medium capitalize">{invite.role}</span>
              </div>
              <Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aceitar e criar conta
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}