import { createFileRoute, Link, Outlet, useRouterState, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Admin · CRM MK9" },
      { name: "description", content: "Painel operacional da mensageria WhatsApp." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/comunicacoes/whatsapp") {
      throw redirect({ to: "/comunicacoes/whatsapp" });
    }
  },
  component: WhatsappAdminLayout,
});

const TABS: { to: string; label: string }[] = [
  { to: "/comunicacoes/whatsapp", label: "Dashboard" },
  { to: "/comunicacoes/whatsapp/outbox", label: "Outbox" },
  { to: "/comunicacoes/whatsapp/dead-letter", label: "Dead Letter" },
  { to: "/comunicacoes/whatsapp/execucoes", label: "Execuções" },
  { to: "/comunicacoes/whatsapp/health", label: "Health Check" },
  { to: "/comunicacoes/whatsapp/configuracao", label: "Configuração" },
];

function WhatsappAdminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { loading, roles } = useSession();
  const canAccess =
    roles.includes("super_admin") || roles.includes("compliance") || roles.includes("rh");

  return (
    <AppShell title="WhatsApp Admin" breadcrumb={["Comunicações", "WhatsApp"]}>
      <div className="border-b bg-background/70 backdrop-blur">
        <nav className="flex gap-1 overflow-x-auto px-4 py-2 md:px-6">
          {TABS.map((t) => {
            const active =
              t.to === "/comunicacoes/whatsapp"
                ? pathname === t.to
                : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 md:p-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !canAccess ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
            Você não tem permissão para acessar o módulo WhatsApp Admin.
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </AppShell>
  );
}
