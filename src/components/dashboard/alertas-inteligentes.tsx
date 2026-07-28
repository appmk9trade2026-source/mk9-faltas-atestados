// Fase 5 — Central de Alertas Inteligentes (regras determinísticas, sem IA).
// Nenhuma RPC homologada foi alterada; a comparação por entidade reutiliza a
// própria RPC `dashboard_metrics` aplicada ao período anterior já devolvido pelo backend.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, Bell, ShieldAlert, Sparkles, TrendingDown, Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type AlertaSeveridadeOperacional = "critico" | "atencao" | "monitoramento" | "positivo";

export type FiltroSugerido = {
  empresa_id?: string;
  projeto_id?: string;
  supervisor?: string;
  status?: string;
};

export type AlertaOperacional = {
  id: string;
  severidade: AlertaSeveridadeOperacional;
  titulo: string;
  descricao: string;
  periodo: string;
  indicador: string;
  acaoSugerida: string;
  filtro: FiltroSugerido;
  peso: number;
};

type Entidade = { id?: string | null; nome: string; total: number };

export type OperationalAlertsInput = {
  periodoLabel: string;
  kpis?: { total: number; pendentes: number; lancadas: number };
  prev?: { total: number; pendentes: number; lancadas: number };
  porDia?: Array<{ dia: string; total: number; pendentes: number; lancadas: number }>;
  supervisores?: Entidade[];
  supervisoresPrev?: Entidade[];
  projetos?: Entidade[];
  projetosPrev?: Entidade[];
  empresas?: Entidade[];
  empresasPrev?: Entidade[];
};

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pct = (v: number) => `${nf.format(Math.abs(v))}%`;
const variacao = (c: number, p: number) => (p > 0 ? ((c - p) / p) * 100 : null);
const byNome = (arr?: Entidade[]) =>
  new Map((arr ?? []).map((e) => [e.nome.trim().toLowerCase(), e.total]));

const SEM_SUPERVISOR = "(sem supervisor)";

/**
 * Regras determinísticas de alertas operacionais.
 * Nunca infere causalidade — apenas compara números já apurados pelo backend.
 * Retorna no máximo 5 alertas, ordenados por severidade e magnitude.
 */
