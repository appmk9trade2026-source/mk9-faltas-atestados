// Fase 2 — Seção "Desempenho Positivo" do Dashboard Executivo.
// Componentes NOVOS e independentes: não substituem nem alteram os rankings
// críticos existentes. Consomem exclusivamente a nova RPC agregada
// public.dashboard_desempenho_positivo (SECURITY INVOKER → RLS/RBAC do usuário).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, BookOpen, Building2, Info, ShieldCheck, Trophy, FolderKanban } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const TOOLTIP_POSITIVO =
  "Ranking baseado em indicadores proporcionais. Não utiliza quantidade absoluta de lançamentos.";

export type SupervisorDestaque = {
  chave: string;
  nome: string;
  empresa_nome: string | null;
  projeto_nome: string | null;
  colaboradores: number;
  ocorrencias: number;
  pendencias: number;
  taxa: number;
  pct_prazo: number | null;
  tempo_medio_h: number | null;
  score: number;
};
export type EmpresaDestaque = {
  id: string;
  nome: string;
  colaboradores: number;
  ocorrencias: number;
  pendencias: number;
  taxa: number;
  score: number;
};
export type ProjetoDestaque = EmpresaDestaque & { empresa_nome: string | null };
export type ConformidadeColaboradores = {
  total_ativos: number;
  conformes: number;
  com_ocorrencia: number;
  ranking_disponivel: boolean;
};
export type DesempenhoPositivo = {
  periodo: { inicio: string; fim: string };
  min_colaboradores: number;
  supervisores: SupervisorDestaque[];
  empresas: EmpresaDestaque[];
  projetos: ProjetoDestaque[];
  colaboradores: ConformidadeColaboradores;
};

export function useDesempenhoPositivo(params: {
  inicio: string;
  fim: string;
  empresaId?: string;
  projetoId?: string;
  minColaboradores?: number;
}) {
  const scope = useSessionScope();
  const { inicio, fim, empresaId, projetoId, minColaboradores = 5 } = params;
  return useQuery({
    queryKey: [
      "dashboard-desempenho-positivo",
      ...scope.keyParts,
      inicio,
      fim,
      empresaId ?? "",
      projetoId ?? "",
      minColaboradores,
    ],
    enabled: scope.ready,
    staleTime: 60_000,
    queryFn: async (): Promise<DesempenhoPositivo> => {
      const { data, error } = await supabase.rpc("dashboard_desempenho_positivo", {
        _inicio: inicio,
        _fim: fim,
        _empresa_id: empresaId || undefined,
        _projeto_id: projetoId || undefined,

        _min_colaboradores: minColaboradores,
      });
      if (error) throw error;
      return data as unknown as DesempenhoPositivo;
    },
  });
}

function InfoHint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Como este ranking é calculado" className="text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-snug">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PositiveCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-emerald-500/25">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm text-emerald-700 dark:text-emerald-400">{title}</CardTitle>
              <InfoHint text={`${description} ${TOOLTIP_POSITIVO}`} />
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 tabular-nums",
        score >= 75
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
      )}
    >
      {score.toFixed(1)}
    </Badge>
  );
}

function Position({ i }: { i: number }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums",
        i === 0
          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
          : i === 1
            ? "bg-sky-500/20 text-sky-700 dark:text-sky-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      {i + 1}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

const nf1 = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1).replace(".", ","));

