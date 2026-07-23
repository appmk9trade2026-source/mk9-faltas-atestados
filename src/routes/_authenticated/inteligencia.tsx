// Inteligência Analítica — módulo dedicado a explicar o modelo de score,
// composição de fatores e alertas preditivos. Não repete o Dashboard.
// Reutiliza a RPC calcular_score_colaboradores_lote (SECURITY INVOKER).
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Brain, ScaleIcon, BellRing, Settings, ExternalLink, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Cell,
} from "recharts";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";

type Nivel = "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA";

type Breakdown = {
  faltas?: number;
  atestados?: number;
  declaracoes?: number;
  suspensoes?: number;
  acidente_trabalho?: number;
  acidente_trajeto?: number;
  outros?: number;
  dias_perdidos?: number;
  reincidencia_bonus?: number;
  janela_dias?: number;
};

type ScoreRow = {
  colaborador_id: string;
  nome_completo: string;
  matricula: string | null;
  empresa_id: string;
  projeto_id: string;
  score: number;
  nivel: Nivel;
  breakdown: Breakdown | null;
};

type Config = {
  janela_dias: number;
  limiar_atencao: number;
  limiar_alta: number;
  limiar_critica: number;
} & Record<string, unknown>;

const NIVEL_COLOR: Record<Nivel, string> = {
  BAIXA: "#10b981",
  ATENCAO: "#f59e0b",
  ALTA: "#f97316",
  CRITICA: "#ef4444",
};

const FATORES: Array<{ key: keyof Breakdown; label: string; hint: string }> = [
  { key: "faltas", label: "Faltas", hint: "Ausências não justificadas" },
  { key: "atestados", label: "Atestados", hint: "Médicos com CID" },
  { key: "declaracoes", label: "Declarações", hint: "Comparecimento / acompanhamento" },
  { key: "suspensoes", label: "Suspensões", hint: "Disciplinares" },
  { key: "acidente_trabalho", label: "Acid. Trabalho", hint: "Registrados como CAT" },
  { key: "acidente_trajeto", label: "Acid. Trajeto", hint: "Deslocamento casa-trabalho" },
  { key: "outros", label: "Outros", hint: "Demais tipos" },
];

export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({
    meta: [
      { title: "Inteligência Analítica · CRM MK9" },
      {
        name: "description",
        content:
          "Módulo analítico do CRM MK9: score de risco, fatores, explicação do cálculo e alertas preditivos.",
      },
    ],
  }),
  component: InteligenciaAnaliticaPage,
});