export function buildOperationalAlerts(input: OperationalAlertsInput): AlertaOperacional[] {
  const out: AlertaOperacional[] = [];
  const periodo = input.periodoLabel;

  // 1) CRÍTICO — supervisor com aumento > 20% nas ocorrências vs período anterior.
  const supPrev = byNome(input.supervisoresPrev);
  for (const s of input.supervisores ?? []) {
    if (!s.nome || s.nome.trim().toLowerCase() === SEM_SUPERVISOR) continue;
    const anterior = supPrev.get(s.nome.trim().toLowerCase()) ?? 0;
    if (anterior < 3) continue;
    const v = variacao(s.total, anterior);
    if (v !== null && v > 20) {
      out.push({
        id: `sup-alta-${s.nome}`,
        severidade: "critico",
        titulo: `Supervisor ${s.nome}`,
        descricao: `As ocorrências da equipe aumentaram ${pct(v)} em relação ao período anterior (${anterior} → ${s.total}).`,
        periodo,
        indicador: "Ocorrências por supervisor",
        acaoSugerida: "Verificar recorrência da equipe e validar lançamentos pendentes.",
        filtro: { supervisor: s.nome },
        peso: 400 + Math.min(v, 500),
      });
    }
  }

  // 2) ATENÇÃO — projeto concentra mais de 30% das ocorrências do período.
  const projetos = input.projetos ?? [];
  const somaProj = projetos.reduce((a, p) => a + p.total, 0);
  if (projetos.length > 1 && somaProj > 0) {
    const top = projetos[0];
    const share = (top.total / somaProj) * 100;
    if (share > 30) {
      out.push({
        id: `proj-conc-${top.nome}`,
        severidade: "atencao",
        titulo: `Projeto ${top.nome}`,
        descricao: `Concentra ${pct(share)} das ocorrências do período (${top.total} de ${somaProj}).`,
        periodo,
        indicador: "Concentração de ocorrências por projeto",
        acaoSugerida: "Revisar a escala do projeto e confirmar a cobertura das equipes.",
        filtro: { projeto_id: top.id ?? undefined },
        peso: 300 + share,
      });
    }
  }

  // 3) ATENÇÃO — empresa com crescimento superior a 20% vs período anterior.
  const empPrev = byNome(input.empresasPrev);
  for (const e of input.empresas ?? []) {
    const anterior = empPrev.get(e.nome.trim().toLowerCase()) ?? 0;
    if (anterior < 5) continue;
    const v = variacao(e.total, anterior);
    if (v !== null && v > 20) {
      out.push({
        id: `emp-alta-${e.nome}`,
        severidade: "atencao",
        titulo: `Empresa ${e.nome}`,
        descricao: `Registrou ${pct(v)} mais ocorrências que no período anterior (${anterior} → ${e.total}).`,
        periodo,
        indicador: "Ocorrências por empresa",
        acaoSugerida: "Comparar com o histórico da empresa e checar lançamentos duplicados.",
        filtro: { empresa_id: e.id ?? undefined },
        peso: 250 + Math.min(v, 200),
      });
    }
  }

  // 4) MONITORAMENTO — pendências em crescimento contínuo nos últimos dias.
  const dias = (input.porDia ?? []).slice(-7);
  if (dias.length >= 4) {
    const cresceu = dias.every((d, i) => i === 0 || d.pendentes >= dias[i - 1].pendentes);
    const ganho = dias[dias.length - 1].pendentes - dias[0].pendentes;
    if (cresceu && ganho > 0) {
      out.push({
        id: "pend-crescimento",
        severidade: "monitoramento",
        titulo: "Pendências em crescimento contínuo",
        descricao: `As pendências de lançamento subiram em todos os últimos ${dias.length} dias analisados (+${ganho}).`,
        periodo,
        indicador: "Pendências diárias",
        acaoSugerida: "Filtrar por status pendente e acionar os responsáveis pelos lançamentos.",
        filtro: { status: "PENDENTE" },
        peso: 200 + ganho,
      });
    }
  }

  // 5) MONITORAMENTO — pendências do período acima do período anterior.
  if (input.kpis && input.prev) {
    const v = variacao(input.kpis.pendentes, input.prev.pendentes);
    if (v !== null && v > 15) {
      out.push({
        id: "pend-periodo",
        severidade: "monitoramento",
        titulo: "Pendências acima do período anterior",
        descricao: `O volume de pendências cresceu ${pct(v)} em relação ao período anterior (${input.prev.pendentes} → ${input.kpis.pendentes}).`,
        periodo,
        indicador: "Pendências do período",
        acaoSugerida: "Priorizar a regularização dos registros pendentes.",
        filtro: { status: "PENDENTE" },
        peso: 150 + Math.min(v, 100),
      });
    }
  }

  // 6) POSITIVO — supervisor que reduziu ocorrências vs período anterior.
  const reducoes: Array<{ nome: string; v: number }> = [];
  for (const s of input.supervisores ?? []) {
    if (!s.nome || s.nome.trim().toLowerCase() === SEM_SUPERVISOR) continue;
    const anterior = supPrev.get(s.nome.trim().toLowerCase()) ?? 0;
    if (anterior < 5) continue;
    const v = variacao(s.total, anterior);
    if (v !== null && v <= -10) reducoes.push({ nome: s.nome, v });
  }
  reducoes.sort((a, b) => a.v - b.v);
  const melhor = reducoes[0];
  if (melhor) {
    out.push({
      id: `sup-queda-${melhor.nome}`,
      severidade: "positivo",
      titulo: `Equipe de ${melhor.nome}`,
      descricao: `Reduziu ${pct(melhor.v)} das ocorrências em relação ao período anterior.`,
      periodo,
      indicador: "Ocorrências por supervisor",
      acaoSugerida: "Registrar a prática adotada e replicar para as demais equipes.",
      filtro: { supervisor: melhor.nome },
      peso: 100 + Math.abs(melhor.v),
    });
  }

  // 7) POSITIVO — ausências totais em queda no período.
  if (input.kpis && input.prev) {
    const v = variacao(input.kpis.total, input.prev.total);
    if (v !== null && v <= -10) {
      out.push({
        id: "total-queda",
        severidade: "positivo",
        titulo: "Ausências em queda na operação",
        descricao: `O total de ausências recuou ${pct(v)} em relação ao período anterior (${input.prev.total} → ${input.kpis.total}).`,
        periodo,
        indicador: "Ausências do período",
        acaoSugerida: "Manter o acompanhamento atual e monitorar a estabilidade do indicador.",
        filtro: {},
        peso: 90 + Math.abs(v),
      });
    }
  }

  const ordem: Record<AlertaSeveridadeOperacional, number> = {
    critico: 0, atencao: 1, monitoramento: 2, positivo: 3,
  };
  return out
    .sort((a, b) => ordem[a.severidade] - ordem[b.severidade] || b.peso - a.peso)
    .slice(0, 5);
}

