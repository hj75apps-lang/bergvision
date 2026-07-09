import { Bell, Moon, Search, Sun } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";

export function Topbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/50 bg-background/70 px-4 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/40 sm:px-6">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar players, mídias, playlists…"
          className="h-10 rounded-xl border-border/60 bg-muted/40 pl-9 text-sm placeholder:text-muted-foreground/70 focus-visible:bg-background"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificações"
          className="relative h-10 w-10 rounded-xl text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        </Button>

        <div className="mx-1 hidden h-6 w-px bg-border/60 sm:block" />

        <button
          type="button"
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        >
          <Avatar className="h-8 w-8 border border-border/60">
            <AvatarImage src="" alt="" />
            <AvatarFallback className="bg-linear-to-br from-primary to-primary/60 text-xs font-semibold text-primary-foreground">
              BV
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-sm font-medium text-foreground">
              Berg Admin
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              Owner
            </span>
          </div>
        </button>
      </div>
    </header>
  );
}