import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles, Settings, Trophy, AlertTriangle, TrendingUp, Users2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { SupervisorEmptyState } from "@/components/supervisor-empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({
    meta: [
      { title: "Inteligência de Absenteísmo · CRM MK9" },
      { name: "description", content: "Score de criticidade, ranking de colaboradores e supervisores." },
    ],
  }),
  component: InteligenciaPage,
});

type ScoreRow = {
  colaborador_id: string;
  nome_completo: string;
  matricula: string;
  empresa_id: string;
  projeto_id: string;
  supervisor_usuario_id: string | null;
  score: number;
  nivel: "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA";
  total_ocorrencias: number;
  total_dias_perdidos: number;
  ultima_ocorrencia: string | null;
  breakdown: Record<string, number>;
};

const NIVEL_META: Record<ScoreRow["nivel"], { label: string; className: string }> = {
  BAIXA: { label: "Baixa", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  ATENCAO: { label: "Atenção", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  ALTA: { label: "Alta", className: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  CRITICA: { label: "Crítica", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

function InteligenciaPage() {
  const { loading, roles } = useSession();
  const scope = useSessionScope();
  const isSuperAdmin = roles.includes("super_admin");
  const [busca, setBusca] = useState("");

  const query = useQuery({
    queryKey: ["inteligencia", "scores", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async (): Promise<ScoreRow[]> => {
      const { data, error } = await supabase.rpc("calcular_score_colaboradores_lote", {
        _empresa_id: undefined,
        _projeto_id: undefined,
        _janela_dias: undefined,
      });
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  const rows = query.data ?? [];
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            r.nome_completo.toLowerCase().includes(q) ||
            r.matricula.toLowerCase().includes(q),
        )
      : rows;
    return [...list].sort((a, b) => b.score - a.score);
  }, [rows, busca]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const criticos = rows.filter((r) => r.nivel === "CRITICA").length;
    const altos = rows.filter((r) => r.nivel === "ALTA").length;
    const diasPerdidos = rows.reduce((acc, r) => acc + (r.total_dias_perdidos ?? 0), 0);
    return { total, criticos, altos, diasPerdidos };
  }, [rows]);

  if (loading) {
    return (
      <AppShell title="Inteligência">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Inteligência de Absenteísmo">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Inteligência de Absenteísmo</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Score de criticidade calculado a partir dos pesos configurados. Utilize esta visão para
              priorizar colaboradores em situação de risco.
            </p>
          </div>
          {isSuperAdmin && (
            <Button variant="outline" asChild>
              <Link to="/inteligencia/configuracao">
                <Settings className="h-4 w-4 mr-2" />
                Configurar pesos
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Users2} label="Colaboradores analisados" value={kpis.total} />
          <KpiCard icon={AlertTriangle} label="Casos críticos" value={kpis.criticos} tone="critical" />
          <KpiCard icon={TrendingUp} label="Casos altos" value={kpis.altos} tone="warn" />
          <KpiCard icon={Trophy} label="Dias perdidos (janela)" value={kpis.diasPerdidos} />
        </div>

        {scope.isSupervisorOnly && rows.length === 0 && !query.isLoading ? (
          <SupervisorEmptyState />
        ) : (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">Ranking de colaboradores</CardTitle>
                <CardDescription>Ordenado do maior para o menor score.</CardDescription>
              </div>
              <Input
                placeholder="Buscar por nome ou matrícula…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full sm:w-72"
              />
            </CardHeader>
            <CardContent>
              {query.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtradas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum colaborador encontrado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3 w-12">#</th>
                        <th className="py-2 pr-3">Colaborador</th>
                        <th className="py-2 pr-3">Matrícula</th>
                        <th className="py-2 pr-3 text-right">Ocorrências</th>
                        <th className="py-2 pr-3 text-right">Dias</th>
                        <th className="py-2 pr-3 text-right">Score</th>
                        <th className="py-2 pr-3">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map((r, idx) => {
                        const meta = NIVEL_META[r.nivel];
                        return (
                          <tr key={r.colaborador_id} className="border-b hover:bg-muted/40">
                            <td className="py-2 pr-3 text-muted-foreground">{idx + 1}</td>
                            <td className="py-2 pr-3 font-medium">{r.nome_completo}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{r.matricula}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{r.total_ocorrencias}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{r.total_dias_perdidos}</td>
                            <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                              {Number(r.score).toFixed(1)}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge variant="outline" className={cn("border", meta.className)}>
                                {meta.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "critical" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                tone === "critical" && "text-destructive",
                tone === "warn" && "text-orange-600",
              )}
            >
              {value}
            </p>
          </div>
          <Icon
            className={cn(
              "h-5 w-5 text-muted-foreground",
              tone === "critical" && "text-destructive",
              tone === "warn" && "text-orange-600",
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
