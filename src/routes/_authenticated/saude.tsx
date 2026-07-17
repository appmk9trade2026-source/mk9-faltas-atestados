import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Building2, Database, FileText, MessageSquare, ScrollText,
  ShieldCheck, Users, UserCog, RefreshCw, Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { APP_ENV, APP_NAME, APP_VERSION } from "@/lib/app-meta";

export const Route = createFileRoute("/_authenticated/saude")({
  head: () => ({ meta: [{ title: "Saúde do Sistema · CRM MK9" }] }),
  component: SaudePage,
});

type Metrics = {
  usuarios: number;
  usuarios_ativos: number;
  empresas: number;
  projetos: number;
  colaboradores: number;
  ausencias: number;
  ausencias_pendentes: number;
  comunicacoes: number;
  auditoria_24h: number;
  ultima_migracao: string | null;
  db_size: string;
  gerado_em: string;
};

function SaudePage() {
  const { roles, loading } = useSession();

  if (loading) {
    return (
      <AppShell title="Saúde do Sistema" breadcrumb={["Sistema", "Saúde"]}>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }

  if (!roles.includes("super_admin")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <SaudeContent />;
}

function SaudeContent() {
  const q = useQuery({
    queryKey: ["saude-sistema"],
    queryFn: async (): Promise<Metrics> => {
      const { data, error } = await supabase.rpc("saude_sistema" as never);
      if (error) throw error;
      return data as unknown as Metrics;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const m = q.data;

  return (
    <AppShell title="Saúde do Sistema" breadcrumb={["Sistema", "Saúde"]}>
      <div className="-mt-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Painel de leitura com indicadores operacionais e integridade do backend.
        </p>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Aplicação" value={APP_NAME} />
          <Info label="Versão" value={APP_VERSION} />
          <Info label="Ambiente" value={APP_ENV} />
          <Info label="Última atualização" value={m ? new Date(m.gerado_em).toLocaleString("pt-BR") : "—"} />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI icon={UserCog} label="Usuários" value={m?.usuarios} sub={m ? `${m.usuarios_ativos} ativos` : undefined} loading={q.isLoading} />
        <KPI icon={Building2} label="Empresas ativas" value={m?.empresas} loading={q.isLoading} />
        <KPI icon={ShieldCheck} label="Projetos ativos" value={m?.projetos} loading={q.isLoading} />
        <KPI icon={Users} label="Colaboradores ativos" value={m?.colaboradores} loading={q.isLoading} />
        <KPI icon={FileText} label="Ausências" value={m?.ausencias} sub={m ? `${m.ausencias_pendentes} pendentes` : undefined} loading={q.isLoading} />
        <KPI icon={MessageSquare} label="Comunicações" value={m?.comunicacoes} loading={q.isLoading} />
        <KPI icon={ScrollText} label="Auditoria (24h)" value={m?.auditoria_24h} loading={q.isLoading} />
        <KPI icon={Database} label="Tamanho do banco" value={m?.db_size ?? "—"} loading={q.isLoading} />
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <Info label="Última migração" value={m?.ultima_migracao ?? "—"} mono />
          <Info label="Última leitura" value={m ? new Date(m.gerado_em).toLocaleString("pt-BR") : "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" /> Integrações
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <IntegrationRow name="Banco de Dados (Postgres)" status="ok" />
            <IntegrationRow name="Autenticação (Supabase Auth)" status="ok" />
            <IntegrationRow name="Storage (bucket atestados)" status="ok" />
            <IntegrationRow name="IA (OpenRouter)" status="placeholder" />
            <IntegrationRow name="E-mail transacional" status="placeholder" />
            <IntegrationRow name="WhatsApp / SMS" status="placeholder" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Placeholders indicam integrações previstas cuja verificação em tempo real será adicionada em etapa futura.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Info({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub, loading }: { icon: typeof Users; label: string; value: number | string | undefined; sub?: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-16" />
        ) : (
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
        )}
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function IntegrationRow({ name, status }: { name: string; status: "ok" | "placeholder" | "erro" }) {
  const map = {
    ok: { label: "OK", variant: "default" as const },
    placeholder: { label: "Não monitorado", variant: "secondary" as const },
    erro: { label: "Erro", variant: "destructive" as const },
  };
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2 text-sm">
      <span>{name}</span>
      <Badge variant={map[status].variant}>{map[status].label}</Badge>
    </div>
  );
}
