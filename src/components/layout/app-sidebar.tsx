import * as React from "react";
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
  Map as MapIcon,
  KeyRound,
  Sparkles,
  Gauge,
  ChevronDown,
  Circle,
  Bot,
  Trophy,
} from "lucide-react";
import { APP_VERSION, APP_ENV, APP_ENV_LABEL } from "@/lib/app-meta";
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
import { cn } from "@/lib/utils";
import type { AppRole } from "@/hooks/use-session";
import { WHATSAPP_ADMIN_ROLES } from "@/lib/whatsapp-admin-access";
import { useAlertasBadge, formatBadge } from "@/hooks/use-alertas-badge";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
};

// NOTE: Este array é parseado por regex em tests/unit/sidebar-permissions.test.tsx.
// Manter o formato `{ title: "...", url: "...", icon: X, roles: [...] }` intacto.
const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Assistente IA", url: "/assistente", icon: Bot, roles: ["super_admin", "rh", "supervisor", "compliance", "operacao", "visualizador"] },
  { title: "Nova Ausência", url: "/nova-ausencia", icon: FilePlus2, roles: ["super_admin", "rh", "supervisor"] },
  { title: "Ausências", url: "/ausencias", icon: History, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Painel do RH", url: "/painel-rh", icon: ClipboardList, roles: ["super_admin", "rh"] },
  { title: "Histórico", url: "/historico", icon: History, roles: ["super_admin", "rh", "supervisor"] },
  { title: "Colaboradores", url: "/colaboradores", icon: Users, roles: ["super_admin", "rh", "supervisor", "compliance"] },
  { title: "Importações", url: "/colaboradores/importacoes", icon: History, roles: ["super_admin", "rh", "compliance"] },
  { title: "Comunicações", url: "/comunicacoes", icon: MessageSquare, roles: ["super_admin", "rh", "compliance"] },
  { title: "WhatsApp Admin", url: "/comunicacoes/whatsapp", icon: MessageSquare, roles: WHATSAPP_ADMIN_ROLES },
  { title: "Alertas", url: "/alertas", icon: Bell, roles: ["super_admin", "rh", "supervisor", "compliance"] },
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
  { title: "Notificações", url: "/notificacoes", icon: BellRing, roles: ["super_admin", "compliance", "rh", "supervisor"] },
  { title: "Roadmap", url: "/roadmap", icon: MapIcon, roles: ["super_admin", "compliance"] },
  { title: "Acessos", url: "/acessos", icon: KeyRound, roles: ["super_admin", "compliance"] },
  { title: "Permissões", url: "/administracao/permissoes", icon: ShieldCheck, roles: ["super_admin"] },
  { title: "BI Executivo", url: "/bi-executivo", icon: Sparkles, roles: ["super_admin", "compliance", "rh"] },
  { title: "Observabilidade", url: "/observabilidade", icon: Gauge, roles: ["super_admin", "compliance"] },
  { title: "Inteligência", url: "/inteligencia", icon: Sparkles, roles: ["super_admin", "compliance", "rh", "supervisor"] },
  { title: "Ranking Supervisores", url: "/inteligencia/supervisores", icon: Trophy, roles: ["super_admin", "compliance", "rh", "supervisor"] },
  { title: "Config. Inteligência", url: "/inteligencia/configuracao", icon: Settings, roles: ["super_admin"] },
];

const itemByUrl = new Map(items.map((i) => [i.url, i]));

type Section = { id: string; label: string | null; urls: string[] };

const SECTIONS: Section[] = [
  { id: "principal", label: null, urls: ["/dashboard", "/assistente"] },
  {
    id: "operacao",
    label: "Operação",
    urls: ["/nova-ausencia", "/ausencias", "/painel-rh", "/colaboradores", "/colaboradores/importacoes"],
  },
  {
    id: "comunicacao",
    label: "Comunicação",
    urls: ["/comunicacoes", "/comunicacoes/whatsapp", "/alertas", "/historico", "/notificacoes"],
  },
  {
    id: "analises",
    label: "Análises",
    urls: ["/relatorios", "/bi-executivo", "/inteligencia", "/inteligencia/supervisores", "/inteligencia/configuracao", "/auditoria"],
  },
  {
    id: "administracao",
    label: "Administração",
    urls: ["/usuarios", "/configuracoes", "/operacoes", "/acessos", "/administracao/permissoes"],
  },
  {
    id: "sistema",
    label: "Sistema",
    urls: [
      "/homologacao",
      "/saude",
      "/observabilidade",
      "/operacao-assistida",
      "/documentacao",
      "/deploy",
      "/roadmap",
    ],
  },
];