export function DesempenhoPositivoSection(props: {
  inicio: string;
  fim: string;
  empresaId?: string;
  projetoId?: string;
  minColaboradores?: number;
}) {
  const q = useDesempenhoPositivo(props);
  const d = q.data;
  const minColabs = d?.min_colaboradores ?? props.minColaboradores ?? 5;

  const supervisores = React.useMemo(() => d?.supervisores ?? [], [d]);
  const empresas = React.useMemo(() => d?.empresas ?? [], [d]);
  const projetos = React.useMemo(() => d?.projetos ?? [], [d]);
  const conformidade = d?.colaboradores;

  const baseDesc = `Considera apenas grupos com ${minColabs}+ colaboradores ativos.`;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
          <Award className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Desempenho positivo</h3>
          <p className="text-[11px] text-muted-foreground">{TOOLTIP_POSITIVO}</p>
        </div>
      </div>

      {q.error ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Não foi possível carregar os indicadores de desempenho positivo.
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 1) Supervisores destaque */}
        <PositiveCard
          title="Supervisores destaque"
          description={`Score proporcional: 50% menor taxa de ausência, 20% menos pendências, 20% lançamentos no prazo (24h), 10% menor tempo médio. ${baseDesc}`}
          icon={Trophy}
        >
          {q.isLoading ? (
            <ListSkeleton />
          ) : supervisores.length === 0 ? (
            <Empty text={`Nenhum supervisor com ${minColabs}+ colaboradores ativos no escopo.`} />
          ) : (
            <ol className="space-y-1">
              {supervisores.map((s, i) => (
                <li key={s.chave} className="flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                  <Position i={i} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium leading-tight">{s.nome}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground">
                      {[s.empresa_nome, s.projeto_nome].filter(Boolean).join(" · ") || "Sem empresa/projeto"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground tabular-nums">
                      <span>{s.colaboradores} colab.</span>
                      <span>taxa {nf1(s.taxa)}%</span>
                      <span>{s.pendencias} pend.</span>
                      <span>no prazo {s.pct_prazo == null ? "—" : `${nf1(s.pct_prazo)}%`}</span>
                      <span>tempo {s.tempo_medio_h == null ? "—" : `${nf1(s.tempo_medio_h)}h`}</span>
                    </div>
                  </div>
                  <ScoreBadge score={s.score} />
                </li>
              ))}
            </ol>
          )}
        </PositiveCard>

        {/* 2) Empresas destaque */}
        <PositiveCard
          title="Empresas destaque"
          description={`Taxa de ausência = ocorrências ÷ colaboradores ativos. Score: 70% taxa, 30% pendências. ${baseDesc}`}
          icon={Building2}
        >
          {q.isLoading ? (
            <ListSkeleton />
          ) : empresas.length === 0 ? (
            <Empty text={`Nenhuma empresa com ${minColabs}+ colaboradores ativos no escopo.`} />
          ) : (
            <ol className="space-y-1">
              {empresas.map((e, i) => (
                <li key={e.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                  <Position i={i} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium leading-tight">{e.nome}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground tabular-nums">
                      {e.colaboradores} colab. · {e.ocorrencias} ocorr. · taxa {nf1(e.taxa)}%
                    </div>
                  </div>
                  <ScoreBadge score={e.score} />
                </li>
              ))}
            </ol>
          )}
        </PositiveCard>

        {/* 3) Projetos destaque */}
        <PositiveCard
          title="Projetos destaque"
          description={`Taxa de ausência = ocorrências ÷ colaboradores ativos. Score: 70% taxa, 30% pendências. ${baseDesc}`}
          icon={FolderKanban}
        >
          {q.isLoading ? (
            <ListSkeleton />
          ) : projetos.length === 0 ? (
            <Empty text={`Nenhum projeto com ${minColabs}+ colaboradores ativos no escopo.`} />
          ) : (
            <ol className="space-y-1">
              {projetos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50">
                  <Position i={i} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium leading-tight">{p.nome}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground tabular-nums">
                      {p.empresa_nome ? `${p.empresa_nome} · ` : ""}
                      {p.colaboradores} colab. · {p.ocorrencias} ocorr. · taxa {nf1(p.taxa)}%
                    </div>
                  </div>
                  <ScoreBadge score={p.score} />
                </li>
              ))}
            </ol>
          )}
        </PositiveCard>

        {/* 4) Conformidade da operação — indicador agregado */}
        <PositiveCard
          title="Conformidade da operação"
          description="Conformidade no período: colaboradores ativos sem nenhuma ausência e sem pendências."
          icon={ShieldCheck}
        >
          {q.isLoading ? (
            <ListSkeleton />
          ) : !conformidade || conformidade.total_ativos === 0 ? (
            <Empty text="Não há dados suficientes para calcular o índice de conformidade para o período selecionado." />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {conformidade.conformes}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Em conformidade</div>
                </div>
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{conformidade.total_ativos}</div>
                  <div className="text-[10px] text-muted-foreground">Ativos no escopo</div>
                </div>
                <div className="rounded-md border border-sky-500/25 bg-sky-500/5 p-2 text-center">
                  <div className="text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                    {((conformidade.conformes / conformidade.total_ativos) * 100).toFixed(1).replace(".", ",")}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">Índice de conformidade</div>
                </div>
              </div>
              <div
                className="rounded-md border border-border bg-muted/30 p-3"
                role="note"
                aria-label="Como interpretar este indicador"
              >
                <div className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-medium leading-tight">Como interpretar este indicador</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      Este painel apresenta o nível geral de conformidade da operação no período
                      selecionado. O reconhecimento individual de colaboradores será disponibilizado
                      apenas quando houver histórico suficiente para avaliações consistentes e justas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </PositiveCard>

      </div>
    </section>
  );
}
