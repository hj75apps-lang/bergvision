import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, slugify } from "@/hooks/use-auth";
import { Logo } from "@/components/brand/logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Berg Vision" },
      {
        name: "description",
        content: "Acesse o painel Berg Vision para gerenciar sua rede de mídia indoor.",
      },
    ],
  }),
  component: AuthPage,
});

async function ensureBootstrap(userId: string, email: string, fullName: string, orgName: string) {
  // Se já existe registro em users, nada a fazer.
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing) return;

  // Cria organização com slug único
  const base = slugify(orgName || email.split("@")[0]);
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const { data: taken } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!taken) break;
    slug = `${base}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: orgName || `${fullName || email.split("@")[0]}'s org`, slug })
    .select("id")
    .single();
  if (orgErr) throw orgErr;

  const { error: userErr } = await supabase.from("users").insert({
    id: userId,
    organization_id: org.id,
    role: "owner",
    email,
    full_name: fullName || null,
  });
  if (userErr) throw userErr;
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-[120px] max-w-[360px]" />
          <p className="mt-3 text-sm text-muted-foreground">
            Painel de mídia indoor
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-xl backdrop-blur-2xl">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="login" className="rounded-lg">Entrar</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-lg">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-6">
              <LoginForm />
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <SignupForm />
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ao continuar, você concorda com os termos de uso do Berg Vision.
        </p>
      </div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vindo de volta!");
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      const msg = err?.message || "Não foi possível entrar.";
      toast.error(
        msg.includes("Invalid login credentials")
          ? "E-mail ou senha incorretos."
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">E-mail</Label>
        <Input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Senha</Label>
          <Link
            to="/reset-password"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Esqueci minha senha
          </Link>
        </div>
        <Input
          id="login-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}

function SignupForm() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, organization_name: orgName },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      const userId = data.user?.id;
      if (data.session && userId) {
        try {
          await ensureBootstrap(userId, email, fullName, orgName);
        } catch (err: any) {
          console.error(err);
          toast.error("Conta criada, mas falhou ao configurar sua organização: " + (err?.message || err));
        }
        toast.success("Conta criada com sucesso!");
        navigate({ to: "/", replace: true });
      } else {
        toast.success(
          "Conta criada! Verifique seu e-mail para confirmar antes de entrar.",
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível criar sua conta.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">Seu nome</Label>
        <Input
          id="signup-name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-org">Nome da organização</Label>
        <Input
          id="signup-org"
          required
          placeholder="Ex.: Berg Vision Mídia"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input
          id="signup-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Senha</Label>
        <Input
          id="signup-password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl">
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar conta
      </Button>
    </form>
  );
}