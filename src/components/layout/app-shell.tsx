import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/hooks/use-theme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <div className="relative flex min-h-svh w-full bg-background text-foreground">
            {/* Ambient gradient glow — sutil, apenas no dark. */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-primary/15 blur-[140px] dark:bg-primary/20" />
              <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-chart-5/10 blur-[120px]" />
            </div>

            <AppSidebar />
            <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
              <Topbar />
              <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
            </SidebarInset>
          </div>
          <Toaster position="top-right" richColors />
        </SidebarProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}