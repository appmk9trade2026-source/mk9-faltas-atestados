// Rota-layout do módulo WhatsApp Admin.
//
// NÃO usar `beforeLoad: () => redirect({ to: "/comunicacoes/whatsapp" })` aqui
// nem em nenhuma subrota — isso causa loop infinito de navegação (a rota
// redireciona para si mesma). O gating de sessão é feito pelo layout pai
// `_authenticated`; a autorização por papel é resolvida no componente via
// `canAccessWhatsappAdmin`.
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import {
  WhatsappRouteError,
  WhatsappRouteLoading,
  WhatsappRouteNotFound,
} from "@/components/whatsapp/route-boundaries";
import { canAccessWhatsappAdmin } from "@/lib/whatsapp-admin-access";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Admin · CRM MK9" },
      { name: "description", content: "Painel operacional da mensageria WhatsApp." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WhatsappAdminLayout,
  pendingComponent: () => (
    <AppShell title="WhatsApp Admin" breadcrumb={["Comunicações", "WhatsApp"]}>
      <div className="p-4 md:p-6">
        <WhatsappRouteLoading />
      </div>
    </AppShell>
  ),
  errorComponent: ({ error, reset }) => (
    <AppShell title="WhatsApp Admin" breadcrumb={["Comunicações", "WhatsApp"]}>
      <div className="p-4 md:p-6">
        <WhatsappRouteError
          error={error}
          reset={reset}
          title="Não foi possível carregar o WhatsApp Admin."
        />
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="WhatsApp Admin" breadcrumb={["Comunicações", "WhatsApp"]}>
      <div className="p-4 md:p-6">
        <WhatsappRouteNotFound />
      </div>
    </AppShell>
  ),
});

const TABS: { to: string; label: string }[] = [
  { to: "/comunicacoes/whatsapp", label: "Dashboard" },
  { to: "/comunicacoes/whatsapp/outbox", label: "Outbox" },
  { to: "/comunicacoes/whatsapp/dead-letter", label: "Dead Letter" },
  { to: "/comunicacoes/whatsapp/execucoes", label: "Execuções" },
  { to: "/comunicacoes/whatsapp/tst-destinatarios", label: "TST · Acidente" },
  { to: "/comunicacoes/whatsapp/testes", label: "Testes" },
  { to: "/comunicacoes/whatsapp/health", label: "Health Check" },
  { to: "/comunicacoes/whatsapp/configuracao", label: "Configuração" },
];


function WhatsappAdminLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { loading, roles } = useSession();
  const canAccess = canAccessWhatsappAdmin(roles);

  return (
    <AppShell title="WhatsApp Admin" breadcrumb={["Comunicações", "WhatsApp"]}>
      <div className="border-b bg-background/70 backdrop-blur">
        <nav className="flex gap-1 overflow-x-auto px-4 py-2 md:px-6" aria-label="Seções do WhatsApp Admin">
          {TABS.map((t) => {
            const active =
              t.to === "/comunicacoes/whatsapp"
                ? pathname === t.to
                : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? "page" : undefined}
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
          <WhatsappRouteLoading />
        ) : !canAccess ? (
          <Card className="mx-auto max-w-lg p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Acesso negado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Você não tem permissão para acessar o módulo WhatsApp Admin.
            </p>
            <div className="mt-5">
              <Button variant="outline" asChild>
                <Link to="/comunicacoes" search={{ ausencia: undefined }}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Comunicações
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Outlet />
        )}
      </div>
    </AppShell>
  );
}
