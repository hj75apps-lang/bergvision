import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MailPlus, Trash2, UserPlus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe · Berg Vision" },
      {
        name: "description",
        content:
          "Convide membros e defina papéis (owner, admin, editor, viewer) para sua organização.",
      },
    ],
  }),
  component: EquipePage,
});

const ROLES: { value: AppRole; label: string; desc: string }[] = [
  { value: "owner", label: "Owner", desc: "Acesso total, inclui gestão de equipe" },
  { value: "admin", label: "Admin", desc: "Gerencia players, mídia, playlists e convida" },
  { value: "editor", label: "Editor", desc: "Edita mídia e playlists" },
  { value: "viewer", label: "Viewer", desc: "Apenas leitura" },
];

type Member = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  created_at?: string;
};

type Invite = {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
};

function EquipePage() {
  const { membership, user } = useAuth();
  const orgId = membership?.organization_id ?? null;
  const myRole = membership?.role ?? "viewer";
  const canManage = myRole === "owner" || myRole === "admin";
  const canPromoteOwner = myRole === "owner";
  const qc = useQueryClient();

  const membersQ = useQuery({
    queryKey: ["members", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, full_name, role, created_at")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const invitesQ = useQuery({
    queryKey: ["invites", orgId],
    enabled: !!orgId && canManage,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, role, token, created_at, expires_at, accepted_at")
        .eq("organization_id", orgId!)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });

  const ownerCount = useMemo(
    () => (membersQ.data ?? []).filter((m) => m.role === "owner").length,
    [membersQ.data],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie membros e convites de{" "}
          <span className="font-medium text-foreground">
            {membership?.organization?.name || "sua organização"}
          </span>
          .
        </p>
      </header>

      {canManage && (
        <InviteCard
          orgId={orgId!}
          onCreated={() => qc.invalidateQueries({ queryKey: ["invites", orgId] })}
        />
      )}

      <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base">Membros</CardTitle>
          <CardDescription>
            {membersQ.data?.length ?? 0} pessoa(s) na organização
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersQ.isLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          ) : (membersQ.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum membro encontrado.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {membersQ.data!.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isMe={m.id === user?.id}
                  ownerCount={ownerCount}
                  canManage={canManage}
                  canPromoteOwner={canPromoteOwner}
                  onChanged={() => qc.invalidateQueries({ queryKey: ["members", orgId] })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base">Convites pendentes</CardTitle>
            <CardDescription>
              Compartilhe o link com quem você quer convidar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitesQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (invitesQ.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum convite pendente.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {invitesQ.data!.map((inv) => (
                  <InviteRow
                    key={inv.id}
                    invite={inv}
                    onChanged={() =>
                      qc.invalidateQueries({ queryKey: ["invites", orgId] })
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InviteCard({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");

  const createInvite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invites").insert({
        organization_id: orgId,
        email: email.trim().toLowerCase(),
        role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Convite criado!");
      setEmail("");
      setRole("viewer");
      onCreated();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao criar convite."),
  });

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" /> Convidar membro
        </CardTitle>
        <CardDescription>
          Um link de convite será gerado para o e-mail informado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            createInvite.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="inv-email" className="text-xs">
              E-mail
            </Label>
            <Input
              id="inv-email"
              type="email"
              required
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r.value !== "owner").map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={createInvite.isPending}
              className="h-10 w-full rounded-xl sm:w-auto"
            >
              {createInvite.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MailPlus className="mr-2 h-4 w-4" />
              )}
              Convidar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  isMe,
  ownerCount,
  canManage,
  canPromoteOwner,
  onChanged,
}: {
  member: Member;
  isMe: boolean;
  ownerCount: number;
  canManage: boolean;
  canPromoteOwner: boolean;
  onChanged: () => void;
}) {
  const isLastOwner = member.role === "owner" && ownerCount <= 1;

  const updateRole = useMutation({
    mutationFn: async (nextRole: AppRole) => {
      if (isLastOwner && nextRole !== "owner") {
        throw new Error("Não é possível rebaixar o último owner da organização.");
      }
      const { error } = await supabase
        .from("users")
        .update({ role: nextRole })
        .eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papel atualizado.");
      onChanged();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao atualizar papel."),
  });

  const removeMember = useMutation({
    mutationFn: async () => {
      if (isLastOwner) throw new Error("Não é possível remover o último owner.");
      const { error } = await supabase.from("users").delete().eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Membro removido.");
      onChanged();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover membro."),
  });

  const initials =
    (member.full_name || member.email || "?")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const canEditRole = canManage && !isMe;
  const availableRoles = canPromoteOwner
    ? ROLES
    : ROLES.filter((r) => r.value !== "owner");

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-sm font-semibold text-primary">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {member.full_name || member.email}
          </span>
          {isMe && (
            <Badge variant="secondary" className="rounded-full text-[10px]">
              você
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>

      {canEditRole ? (
        <Select
          value={member.role}
          onValueChange={(v) => updateRole.mutate(v as AppRole)}
          disabled={updateRole.isPending}
        >
          <SelectTrigger className="h-9 w-[130px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((r) => (
              <SelectItem
                key={r.value}
                value={r.value}
                disabled={isLastOwner && r.value !== "owner"}
              >
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className="rounded-full capitalize">
          {member.role}
        </Badge>
      )}

      {canManage && !isMe && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
              disabled={isLastOwner}
              title={isLastOwner ? "Último owner não pode ser removido" : "Remover"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover membro?</AlertDialogTitle>
              <AlertDialogDescription>
                {member.full_name || member.email} perderá acesso à organização.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => removeMember.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function InviteRow({ invite, onChanged }: { invite: Invite; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${invite.token}`;
  const expired =
    !!invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();

  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invites").delete().eq("id", invite.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Convite revogado.");
      onChanged();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao revogar."),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{invite.email}</span>
          <Badge variant="outline" className="rounded-full text-[10px] capitalize">
            {invite.role}
          </Badge>
          {expired && (
            <Badge variant="destructive" className="rounded-full text-[10px]">
              expirado
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{link}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={copy}
        className="h-9 rounded-xl"
      >
        {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
        Copiar link
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
        onClick={() => revoke.mutate()}
        disabled={revoke.isPending}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