function InteligenciaAnaliticaPage() {
  const { roles } = useSession();
  const scope = useSessionScope();
  const isSuperAdmin = roles.includes("super_admin");

  const cfgQuery = useQuery({
    queryKey: ["inteligencia", "analitica", "config"],
    enabled: scope.ready,
    queryFn: async (): Promise<Config> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("absenteismo_config")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração não encontrada");
      return data as Config;
    },
    staleTime: 5 * 60_000,
  });

  const rankingQuery = useQuery({
    queryKey: ["inteligencia", "analitica", "ranking", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async (): Promise<ScoreRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("calcular_score_colaboradores_lote", {});
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  const loading = cfgQuery.isLoading || rankingQuery.isLoading || !scope.ready;
  const cfg = cfgQuery.data;
  const rows = rankingQuery.data ?? [];

  // Distribuição por nível
  const distribuicao = React.useMemo(() => {
    const acc: Record<Nivel, number> = { BAIXA: 0, ATENCAO: 0, ALTA: 0, CRITICA: 0 };
    for (const r of rows) acc[r.nivel] = (acc[r.nivel] ?? 0) + 1;
    const total = rows.length || 1;
    return (Object.keys(acc) as Nivel[]).map((n) => ({
      nivel: n,
      qtd: acc[n],
      pct: (acc[n] / total) * 100,
      color: NIVEL_COLOR[n],
    }));
  }, [rows]);

  // Fatores agregados (soma de contribuições por fator)
  const fatoresAgregados = React.useMemo(() => {
    const totals: Record<string, number> = {};
    let denom = 0;
    for (const r of rows) {
      const b = r.breakdown ?? {};
      for (const f of FATORES) {
        totals[f.key as string] = (totals[f.key as string] ?? 0) + (Number(b[f.key]) || 0);
      }
      denom += 1;
    }
    const totalPontos = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return FATORES.map((f) => {
      const soma = totals[f.key as string] ?? 0;
      return {
        key: f.key as string,
        label: f.label,
        hint: f.hint,
        soma,
        media: denom > 0 ? soma / denom : 0,
        pct: (soma / totalPontos) * 100,
      };
    });
  }, [rows]);

  // Colaboradores em nível alto/crítico (candidatos a alerta preditivo)
  const preditivos = React.useMemo(() => {
    return rows
      .filter((r) => r.nivel === "ALTA" || r.nivel === "CRITICA")
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [rows]);

  const totalCriticos = distribuicao.find((d) => d.nivel === "CRITICA")?.qtd ?? 0;
  const totalAltos = distribuicao.find((d) => d.nivel === "ALTA")?.qtd ?? 0;

  return (
    <AppShell title="Inteligência Analítica" description="Score de risco, fatores e alertas preditivos">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Brain className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Inteligência Analítica</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Entenda como o modelo classifica risco: composição do score, fatores agregados, explicação do cálculo e sinais preditivos. Para KPIs e rankings, use o Dashboard Executivo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/inteligencia/dashboard">
                <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/inteligencia/alertas">
                <BellRing className="mr-1.5 h-3.5 w-3.5" /> Alertas
              </Link>
            </Button>
            {isSuperAdmin && (
              <Button asChild variant="outline" size="sm">
                <Link to="/inteligencia/configuracao">
                  <Settings className="mr-1.5 h-3.5 w-3.5" /> Configuração
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Score de Risco — Como funciona */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                <ScaleIcon className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Score de Risco — como o modelo calcula</CardTitle>
                <CardDescription className="text-xs">
                  Modelo determinístico auditável. Recalculado no servidor a cada consulta.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              O <strong className="text-foreground">score de risco</strong> de cada colaborador é a soma ponderada
              das ocorrências dos últimos <strong className="text-foreground">{cfg?.janela_dias ?? "…"} dias</strong>,
              considerando o tipo do evento, os dias perdidos e um bônus por reincidência. O resultado é comparado
              aos limiares vigentes para classificar o nível.
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <ThresholdTile label="Janela" value={cfg ? `${cfg.janela_dias} dias` : "…"} tone="info" loading={loading} />
              <ThresholdTile label="Atenção ≥" value={cfg ? cfg.limiar_atencao.toString() : "…"} tone="warning" loading={loading} />
              <ThresholdTile label="Alta ≥" value={cfg ? cfg.limiar_alta.toString() : "…"} tone="orange" loading={loading} />
              <ThresholdTile label="Crítica ≥" value={cfg ? cfg.limiar_critica.toString() : "…"} tone="danger" loading={loading} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Fórmula oficial: <code className="rounded bg-muted px-1.5 py-0.5">score = Σ (peso_tipo × ocorrências) + (peso_dia × dias_perdidos) + bônus_reincidência</code>.
              {isSuperAdmin && (
                <>
                  {" "}Pesos individuais são geridos em{" "}
                  <Link to="/inteligencia/configuracao" className="text-primary hover:underline">
                    Config. Inteligência
                  </Link>.
                </>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Distribuição + Fatores */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Distribuição por nível</CardTitle>
              <CardDescription className="text-xs">
                Como sua base se distribui entre as classes de risco.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : rows.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Sem colaboradores no escopo.</div>
              ) : (
                <div className="space-y-2">
                  {distribuicao.map((d) => (
                    <div key={d.nivel} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{d.nivel}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {d.qtd} · {d.pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${d.pct}%`, background: d.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fatores que compõem o score</CardTitle>
              <CardDescription className="text-xs">
                Peso agregado de cada fator na base atual (contribuição relativa).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-56 w-full" />
              ) : fatoresAgregados.every((f) => f.soma === 0) ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Sem contribuição registrada.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fatoresAgregados} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} width={110} />
                      <ReTooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: number, _n, item: any) => [`${v.toFixed(1)} pts · ${item?.payload?.pct?.toFixed(1)}%`, "Contribuição"]}
                      />
                      <Bar dataKey="soma" radius={[0, 4, 4, 0]}>
                        {fatoresAgregados.map((f, i) => (
                          <Cell key={i} fill="hsl(var(--primary))" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alertas Preditivos */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-destructive/10 p-1.5 text-destructive">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Alertas preditivos</CardTitle>
                  <CardDescription className="text-xs">
                    Colaboradores em nível ALTA ou CRÍTICA — priorize intervenção.
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  {totalCriticos} críticos
                </Badge>
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                  {totalAltos} altos
                </Badge>
                <Button asChild variant="outline" size="sm">
                  <Link to="/inteligencia/alertas">
                    Ver central de alertas <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : preditivos.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum colaborador em nível ALTA ou CRÍTICA no escopo.
              </div>
            ) : (
              <ul className="space-y-1">
                {preditivos.map((r) => (
                  <li key={r.colaborador_id}>
                    <Link
                      to="/inteligencia/colaboradores/$colaboradorId"
                      params={{ colaboradorId: r.colaborador_id }}
                      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      <Badge
                        variant="outline"
                        className={
                          r.nivel === "CRITICA"
                            ? "bg-destructive/10 text-destructive border-destructive/40"
                            : "bg-orange-500/10 text-orange-600 border-orange-500/30"
                        }
                      >
                        {r.nivel}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.nome_completo}</div>
                        {r.matricula && (
                          <div className="truncate text-[11px] text-muted-foreground">Matrícula {r.matricula}</div>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{r.score.toFixed(1)}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ThresholdTile({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone: "info" | "warning" | "orange" | "danger";
  loading: boolean;
}) {
  const tones: Record<string, string> = {
    info: "bg-sky-500/10 text-sky-600 border-sky-500/30",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    orange: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    danger: "bg-destructive/10 text-destructive border-destructive/40",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[10.5px] font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {loading ? <Skeleton className="h-6 w-16" /> : value}
      </div>
    </div>
  );
}
