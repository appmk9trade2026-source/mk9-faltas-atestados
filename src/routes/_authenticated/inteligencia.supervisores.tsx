// Ranking dedicado de Supervisores — tela exclusiva.
// Agrega colaboradores por supervisor_usuario_id a partir da RPC
// calcular_score_colaboradores_lote (SECURITY INVOKER). Não altera cálculos/RLS/RBAC.
import * as React from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, UserCog, Users2, ArrowUpDown, ExternalLink } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";
import { cn } from "@/lib/utils";

type Nivel = "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA";

type ScoreRow = {
  colaborador_id: string;
  nome_completo: string;
  empresa_id: string;
  projeto_id: string;
  supervisor_usuario_id: string | null;
  score: number;
  nivel: Nivel;
  total_ocorrencias: number;
  total_dias_perdidos: number;
};

type SupervisorStats = {
  id: string;
  nome: string;
  colabs: number;
  scoreMedio: number;
  criticos: number;
  altos: number;
  diasPerdidos: number;
  pctCritico: number;
};

type SortKey = "scoreMedio" | "criticos" | "diasPerdidos" | "colabs" | "pctCritico";

export const Route = createFileRoute("/_authenticated/inteligencia/supervisores")({
  head: () => ({
    meta: [
      { title: "Ranking de Supervisores · Inteligência · CRM MK9" },
      {
        name: "description",
        content:
          "Ranking dedicado de supervisores por criticidade da equipe, com drill-down para o dashboard filtrado.",
      },
    ],
  }),
  component: RankingSupervisoresPage,
});

function RankingSupervisoresPage() {
  const scope = useSessionScope();
  const [sortKey, setSortKey] = React.useState<SortKey>("pctCritico");

  const rankingQuery = useQuery({
    queryKey: ["inteligencia", "supervisores", "ranking", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async (): Promise<ScoreRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("calcular_score_colaboradores_lote", {});
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  const supervisoresQuery = useQuery({
    queryKey: ["inteligencia", "supervisores", "profiles", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const supervisorMap = React.useMemo(
    () => new Map((supervisoresQuery.data ?? []).map((p) => [p.id, p.nome])),
    [supervisoresQuery.data],
  );

  const stats = React.useMemo<SupervisorStats[]>(() => {
    const rows = rankingQuery.data ?? [];
    const map = new Map<string, SupervisorStats>();
    for (const r of rows) {
      const id = r.supervisor_usuario_id ?? "__sem__";
      let s = map.get(id);
      if (!s) {
        s = {
          id,
          nome: id === "__sem__" ? "Sem supervisor atribuído" : supervisorMap.get(id) ?? "Supervisor não encontrado",
          colabs: 0,
          scoreMedio: 0,
          criticos: 0,
          altos: 0,
          diasPerdidos: 0,
          pctCritico: 0,
        };
        map.set(id, s);
      }
      s.colabs += 1;
      s.scoreMedio += r.score;
      s.diasPerdidos += r.total_dias_perdidos ?? 0;
      if (r.nivel === "CRITICA") s.criticos += 1;
      if (r.nivel === "ALTA") s.altos += 1;
    }
    const result = Array.from(map.values()).map((s) => ({
      ...s,
      scoreMedio: s.colabs > 0 ? s.scoreMedio / s.colabs : 0,
      pctCritico: s.colabs > 0 ? (s.criticos / s.colabs) * 100 : 0,
    }));
    return result;
  }, [rankingQuery.data, supervisorMap]);

  const sorted = React.useMemo(() => {
    return [...stats].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  }, [stats, sortKey]);

  const totais = React.useMemo(() => {
    return {
      supervisores: stats.length,
      colaboradores: stats.reduce((acc, s) => acc + s.colabs, 0),
      criticos: stats.reduce((acc, s) => acc + s.criticos, 0),
      diasPerdidos: stats.reduce((acc, s) => acc + s.diasPerdidos, 0),
    };
  }, [stats]);

  const loading = rankingQuery.isLoading || supervisoresQuery.isLoading || !scope.ready;

  return (
    <AppShell title="Ranking de Supervisores">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Ranking de Supervisores</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Ranking exclusivo por gestor: total da equipe, score médio, casos críticos/altos, dias perdidos e drill-down para o Dashboard filtrado por supervisor.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/inteligencia/dashboard">Voltar ao Dashboard</Link>
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryTile icon={UserCog} label="Supervisores" value={totais.supervisores} loading={loading} />
          <SummaryTile icon={Users2} label="Colaboradores" value={totais.colaboradores} loading={loading} />
          <SummaryTile icon={Trophy} label="Casos críticos" value={totais.criticos} loading={loading} accent="danger" />
          <SummaryTile icon={Trophy} label="Dias perdidos" value={totais.diasPerdidos} loading={loading} accent="warning" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Ranking completo</CardTitle>
                <CardDescription className="text-xs">
                  Clique na linha para abrir o Dashboard filtrado pelo supervisor.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowUpDown className="h-3 w-3" /> Ordenar por:
                {(["pctCritico", "scoreMedio", "criticos", "diasPerdidos", "colabs"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSortKey(k)}
                    className={cn(
                      "rounded px-1.5 py-0.5 transition-colors",
                      sortKey === k ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                    )}
                  >
                    {SORT_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum supervisor com colaboradores no período.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Supervisor</TableHead>
                    <TableHead className="text-right">Colab.</TableHead>
                    <TableHead className="text-right">Score médio</TableHead>
                    <TableHead className="text-right">Críticos</TableHead>
                    <TableHead className="text-right">Altos</TableHead>
                    <TableHead className="text-right">% Crítico</TableHead>
                    <TableHead className="text-right">Dias perd.</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s, i) => {
                    const isSem = s.id === "__sem__";
                    return (
                      <TableRow key={s.id} className="group">
                        <TableCell className="text-center text-xs font-semibold tabular-nums text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.nome}</span>
                            {isSem && (
                              <Badge variant="outline" className="text-[10px]">
                                sem vínculo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.colabs}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.scoreMedio.toFixed(1)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.criticos > 0 ? (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                              {s.criticos}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.altos > 0 ? (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                              {s.altos}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {s.pctCritico.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.diasPerdidos}</TableCell>
                        <TableCell>
                          <Link
                            to="/inteligencia/dashboard"
                            search={{ supervisor: isSem ? "" : s.id }}
                            aria-label={`Abrir dashboard filtrado por ${s.nome}`}
                            className="inline-flex items-center justify-center rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"

                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

const SORT_LABEL: Record<SortKey, string> = {
  pctCritico: "% Crítico",
  scoreMedio: "Score médio",
  criticos: "Críticos",
  diasPerdidos: "Dias perdidos",
  colabs: "Colaboradores",
};

function SummaryTile({
  icon: Icon,
  label,
  value,
  loading,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  loading: boolean;
  accent?: "primary" | "danger" | "warning";
}) {
  const accents: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    danger: "from-destructive/15 to-destructive/5 text-destructive",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-500",
  };
  return (
    <Card className="relative overflow-hidden border-border/60">
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", accents[accent])}
      />
      <CardContent className="relative p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-background/70 p-1.5 backdrop-blur">
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {loading ? <Skeleton className="h-7 w-16" /> : value.toLocaleString("pt-BR")}
        </div>
      </CardContent>
    </Card>
  );
}
