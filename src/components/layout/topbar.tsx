import { Bell, LogOut, Moon, Search, Sun } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { user, membership, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName =
    membership?.full_name ||
    (user?.email ? user.email.split("@")[0] : "Convidado");
  const roleLabel = membership?.role ? ROLE_LABEL[membership.role] : "—";
  const initials =
    (displayName || "BV")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "BV";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
            >
              <Avatar className="h-8 w-8 border border-border/60">
                <AvatarImage src="" alt="" />
                <AvatarFallback className="bg-linear-to-br from-primary to-primary/60 text-xs font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className="truncate text-sm font-medium text-foreground">
                  {displayName}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {membership?.organization?.name
                    ? `${membership.organization.name} · ${roleLabel}`
                    : roleLabel}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-sm font-medium">{displayName}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user?.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}