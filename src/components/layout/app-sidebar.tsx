import { Link, useRouter, useRouterState } from "@tanstack/react-router";
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
  HardDrive,
  BookOpen,
  ClipboardCheck,
  Rocket,
  BellRing,
  Map,
  KeyRound,
  Sparkles,
  Gauge,
} from "lucide-react";
import { buildStamp } from "@/lib/app-meta";
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
import { WHATSAPP_ADMIN_ROLES } from "@/lib/whatsapp-admin-access";
import { useAlertasBadge, formatBadge } from "@/hooks/use-alertas-badge";

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
  { title: "Importações", url: "/colaboradores/importacoes", icon: History, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Comunicações", url: "/comunicacoes", icon: MessageSquare, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "WhatsApp Admin", url: "/comunicacoes/whatsapp", icon: MessageSquare, roles: WHATSAPP_ADMIN_ROLES },

  { title: "Alertas", url: "/alertas", icon: Bell, roles: ["super_admin", "rh", "compliance"] },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, roles: ["super_admin", "rh", "compliance"] },
  { title: "Configurações", url: "/configuracoes", icon: Settings, roles: ["super_admin", "rh"] },
  { title: "Auditoria", url: "/auditoria", icon: ScrollText, roles: ["super_admin", "compliance", "rh"] },
  { title: "Usuários", url: "/usuarios", icon: UserCog, roles: ["super_admin", "compliance", "rh"] },
  { title: "Homologação", url: "/homologacao", icon: ClipboardCheck, roles: ["super_admin", "compliance", "rh"] },
  { title: "Saúde do Sistema", url: "/saude", icon: Activity, roles: ["super_admin"] },
  { title: "Operações", url: "/operacoes", icon: HardDrive, roles: ["super_admin", "compliance"] },
  { title: "Documentação", url: "/documentacao", icon: BookOpen, roles: ["super_admin"] },
  { title: "Deploy & Go-Live", url: "/deploy", icon: Rocket, roles: ["super_admin", "compliance"] },
  { title: "Operação Assistida", url: "/operacao-assistida", icon: ClipboardCheck, roles: ["super_admin", "compliance", "rh"] },
  { title: "Notificações", url: "/notificacoes", icon: BellRing, roles: ["super_admin", "compliance", "rh"] },
  { title: "Roadmap", url: "/roadmap", icon: Map, roles: ["super_admin", "compliance"] },
  { title: "Acessos", url: "/acessos", icon: KeyRound, roles: ["super_admin", "compliance"] },
  { title: "BI Executivo", url: "/bi-executivo", icon: Sparkles, roles: ["super_admin", "compliance", "rh"] },
  { title: "Observabilidade", url: "/observabilidade", icon: Gauge, roles: ["super_admin", "compliance"] },
];

function showWhatsappNavigationOverlay() {
  if (document.getElementById("wa-admin-navigation-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "wa-admin-navigation-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483647";
  overlay.style.background = "hsl(var(--background))";
  overlay.style.color = "hsl(var(--foreground))";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";
  overlay.style.padding = "24px";
  overlay.innerHTML = `
    <div style="width:min(720px,100%);display:grid;gap:18px">
      <h1 style="font-size:24px;font-weight:600;margin:0">WhatsApp Admin</h1>
      <div style="height:36px;border-radius:8px;background:hsl(var(--muted))"></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">
        <div style="height:112px;border-radius:8px;background:hsl(var(--muted))"></div>
        <div style="height:112px;border-radius:8px;background:hsl(var(--muted))"></div>
        <div style="height:112px;border-radius:8px;background:hsl(var(--muted))"></div>
        <div style="height:112px;border-radius:8px;background:hsl(var(--muted))"></div>
      </div>
      <div style="height:220px;border-radius:8px;background:hsl(var(--muted))"></div>
    </div>
  `;
  document.body.appendChild(overlay);
}

export function AppSidebar({ roles }: { roles: AppRole[] }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const visible = items.filter((it) => it.roles.some((r) => roles.includes(r)));
  const alertasBadge = useAlertasBadge();
  const badgeCount = (alertasBadge.data?.novos ?? 0) + (alertasBadge.data?.criticos_abertos ?? 0);
  const badgeText = formatBadge(badgeCount);

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
                      {item.url === "/comunicacoes/whatsapp" ? (
                        <a
                          href={item.url}
                          onClick={async (event) => {
                            if (
                              event.defaultPrevented ||
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            ) {
                              return;
                            }
                            event.preventDefault();
                            showWhatsappNavigationOverlay();
                            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                            await router.preloadRoute({ to: "/comunicacoes/whatsapp" });
                            await router.navigate({ to: "/comunicacoes/whatsapp" });
                            document.getElementById("wa-admin-navigation-overlay")?.remove();
                          }}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
                      ) : (
                        <Link to={item.url} preload="intent">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {item.url === "/alertas" && badgeText && (
                            <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] px-1 font-semibold group-data-[collapsible=icon]:hidden">
                              {badgeText}
                            </span>
                          )}
                        </Link>
                      )}
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
          {buildStamp()}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
