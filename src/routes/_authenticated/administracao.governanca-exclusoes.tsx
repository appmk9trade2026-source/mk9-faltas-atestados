import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { 
  ShieldCheck, 
  Trash2, 
  BarChart3, 
  Users, 
  Building2, 
  Clock,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";

export const Route = createFileRoute("/_authenticated/administracao/governanca-exclusoes")({
  head: () => ({ meta: [{ title: "Governança de Exclusões · CRM MK9" }] }),
  component: GovernancaExclusoesPage,
});

function GovernancaExclusoesPage() {
  const { roles } = useSession();
  const permitido = roles.includes("super_admin") || roles.includes("rh") || roles.includes("compliance");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["governanca-exclusoes-stats"],
    enabled: permitido,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const startMonth = startOfMonth(new Date()).toISOString().split('T')[0];

      const { data: records, error } = await supabase
        .from("ausencias")
        .select(`
          id, 
          excluida_em, 
          motivo_exclusao_categoria, 
          empresa:empresas(nome), 
          projeto:projetos(nome),
          excluidora_nome_snapshot,
          created_at
        `)
        .eq("status_documental", "EXCLUIDO");

      if (error) throw error;

      const excluidaHoje = records.filter(r => r.excluida_em?.startsWith(today)).length;
      const excluidaMes = records.filter(r => r.excluida_em && r.excluida_em >= startMonth).length;
      
      const porEmpresa = records.reduce((acc: any, r) => {
        const name = r.empresa?.nome || "Outros";
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});

      const porMotivo = records.reduce((acc: any, r) => {
        const cat = r.motivo_exclusao_categoria || "Não informado";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});

      // Cálculo simplificado de tempo médio (created_at até excluida_em)
      const tempos = records
        .filter(r => r.excluida_em)
        .map(r => (new Date(r.excluida_em!).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60));
      const tempoMedio = tempos.length ? (tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(1) : "0";

      return {
        total: records.length,
        hoje: excluidaHoje,
        mes: excluidaMes,
        porEmpresa: Object.entries(porEmpresa).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5),
        porMotivo: Object.entries(porMotivo).sort((a: any, b: any) => b[1] - a[1]),
        tempoMedio,
        recentes: records.sort((a, b) => new Date(b.excluida_em!).getTime() - new Date(a.excluida_em!).getTime()).slice(0, 5)
      };
    }
  });

  if (!permitido) {
    return (
      <AppShell title="Governança">
        <div className="p-8 text-center text-muted-foreground">Acesso restrito.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Governança de Exclusões" breadcrumb={["Administração", "Governança"]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Painel de Governança Operacional</h2>
          <p className="text-muted-foreground">Monitoramento de integridade e indicadores de exclusões logicas.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exclusões Hoje</CardTitle>
              <Trash2 className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.hoje ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">No Mês Atual</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.mes ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio (h)</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.tempoMedio ?? 0}h</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Histórico</CardTitle>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Motivos mais Frequentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.porMotivo.map(([label, count]: any) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exclusões por Empresa (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.porEmpresa.map(([label, count]: any) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertas de Governança
            </CardTitle>
            <CardDescription>Regras determinísticas baseadas em volume operacional.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(stats?.hoje || 0) > 5 ? (
                <div className="p-3 bg-rose-500/10 border border-rose-200 rounded-md flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span className="text-xs font-medium text-rose-700">Volume atípico de exclusões hoje detectado.</span>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/10 border border-emerald-200 rounded-md flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Volume de exclusões dentro da normalidade operacional.</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