const STORAGE_KEY = "mk9.sidebar.groups.v1";

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

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
  const alertasBadge = useAlertasBadge();
  const badgeCount = (alertasBadge.data?.novos ?? 0) + (alertasBadge.data?.criticos_abertos ?? 0);
  const badgeText = formatBadge(badgeCount);
  const { collapsed, toggle } = useCollapsedGroups();

  const canSee = React.useCallback(
    (item: Item) => item.roles.some((r) => roles.includes(r)),
    [roles],
  );

  const renderItem = (item: Item) => {
    const active = pathname === item.url;
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.title}
          className={cn(
            "group/mi relative h-9 gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
            "transition-all duration-200 ease-in-out",
            "hover:bg-sidebar-accent/70 hover:translate-x-[1px]",
            "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
            "data-[active=true]:shadow-[0_1px_0_0_color-mix(in_oklab,var(--sidebar-foreground)_6%,transparent)]",
          )}
        >
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
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200"
                />
              )}
              <Icon className="h-[15px] w-[15px] shrink-0 transition-transform duration-200 group-hover/mi:scale-[1.06]" />
              <span className="truncate">{item.title}</span>
            </a>
          ) : (
            <Link to={item.url} preload="intent">
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200"
                />
              )}
              <Icon className="h-[15px] w-[15px] shrink-0 transition-transform duration-200 group-hover/mi:scale-[1.06]" />
              <span className="truncate">{item.title}</span>
              {item.url === "/alertas" && badgeText && (
                <span
                  className={cn(
                    "ml-auto inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5",
                    "bg-destructive/90 text-destructive-foreground text-[10px] font-semibold leading-none",
                    "shadow-sm ring-1 ring-inset ring-white/10",
                    "animate-in fade-in zoom-in-95 duration-200",
                    "group-data-[collapsible=icon]:hidden",
                  )}
                >
                  {badgeText}
                </span>
              )}
            </Link>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/70">
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
              "shadow-sm ring-1 ring-inset ring-white/10",
            )}
          >
            <ShieldCheck className="h-[18px] w-[18px]" />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold leading-tight tracking-tight">
              MK9 <span className="text-muted-foreground font-normal">·</span> CRM
            </span>
            <span className="truncate text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/80">
              Faltas &amp; Atestados
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-premium px-1.5 py-2">
        {SECTIONS.map((section, idx) => {
          const visibleItems = section.urls
            .map((u) => itemByUrl.get(u))
            .filter((it): it is Item => Boolean(it && canSee(it)));
          if (visibleItems.length === 0) return null;

          const isCollapsed = !!collapsed[section.id];

          return (
            <React.Fragment key={section.id}>
              {idx > 0 && (
                <div
                  aria-hidden
                  className="mx-2 my-1.5 h-px bg-sidebar-border/50 group-data-[collapsible=icon]:hidden"
                />
              )}
              <SidebarGroup className="px-0 py-0.5">
                {section.label && (
                  <SidebarGroupLabel asChild className="px-2 group-data-[collapsible=icon]:hidden">
                    <button
                      type="button"
                      onClick={() => toggle(section.id)}
                      aria-expanded={!isCollapsed}
                      aria-controls={`sidebar-group-${section.id}`}
                      className={cn(
                        "group/lbl flex h-6 w-full items-center justify-between rounded",
                        "text-[10px] font-semibold uppercase tracking-[0.14em]",
                        "text-muted-foreground/60 hover:text-muted-foreground",
                        "transition-colors duration-150",
                      )}
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 opacity-0 transition-all duration-200 ease-in-out group-hover/lbl:opacity-70",
                          isCollapsed && "-rotate-90 opacity-70",
                        )}
                        aria-hidden
                      />
                    </button>
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent
                  id={`sidebar-group-${section.id}`}
                  className={cn(
                    "overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                    "grid",
                    isCollapsed
                      ? "grid-rows-[0fr] opacity-0 group-data-[collapsible=icon]:grid-rows-[1fr] group-data-[collapsible=icon]:opacity-100"
                      : "grid-rows-[1fr] opacity-100",
                  )}
                >
                  <div className="min-h-0">
                    <SidebarMenu className="gap-0.5">
                      {visibleItems.map(renderItem)}
                    </SidebarMenu>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </React.Fragment>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70">
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-2.5 py-2",
            "group-data-[collapsible=icon]:hidden",
          )}
        >
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[11px] font-medium text-foreground/80">
              v{APP_VERSION}
            </span>
            <span className="truncate text-[10px] text-muted-foreground/70">
              {APP_ENV_LABEL}
            </span>
          </div>
          <span
            className="flex items-center gap-1 text-[10px] text-muted-foreground/70"
            title={APP_ENV_LABEL}
          >
            <Circle
              className={cn(
                "h-2 w-2 fill-current",
                (APP_ENV as string) === "production"
                  ? "text-emerald-500"
                  : (APP_ENV as string) === "homologacao"
                    ? "text-amber-500"
                    : "text-sky-500",
              )}
              aria-hidden
            />
          </span>
        </div>
        <div className="hidden justify-center py-2 group-data-[collapsible=icon]:flex">
          <Circle
            className={cn(
              "h-2 w-2 fill-current",
              (APP_ENV as string) === "production"
                ? "text-emerald-500"
                : (APP_ENV as string) === "homologacao"
                  ? "text-amber-500"
                  : "text-sky-500",
            )}
            aria-label={APP_ENV_LABEL}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
