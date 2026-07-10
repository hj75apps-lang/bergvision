import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/brand/logo";
import {
  LayoutDashboard,
  MonitorPlay,
  Library,
  LayoutTemplate,
  ListMusic,
  Users,
  Settings,
  Wand2,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
};

const mainItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Players", url: "/players", icon: MonitorPlay },
  { title: "Biblioteca", url: "/biblioteca", icon: Library },
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Studio", url: "/studio", icon: Wand2 },
  { title: "Playlists", url: "/playlists", icon: ListMusic },
];

const secondaryItems: NavItem[] = [
  { title: "Equipe", url: "/equipe", icon: Users },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/60 bg-sidebar/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-sidebar/50"
    >
      <SidebarHeader className="px-2 pt-2 pb-1">
        <Link to="/" className="flex items-center justify-start">
          {collapsed ? (
            <Logo className="h-12 w-12" alt="Berg Vision" />
          ) : (
            <Logo
              className="ml-3 h-28 w-auto max-w-none object-contain object-left"
              alt="Berg Vision"
            />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/50">
              Operação
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive(item.url)}
                    className="h-10 rounded-xl data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-sm"
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="h-4.5 w-4.5 shrink-0" />
                      {!collapsed && (
                        <span className="truncate text-sm">{item.title}</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-2">
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/50">
              Conta
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive(item.url)}
                    className="h-10 rounded-xl data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="h-4.5 w-4.5 shrink-0" />
                      {!collapsed && (
                        <span className="truncate text-sm">{item.title}</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="px-3 pb-4">
          <div className="rounded-2xl border border-sidebar-border/60 bg-sidebar-accent/40 p-3">
            <div className="flex items-center gap-2">
              <Badge className="rounded-full bg-primary/20 text-primary hover:bg-primary/20">
                Beta
              </Badge>
              <span className="text-xs font-medium text-sidebar-foreground/80">
                Fase 1 · Fundação
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-sidebar-foreground/60">
              Shell visual pronto. Dados reais entram nas próximas fases.
            </p>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}