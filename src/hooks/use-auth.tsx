import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "admin" | "editor" | "viewer";

export type Membership = {
  id: string;
  organization_id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  membership: Membership | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadMembership(userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, organization_id, role, full_name, email, organization:organizations(id, name, slug)",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[auth] loadMembership error", error.message);
    return null;
  }
  if (!data) return null;
  const org = Array.isArray((data as any).organization)
    ? (data as any).organization[0]
    : (data as any).organization;
  return { ...(data as any), organization: org ?? null } as Membership;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) {
      setMembership(await loadMembership(data.session.user.id));
    } else {
      setMembership(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        // Defer to avoid deadlock inside the callback.
        setTimeout(() => {
          loadMembership(s.user.id).then((m) => {
            if (mounted) setMembership(m);
          });
        }, 0);
      } else {
        setMembership(null);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        setMembership(await loadMembership(data.session.user.id));
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMembership(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      membership,
      refresh,
      signOut,
    }),
    [loading, session, membership, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40) || "org";
}