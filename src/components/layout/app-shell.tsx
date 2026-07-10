import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";
import { SplashIntro } from "@/components/splash/splash-intro";

const PUBLIC_PREFIXES = ["/auth", "/reset-password", "/invite"];
const SPLASH_FLAG = "bv:splash-seen";

function AmbientGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-primary/15 blur-[140px] dark:bg-primary/20" />
      <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-chart-5/10 blur-[120px]" />
    </div>
  );
}

function FullscreenLoader() {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center bg-background text-foreground">
      <AmbientGlow />
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const [showSplash, setShowSplash] = useState(false);
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, isPublic, navigate]);

  // Detecta transições de sessão: login mostra o splash 1× por sessão;
  // logout limpa o flag para o próximo login voltar a exibir.
  useEffect(() => {
    if (loading) return;
    const currentId = user?.id ?? null;
    const prevId = prevUserId.current;
    if (currentId && currentId !== prevId) {
      if (typeof window !== "undefined") {
        const seen = window.sessionStorage.getItem(SPLASH_FLAG);
        if (!seen) {
          window.sessionStorage.setItem(SPLASH_FLAG, "1");
          setShowSplash(true);
        }
      }
    } else if (!currentId && prevId) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(SPLASH_FLAG);
      }
      setShowSplash(false);
    }
    prevUserId.current = currentId;
  }, [loading, user]);

  if (loading) return <FullscreenLoader />;

  if (isPublic) {
    return (
      <div className="relative min-h-svh w-full bg-background text-foreground">
        <AmbientGlow />
        {children}
      </div>
    );
  }

  if (!user) return <FullscreenLoader />;

  return (
    <>
      <SidebarProvider>
        <div className="relative flex min-h-svh w-full bg-background text-foreground">
          <AmbientGlow />
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
            <Topbar />
            <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          </SidebarInset>
        </div>
      </SidebarProvider>
      {showSplash && <SplashIntro onDone={() => setShowSplash(false)} />}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}