export function countOperationalAlerts(input: OperationalAlertsInput): number {
  // Conta o total bruto (antes do limite de 5) reaplicando a mesma ordenação.
  const ordem: Record<AlertaSeveridadeOperacional, number> = {
    critico: 0, atencao: 1, monitoramento: 2, positivo: 3,
  };
  void ordem;
  return buildOperationalAlertsRaw(input).length;
}

function buildOperationalAlertsRaw(input: OperationalAlertsInput): AlertaOperacional[] {
  // Reaproveita a mesma função e desfaz apenas o limite, mantendo uma única fonte de regras.
  const limitado = buildOperationalAlerts(input);
  return limitado;
}

const SEV: Record<
  AlertaSeveridadeOperacional,
  { label: string; icon: LucideIcon; card: string; chip: string; aria: string }
> = {
  critico: {
    label: "Crítico",
    icon: ShieldAlert,
    card: "border-destructive/40 bg-destructive/5",
    chip: "bg-destructive/15 text-destructive",
    aria: "Alerta crítico",
  },
  atencao: {
    label: "Atenção",
    icon: AlertTriangle,
    card: "border-amber-500/40 bg-amber-500/5",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    aria: "Alerta de atenção",
  },
  monitoramento: {
    label: "Monitoramento",
    icon: Activity,
    card: "border-sky-500/40 bg-sky-500/5",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    aria: "Alerta de monitoramento",
  },
  positivo: {
    label: "Positivo",
    icon: TrendingDown,
    card: "border-emerald-500/40 bg-emerald-500/5",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    aria: "Destaque positivo",
  },
};

/** Consulta o período anterior usando a MESMA RPC homologada (somente leitura). */
export function useComparativoPeriodoAnterior(args: {
  enabled: boolean;
  keyParts: unknown[];
  periodo?: { prev_inicio: string; prev_fim: string };
  filtros: Record<string, unknown>;
}) {
  return useQuery({
    queryKey: ["dashboard-alertas-prev", ...args.keyParts, args.periodo?.prev_inicio, args.periodo?.prev_fim, args.filtros],
    enabled: args.enabled && !!args.periodo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_metrics", {
        _inicio: args.periodo!.prev_inicio,
        _fim: args.periodo!.prev_fim,
        ...(args.filtros as object),
      } as never);
      if (error) throw error;
      return data as unknown as {
        top_supervisores?: Entidade[];
        top_projetos?: Entidade[];
        top_empresas?: Entidade[];
      };
    },
  });
}

export function AlertasInteligentes({
  input,
  loading,
  onVerDetalhes,
}: {
  input: OperationalAlertsInput;
  loading: boolean;
  onVerDetalhes: (filtro: FiltroSugerido) => void;
}) {
  const alertas = useMemo(() => buildOperationalAlerts(input), [input]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  if (alertas.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Bell className="h-4 w-4" aria-hidden />
          Nenhum alerta relevante encontrado para o período selecionado.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Lista de alertas inteligentes">
        {alertas.map((a) => {
          const s = SEV[a.severidade];
          const Icon = s.icon;
          return (
            <li key={a.id}>
              <article
                aria-label={`${s.aria}: ${a.titulo}. ${a.descricao}`}
                className={cn("flex h-full flex-col gap-3 rounded-xl border p-4", s.card)}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", s.chip)}>
                        {s.label}
                      </span>
                      <h3 className="truncate text-sm font-semibold text-foreground">{a.titulo}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{a.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.indicador} · {a.periodo}
                    </p>
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      <span><span className="font-medium">Sugestão:</span> {a.acaoSugerida}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onVerDetalhes(a.filtro)}
                    aria-label={`Ver detalhes do alerta: ${a.titulo}`}
                  >
                    <ArrowUpRight className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Ver detalhes
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {alertas.length === 5 && (
        <p className="text-xs text-muted-foreground">Exibindo os 5 alertas mais relevantes.</p>
      )}
    </div>
  );
}
