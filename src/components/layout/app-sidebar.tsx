import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  History,
  Users,
  Bell,
  BarChart3,
  Settings,
  UserCog,
  ShieldCheck,
  MessageSquare,
  ScrollText,
  Activity,
  BookOpen,
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
} from "@/components/ui/sidebar";
import type { AppRole } from "@/hooks/use-session";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
};

const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Nova Ausência", url: "/nova-ausencia", icon: FilePlus2, roles: ["super_admin", "rh", "supervisor"] },
  { title: "Ausências", url: "/ausencias", icon: History, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Painel do RH", url: "/painel-rh", icon: ClipboardList, roles: ["super_admin", "rh"] },
  { title: "Histórico", url: "/historico", icon: History, roles: ["super_admin", "rh", "supervisor"] },
  { title: "Colaboradores", url: "/colaboradores", icon: Users, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Importações", url: "/colaboradores_/importacoes", icon: History, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Comunicações", url: "/comunicacoes", icon: MessageSquare, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Alertas", url: "/alertas", icon: Bell, roles: ["super_admin", "rh", "compliance"] },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, roles: ["super_admin", "rh", "compliance"] },
  { title: "Configurações", url: "/configuracoes", icon: Settings, roles: ["super_admin", "rh"] },
  { title: "Auditoria", url: "/auditoria", icon: ScrollText, roles: ["super_admin", "compliance", "rh"] },
  { title: "Usuários", url: "/usuarios", icon: UserCog, roles: ["super_admin"] },
  { title: "Saúde do Sistema", url: "/saude", icon: Activity, roles: ["super_admin"] },
  { title: "Documentação", url: "/documentacao", icon: BookOpen, roles: ["super_admin"] },
];

export function AppSidebar({ roles }: { roles: AppRole[] }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const visible = items.filter((it) => it.roles.some((r) => roles.includes(r)));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-tight">MK9 · CRM</span>
            <span className="text-[11px] text-muted-foreground leading-tight">Faltas & Atestados</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 pb-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          v0.1 · Fundação
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
