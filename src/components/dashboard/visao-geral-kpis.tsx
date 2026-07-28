import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Clock, Info, Percent, Users, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export type VisaoGeralKpis = {
  total: number;
  pendentes: number;
  lancadas: number;
  tempo_medio_lanc_h: number;
  colaboradores_ativos: number;
};

export type VisaoGeralSeries = {
  /** série diária já carregada por `dashboard_metrics` */
  porDia?: Array<{ dia: string; total: number; pendentes: number; lancadas: number }>;
  tempoDiario?: Array<{ dia: string; horas: number }>;
};

type Item = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: number;
  prev?: number | null;
  format: (v: number) => string;
  /** true quando um aumento é ruim (ausências, pendências, tempo) */
  inverse?: boolean;
  hint: string;
  descricao: string;
  spark?: number[];
};

function pctDelta(curr: number, prev: number) {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

const int = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));
const dec1 = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);


/**
 * BLOCO 1 — Visão geral da operação.
 * Reutiliza exclusivamente os KPIs já retornados por `dashboard_metrics`.
 * A taxa de ausência é derivada dos mesmos números exibidos (ausências ÷ colaboradores ativos).
 */
export function VisaoGeralKpisGrid({
  kpis,
  prev,
  loading,
  series,
}: {
  kpis?: VisaoGeralKpis;
  prev?: VisaoGeralKpis;
  loading: boolean;
  series?: VisaoGeralSeries;
}) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  const taxa = kpis.colaboradores_ativos > 0 ? (kpis.total / kpis.colaboradores_ativos) * 100 : null;
  const taxaPrev =
    prev && prev.colaboradores_ativos > 0 ? (prev.total / prev.colaboradores_ativos) * 100 : null;

  const porDia = series?.porDia ?? [];
  const sparkTotal = porDia.map((p) => p.total);
  const sparkPend = porDia.map((p) => p.pendentes);
  const sparkLanc = porDia.map((p) => p.lancadas);
  const sparkTempo = (series?.tempoDiario ?? []).map((p) => p.horas);
  const sparkTaxa =
    kpis.colaboradores_ativos > 0 ? sparkTotal.map((v) => (v / kpis.colaboradores_ativos) * 100) : [];


  const items: Item[] = [
    {
      key: "ativos",
      label: "Colaboradores ativos",
      icon: Users,
      value: kpis.colaboradores_ativos,
      prev: prev?.colaboradores_ativos ?? null,
      format: int,
      hint: "Colaboradores com cadastro ativo dentro do escopo e filtros selecionados.",
      descricao: "Base ativa do período",
      spark: [],
    },
    {
      key: "ausencias",
      label: "Ausências",
      icon: Activity,
      value: kpis.total,
      prev: prev?.total ?? null,
      format: int,
      inverse: true,
      hint: "Total de ocorrências registradas no período selecionado (todos os tipos).",
      descricao: "Ocorrências registradas",
      spark: sparkTotal,
    },
    {
      key: "pendencias",
      label: "Pendências",
      icon: Clock,
      value: kpis.pendentes,
      prev: prev?.pendentes ?? null,
      format: int,
      inverse: true,
      hint: "Ocorrências com status PENDENTE, ainda não lançadas no sistema.",
      descricao: "Aguardando lançamento",
      spark: sparkPend,
    },
    {
      key: "tempo",
      label: "Tempo médio",
      icon: Clock,
      value: Math.round(kpis.tempo_medio_lanc_h * 10) / 10,
      prev: prev ? Math.round(prev.tempo_medio_lanc_h * 10) / 10 : null,
      format: (v) => `${dec1(v)} h`,
      inverse: true,
      hint: "Média de horas entre o início da ausência e o seu lançamento no sistema.",
      descricao: "Da ocorrência ao lançamento",
      spark: sparkTempo,
    },
    {
      key: "lancados",
      label: "Lançamentos concluídos",
      icon: CheckCircle2,
      value: kpis.lancadas,
      prev: prev?.lancadas ?? null,
      format: int,
      hint: "Ocorrências com status LANÇADO no período selecionado.",
      descricao: "Registros finalizados",
      spark: sparkLanc,
    },
    {
      key: "taxa",
      label: "Taxa de ausência",
      icon: Percent,
      value: taxa ?? 0,
      prev: taxaPrev,
      format: (v) => `${dec1(v)}%`,
      inverse: true,
      hint: "Ausências do período ÷ colaboradores ativos × 100. Usa os mesmos números exibidos nos cards ao lado.",
      descricao: "Ausências por colaborador ativo",
      spark: sparkTaxa,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => {
        const disponivel = it.key !== "taxa" || taxa !== null;
        const d = it.prev == null ? null : pctDelta(it.value, it.prev);
        const flat = d !== null && Math.abs(d) < 0.5;
        const bom = d === null || flat ? null : it.inverse ? d < 0 : d > 0;
        const DeltaIcon = d === null ? ArrowRight : flat ? ArrowRight : d > 0 ? ArrowUp : ArrowDown;
        const deltaColor =
          bom === null
            ? "text-muted-foreground"
            : bom
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400";

        const sparkColor = bom === null ? "hsl(var(--muted-foreground))" : bom ? "#10b981" : "#ef4444";

        return (
          <Card
            key={it.key}
            className="flex h-full animate-in fade-in flex-col overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
          >
            <CardContent className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <it.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {it.label}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Como calculamos: ${it.label}`}
                      className="rounded text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-xs">{it.hint}</TooltipContent>
                </Tooltip>
              </div>

              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
                {disponivel ? it.format(it.value) : "—"}
              </p>

              {(it.spark?.length ?? 0) >= 2 && (
                <Sparkline
                  values={it.spark!}
                  color={sparkColor}
                  className="mt-3 h-7 w-full"
                  label={`Evolução diária de ${it.label} no período`}
                />
              )}

              <div className="mt-auto pt-3">
                {d === null ? (
                  <p className="text-[11px] text-muted-foreground">Comparação indisponível</p>
                ) : (
                  <div className={cn("flex items-center gap-1 text-xs font-medium", deltaColor)}>
                    <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                    <span className="tabular-nums">
                      {flat ? "estável" : `${d > 0 ? "+" : "−"}${dec1(Math.abs(d))}%`}
                    </span>
                    <span className="font-normal text-muted-foreground">vs. anterior</span>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground/80">{it.descricao}</p>
              </div>
            </CardContent>
          </Card>
        );

      })}
    </div>
    </TooltipProvider>
  );
}
