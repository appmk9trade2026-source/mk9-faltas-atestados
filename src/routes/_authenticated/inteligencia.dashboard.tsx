// Fase 4 — Dashboard Executivo de Inteligência de Absenteísmo
// Reutiliza:
//   - calcular_score_colaboradores_lote (SECURITY INVOKER) para score
//   - absenteismo_config para limiares/pesos
//   - public.ausencias (RLS) para série temporal, heatmap e SLA
// Não recalcula score no cliente. Não altera RLS/RBAC.
// Supervisor enxerga apenas dados do próprio escopo (RLS + client scope).
import * as React from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  Calendar as CalendarIcon,
  ClipboardList,
  Filter as FilterIcon,
  Flame,
  Gauge,
  HelpCircle,
  Info,
  RefreshCw,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  UserCog,
  Users2,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/layout/app-shell";
import { IntelligenceNav } from "@/components/inteligencia/intelligence-nav";
import { RankingWidget } from "@/components/inteligencia/ranking-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { SupervisorEmptyState } from "@/components/supervisor-empty-state";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────
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
  matricula: string;
  empresa_id: string;
  projeto_id: string;
  supervisor_usuario_id: string | null;
  score: number;
  nivel: Nivel;
  total_ocorrencias: number;
  total_dias_perdidos: number;
  ultima_ocorrencia: string | null;
  breakdown: Breakdown;
};

type Config = {
  janela_dias: number;
  limiar_atencao: number;
  limiar_alta: number;
  limiar_critica: number;
};

type AusenciaRow = {
  id: string;
  colaborador_id: string;
  empresa_id: string;
  projeto_id: string;
  data_inicio: string;
  dias: number | null;
  quantidade_dias_calculada: number | null;
  tipo_ausencia_codigo: string | null;
  tipo_ausencia_nome: string | null;
  registrado_em: string | null;
  created_at: string;
};

const NIVEL_META: Record<Nivel, { label: string; color: string; bg: string; badge: string; hex: string }> = {
  BAIXA: {
    label: "Baixa",
    color: "text-emerald-500",
    bg: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    hex: "#10b981",
  },
  ATENCAO: {
    label: "Atenção",
    color: "text-amber-500",
    bg: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    hex: "#f59e0b",
  },
  ALTA: {
    label: "Alta",
    color: "text-orange-500",
    bg: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    hex: "#f97316",
  },
  CRITICA: {
    label: "Crítica",
    color: "text-destructive",
    bg: "bg-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/40",
    hex: "#ef4444",
  },
};

const CATEGORIA_BREAKDOWN_KEYS: Record<string, Array<keyof Breakdown>> = {
  FALTAS: ["faltas"],
  ATESTADOS: ["atestados"],
  DECLARACOES: ["declaracoes"],
  SUSPENSOES: ["suspensoes"],
  ACIDENTES: ["acidente_trabalho", "acidente_trajeto"],
  OUTROS: ["outros"],
};

const TIPO_BREAKDOWN_KEY: Record<string, keyof Breakdown> = {
  FALTA: "faltas",
  ATESTADO: "atestados",
  DECLARACAO: "declaracoes",
  SUSPENSAO: "suspensoes",
  ACIDENTE_TRABALHO: "acidente_trabalho",
  ACIDENTE_TRAJETO: "acidente_trajeto",
  OUTROS: "outros",
};

const SLA_HORAS = 48;

// ─── Route + search params ───────────────────────────────────────────
const searchSchema = z.object({
  empresa: fallback(z.string(), "").default(""),
  projeto: fallback(z.string(), "").default(""),
  supervisor: fallback(z.string(), "").default(""),
  categoria: fallback(z.string(), "").default(""),
  tipo: fallback(z.string(), "").default(""),
  nivel: fallback(z.string(), "").default(""),
  situacao: fallback(z.string(), "").default(""),
  janela: fallback(z.string(), "").default(""),
  metrica: fallback(z.string(), "ocorrencias").default("ocorrencias"),
  heat: fallback(z.string(), "mes_dow").default("mes_dow"),
});

export const Route = createFileRoute("/_authenticated/inteligencia/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Executivo · Inteligência · CRM MK9" },
      {
        name: "description",
        content: "Visão executiva consolidada de riscos, tendências e comparativos de absenteísmo.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: RedirectToInteligencia,
});

function RedirectToInteligencia() {
  return <Navigate to="/inteligencia" search={{ tab: "dashboard" }} replace />;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function nivelFromScore(score: number, cfg: Config | null): Nivel {
  if (!cfg) return "BAIXA";
  if (score >= cfg.limiar_critica) return "CRITICA";
  if (score >= cfg.limiar_alta) return "ALTA";
  if (score >= cfg.limiar_atencao) return "ATENCAO";
  return "BAIXA";
}

function fmtNum(v: number, digits = 0): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(v: number | null, digits = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function delta(current: number, previous: number): { pct: number | null; dir: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { pct: 0, dir: "flat" };
  if (previous === 0) return { pct: null, dir: "up" };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const dir: "up" | "down" | "flat" = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, dir };
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ─── Small components ────────────────────────────────────────────────
function DeltaPill({
  value,
  invert = false,
  suffix,
}: {
  value: { pct: number | null; dir: "up" | "down" | "flat" };
  invert?: boolean;
  suffix?: string;
}) {
  if (value.pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <ArrowRight className="h-3 w-3" /> novo
      </span>
    );
  }
  const good = invert ? value.dir === "up" : value.dir === "down";
  const bad = invert ? value.dir === "down" : value.dir === "up";
  const cls = value.dir === "flat"
    ? "text-muted-foreground"
    : good
      ? "text-emerald-500"
      : bad
        ? "text-destructive"
        : "text-muted-foreground";
  const Icon = value.dir === "up" ? ArrowUp : value.dir === "down" ? ArrowDown : ArrowRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", cls)}>
      <Icon className="h-3 w-3" />
      {Math.abs(value.pct).toFixed(1)}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  delta: d,
  invertDelta,
  formula,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  delta?: { pct: number | null; dir: "up" | "down" | "flat" };
  invertDelta?: boolean;
  formula: string;
  accent?: "primary" | "warning" | "danger" | "success" | "info";
}) {
  const accents: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-500",
    danger: "from-destructive/15 to-destructive/5 text-destructive",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-500",
    info: "from-sky-500/15 to-sky-500/5 text-sky-500",
  };
  return (
    <Card className="relative overflow-hidden border-border/60 transition-shadow hover:shadow-md">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
          accents[accent],
        )}
      />
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn("rounded-md bg-background/70 p-1.5 backdrop-blur")}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground/70 hover:text-foreground"
                aria-label="Fórmula"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs">
              {formula}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
          {d && <DeltaPill value={d} invert={invertDelta} suffix="vs. anterior" />}
        </div>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { loading, roles } = useSession();
  const scope = useSessionScope();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = React.useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) => {
      navigate({
        search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }),
        replace: true,
      });
    },
    [navigate],
  );

  const janelaNum = search.janela ? Number(search.janela) : undefined;

  // ─── Config ───────────────────────────────────────────
  const cfgQuery = useQuery({
    queryKey: ["inteligencia", "config"],
    enabled: scope.ready,
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase
        .from("absenteismo_config")
        .select("janela_dias, limiar_atencao, limiar_alta, limiar_critica")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração não encontrada");
      return data as Config;
    },
    staleTime: 5 * 60_000,
  });

  const janelaEfetiva = janelaNum ?? cfgQuery.data?.janela_dias ?? 90;

  // ─── Ranking (score atual da janela) ─────────────────
  const rankingQuery = useQuery({
    queryKey: [
      "inteligencia",
      "dash",
      "ranking",
      ...scope.keyParts,
      search.empresa || null,
      search.projeto || null,
      janelaEfetiva,
    ],
    enabled: scope.ready,
    queryFn: async (): Promise<ScoreRow[]> => {
      const { data, error } = await supabase.rpc("calcular_score_colaboradores_lote", {
        _empresa_id: search.empresa || undefined,
        _projeto_id: search.projeto || undefined,
        _janela_dias: janelaEfetiva,
      });
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  // ─── Ausências (2× janela + 12 meses para série) ─────
  const historicoDias = Math.max(janelaEfetiva * 2, 366);
  const desdeIso = React.useMemo(() => daysAgoIso(historicoDias), [historicoDias]);

  const ausenciasQuery = useQuery({
    queryKey: [
      "inteligencia",
      "dash",
      "ausencias",
      ...scope.keyParts,
      desdeIso,
      search.empresa || null,
      search.projeto || null,
    ],
    enabled: scope.ready,
    queryFn: async (): Promise<AusenciaRow[]> => {
      let q = supabase
        .from("ausencias")
        .select(
          "id, colaborador_id, empresa_id, projeto_id, data_inicio, dias, quantidade_dias_calculada, tipo_ausencia_codigo, tipo_ausencia_nome, registrado_em, created_at",
        )
        .gte("data_inicio", desdeIso)
        .order("data_inicio", { ascending: false })
        .limit(5000);
      if (search.empresa) q = q.eq("empresa_id", search.empresa);
      if (search.projeto) q = q.eq("projeto_id", search.projeto);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AusenciaRow[];
    },
    staleTime: 60_000,
  });

  // ─── Referências ────────────────────────────────────
  const empresasQuery = useQuery({
    queryKey: ["inteligencia", "ref", "empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const projetosQuery = useQuery({
    queryKey: ["inteligencia", "ref", "projetos", ...scope.keyParts, search.empresa || null],
    enabled: scope.ready,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome");
      if (search.empresa) q = q.eq("empresa_id", search.empresa);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const supervisoresQuery = useQuery({
    queryKey: ["inteligencia", "ref", "supervisores", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const tiposQuery = useQuery({
    queryKey: ["inteligencia", "ref", "tipos", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_ausencia")
        .select("codigo, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const empresaMap = React.useMemo(
    () => new Map((empresasQuery.data ?? []).map((e) => [e.id, e.nome])),
    [empresasQuery.data],
  );
  const projetoMap = React.useMemo(
    () => new Map((projetosQuery.data ?? []).map((p) => [p.id, p.nome])),
    [projetosQuery.data],
  );
  const supervisorMap = React.useMemo(
    () => new Map((supervisoresQuery.data ?? []).map((p) => [p.id, p.nome])),
    [supervisoresQuery.data],
  );

  // ─── Filtro sobre o ranking ─────────────────────────
  const filteredRanking = React.useMemo(() => {
    const rows = rankingQuery.data ?? [];
    return rows.filter((r) => {
      if (search.supervisor && r.supervisor_usuario_id !== search.supervisor) return false;
      if (search.nivel && r.nivel !== (search.nivel as Nivel)) return false;
      if (search.categoria) {
        const keys = CATEGORIA_BREAKDOWN_KEYS[search.categoria] ?? [];
        if (!keys.some((k) => Number(r.breakdown?.[k] ?? 0) > 0)) return false;
      }
      if (search.tipo) {
        const key = TIPO_BREAKDOWN_KEY[search.tipo];
        if (!key || Number(r.breakdown?.[key] ?? 0) <= 0) return false;
      }
      return true;
    });
  }, [rankingQuery.data, search.supervisor, search.nivel, search.categoria, search.tipo]);

  // Set de colaboradores que passaram no filtro (usado p/ filtrar ausências por supervisor/etc)
  const filteredColabIds = React.useMemo(
    () => new Set(filteredRanking.map((r) => r.colaborador_id)),
    [filteredRanking],
  );

  // ─── Buckets de ausências: atual x anterior ──────────
  const now = React.useMemo(() => new Date(), []);
  const janelaMs = janelaEfetiva * 24 * 60 * 60 * 1000;

  const filteredAusencias = React.useMemo(() => {
    const rows = ausenciasQuery.data ?? [];
    // Se supervisor/nivel/cat/tipo estão ativos, restringe ao conjunto de colabs do ranking
    const restringe =
      !!search.supervisor || !!search.nivel || !!search.categoria || !!search.tipo;
    return rows.filter((r) => {
      if (restringe && !filteredColabIds.has(r.colaborador_id)) return false;
      return true;
    });
  }, [ausenciasQuery.data, search.supervisor, search.nivel, search.categoria, search.tipo, filteredColabIds]);

  const { current: ausCur, prev: ausPrev } = React.useMemo(() => {
    const c: AusenciaRow[] = [];
    const p: AusenciaRow[] = [];
    for (const a of filteredAusencias) {
      const t = new Date(a.data_inicio + "T00:00:00").getTime();
      const diff = now.getTime() - t;
      if (diff <= janelaMs) c.push(a);
      else if (diff <= janelaMs * 2) p.push(a);
    }
    return { current: c, prev: p };
  }, [filteredAusencias, now, janelaMs]);

  // ─── KPIs ────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    const analisados = filteredRanking.length;
    const critAlta = filteredRanking.filter((r) => r.nivel === "ALTA" || r.nivel === "CRITICA").length;
    const scoreMedio =
      analisados > 0
        ? filteredRanking.reduce((acc, r) => acc + (r.score ?? 0), 0) / analisados
        : 0;
    const reincidentes = filteredRanking.filter((r) => (r.total_ocorrencias ?? 0) >= 2).length;

    const sumDias = (arr: AusenciaRow[]) =>
      arr.reduce((acc, a) => acc + Number(a.quantidade_dias_calculada ?? a.dias ?? 0), 0);
    const sumTipo = (arr: AusenciaRow[], code: string) =>
      arr.filter((a) => a.tipo_ausencia_codigo === code).length;

    const ocorCur = ausCur.length;
    const ocorPrev = ausPrev.length;
    const faltasCur = sumTipo(ausCur, "FALTA");
    const faltasPrev = sumTipo(ausPrev, "FALTA");
    const atestCur = sumTipo(ausCur, "ATESTADO");
    const atestPrev = sumTipo(ausPrev, "ATESTADO");
    const diasCur = sumDias(ausCur);
    const diasPrev = sumDias(ausPrev);

    // Taxa absenteísmo: dias perdidos / (colabs analisados * janela) * 100
    const denom = Math.max(1, analisados * janelaEfetiva);
    const taxaCur = (diasCur / denom) * 100;
    // Aproximação para período anterior — mesmo denominador (colabs atuais)
    const taxaPrev = (diasPrev / denom) * 100;

    // Reincidência no período atual sobre analisados
    const reincidePct = analisados > 0 ? (reincidentes / analisados) * 100 : 0;

    // SLA — % de ausências do período com registrado_em - data_inicio <= 48h
    const slaCalc = (arr: AusenciaRow[]) => {
      let total = 0;
      let dentro = 0;
      for (const a of arr) {
        const ref = a.registrado_em ?? a.created_at;
        if (!ref) continue;
        const inicioT = new Date(a.data_inicio + "T00:00:00").getTime();
        const h = (new Date(ref).getTime() - inicioT) / (1000 * 60 * 60);
        if (h < 0) continue;
        total += 1;
        if (h <= SLA_HORAS) dentro += 1;
      }
      return total > 0 ? (dentro / total) * 100 : null;
    };
    const slaCur = slaCalc(ausCur);
    const slaPrev = slaCalc(ausPrev);

    return {
      analisados,
      critAlta,
      scoreMedio,
      reincidentes,
      reincidePct,
      ocorCur, ocorPrev,
      faltasCur, faltasPrev,
      atestCur, atestPrev,
      diasCur, diasPrev,
      taxaCur, taxaPrev,
      slaCur, slaPrev,
    };
  }, [filteredRanking, ausCur, ausPrev, janelaEfetiva]);

  // ─── Distribuição de criticidade ─────────────────────
  const distribuicao = React.useMemo(() => {
    const cur: Record<Nivel, number> = { BAIXA: 0, ATENCAO: 0, ALTA: 0, CRITICA: 0 };
    for (const r of filteredRanking) cur[r.nivel] += 1;
    // "Anterior" aproximado — recomputa nível a partir do ranking usando limiar atual
    // sobre ausências anteriores. Como não temos score histórico sem re-rodar RPC,
    // usamos deltas apenas de contagem simples (aproximação transparente).
    const total = filteredRanking.length;
    return (Object.keys(cur) as Nivel[]).map((n) => ({
      nivel: n,
      label: NIVEL_META[n].label,
      color: NIVEL_META[n].hex,
      qtd: cur[n],
      pct: total > 0 ? (cur[n] / total) * 100 : 0,
    }));
  }, [filteredRanking]);

  // ─── Série temporal (12 meses) ───────────────────────
  const serie = React.useMemo(() => {
    const buckets = new Map<string, { ocor: number; faltas: number; atestados: number; dias: number }>();
    // últimos 12 meses (inclui atual)
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { ocor: 0, faltas: 0, atestados: 0, dias: 0 });
    }
    for (const a of filteredAusencias) {
      const k = monthKey(a.data_inicio);
      const b = buckets.get(k);
      if (!b) continue;
      b.ocor += 1;
      if (a.tipo_ausencia_codigo === "FALTA") b.faltas += 1;
      if (a.tipo_ausencia_codigo === "ATESTADO") b.atestados += 1;
      b.dias += Number(a.quantidade_dias_calculada ?? a.dias ?? 0);
    }
    const denomMensal = Math.max(1, kpis.analisados * 30);
    return Array.from(buckets.entries()).map(([k, v]) => ({
      mes: monthLabel(k),
      key: k,
      ocorrencias: v.ocor,
      faltas: v.faltas,
      atestados: v.atestados,
      dias: v.dias,
      taxa: Number(((v.dias / denomMensal) * 100).toFixed(2)),
    }));
  }, [filteredAusencias, now, kpis.analisados]);

  // ─── Top rankings ────────────────────────────────────
  const topColaboradores = React.useMemo(
    () => [...filteredRanking].sort((a, b) => b.score - a.score).slice(0, 10),
    [filteredRanking],
  );

  const topSupervisores = React.useMemo(() => {
    const map = new Map<string, { id: string; scoreSum: number; count: number; criticos: number }>();
    for (const r of filteredRanking) {
      const sid = r.supervisor_usuario_id ?? "__sem__";
      const e = map.get(sid) ?? { id: sid, scoreSum: 0, count: 0, criticos: 0 };
      e.scoreSum += r.score ?? 0;
      e.count += 1;
      if (r.nivel === "CRITICA") e.criticos += 1;
      map.set(sid, e);
    }
    return Array.from(map.values())
      .map((e) => ({
        id: e.id,
        nome: e.id === "__sem__" ? "Sem supervisor" : supervisorMap.get(e.id) ?? "Supervisor",
        scoreMedio: e.count > 0 ? e.scoreSum / e.count : 0,
        pctCritico: e.count > 0 ? (e.criticos / e.count) * 100 : 0,
        colabs: e.count,
      }))
      .sort((a, b) => b.pctCritico - a.pctCritico || b.scoreMedio - a.scoreMedio)
      .slice(0, 10);
  }, [filteredRanking, supervisorMap]);

  const topProjetos = React.useMemo(() => {
    const map = new Map<string, { id: string; scoreSum: number; count: number; dias: number }>();
    for (const r of filteredRanking) {
      const e = map.get(r.projeto_id) ?? { id: r.projeto_id, scoreSum: 0, count: 0, dias: 0 };
      e.scoreSum += r.score;
      e.count += 1;
      e.dias += r.total_dias_perdidos ?? 0;
      map.set(r.projeto_id, e);
    }
    return Array.from(map.values())
      .map((e) => ({
        id: e.id,
        nome: projetoMap.get(e.id) ?? "Projeto",
        scoreMedio: e.count > 0 ? e.scoreSum / e.count : 0,
        diasPorColab: e.count > 0 ? e.dias / e.count : 0,
        colabs: e.count,
      }))
      .sort((a, b) => b.scoreMedio - a.scoreMedio)
      .slice(0, 10);
  }, [filteredRanking, projetoMap]);

  const topEmpresas = React.useMemo(() => {
    const map = new Map<string, { id: string; scoreSum: number; count: number; dias: number }>();
    for (const r of filteredRanking) {
      const e = map.get(r.empresa_id) ?? { id: r.empresa_id, scoreSum: 0, count: 0, dias: 0 };
      e.scoreSum += r.score;
      e.count += 1;
      e.dias += r.total_dias_perdidos ?? 0;
      map.set(r.empresa_id, e);
    }
    return Array.from(map.values())
      .map((e) => ({
        id: e.id,
        nome: empresaMap.get(e.id) ?? "Empresa",
        scoreMedio: e.count > 0 ? e.scoreSum / e.count : 0,
        diasPorColab: e.count > 0 ? e.dias / e.count : 0,
        colabs: e.count,
      }))
      .sort((a, b) => b.scoreMedio - a.scoreMedio)
      .slice(0, 10);
  }, [filteredRanking, empresaMap]);

  const topTipos = React.useMemo(() => {
    const map = new Map<string, { codigo: string; nome: string; qtd: number; dias: number }>();
    for (const a of ausCur) {
      const key = a.tipo_ausencia_codigo ?? "—";
      const e = map.get(key) ?? { codigo: key, nome: a.tipo_ausencia_nome ?? key, qtd: 0, dias: 0 };
      e.qtd += 1;
      e.dias += Number(a.quantidade_dias_calculada ?? a.dias ?? 0);
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
  }, [ausCur]);

  // ─── Heatmap ────────────────────────────────────────
  const heatmap = React.useMemo(() => {
    // Modo: mes_dow  → rows=meses, cols=DOW
    //       empresa_dow, projeto_dow, supervisor_dow
    const rowsKey = search.heat;
    const bucket = new Map<string, Map<number, { ocor: number; colabs: Set<string>; dias: number; scoreSum: number; scoreN: number }>>();
    // supervisor por colaborador (a partir do ranking)
    const supByColab = new Map<string, string | null>();
    const scoreByColab = new Map<string, number>();
    for (const r of filteredRanking) {
      supByColab.set(r.colaborador_id, r.supervisor_usuario_id);
      scoreByColab.set(r.colaborador_id, r.score);
    }
    for (const a of ausCur) {
      const d = new Date(a.data_inicio + "T00:00:00");
      const dow = d.getDay();
      let rowKey = "";
      let rowLabel = "";
      if (rowsKey === "mes_dow") {
        rowKey = monthKey(a.data_inicio);
        rowLabel = monthLabel(rowKey);
      } else if (rowsKey === "empresa_dow") {
        rowKey = a.empresa_id;
        rowLabel = empresaMap.get(a.empresa_id) ?? "—";
      } else if (rowsKey === "projeto_dow") {
        rowKey = a.projeto_id;
        rowLabel = projetoMap.get(a.projeto_id) ?? "—";
      } else if (rowsKey === "supervisor_dow") {
        const sid = supByColab.get(a.colaborador_id) ?? "__sem__";
        rowKey = sid;
        rowLabel = sid === "__sem__" ? "Sem supervisor" : supervisorMap.get(sid) ?? "Supervisor";
      }
      if (!rowKey) continue;
      let row = bucket.get(rowKey);
      if (!row) {
        row = new Map();
        bucket.set(rowKey, row);
      }
      let cell = row.get(dow);
      if (!cell) {
        cell = { ocor: 0, colabs: new Set(), dias: 0, scoreSum: 0, scoreN: 0 };
        row.set(dow, cell);
      }
      cell.ocor += 1;
      cell.colabs.add(a.colaborador_id);
      cell.dias += Number(a.quantidade_dias_calculada ?? a.dias ?? 0);
      const s = scoreByColab.get(a.colaborador_id);
      if (s != null) { cell.scoreSum += s; cell.scoreN += 1; }
      // guarda label junto
      (row as any).__label = rowLabel;
    }
    let max = 0;
    const rows = Array.from(bucket.entries()).map(([key, row]) => {
      const cells = Array.from({ length: 7 }, (_, dow) => {
        const c = row.get(dow);
        const ocor = c?.ocor ?? 0;
        if (ocor > max) max = ocor;
        return {
          dow,
          ocor,
          colabs: c ? c.colabs.size : 0,
          dias: c?.dias ?? 0,
          scoreMedio: c && c.scoreN > 0 ? c.scoreSum / c.scoreN : 0,
        };
      });
      return { key, label: (row as any).__label as string, cells, total: cells.reduce((a, x) => a + x.ocor, 0) };
    });
    // Sort rows
    if (rowsKey === "mes_dow") {
      rows.sort((a, b) => a.key.localeCompare(b.key));
    } else {
      rows.sort((a, b) => b.total - a.total);
    }
    return { rows: rows.slice(0, 20), max };
  }, [ausCur, search.heat, filteredRanking, empresaMap, projetoMap, supervisorMap]);

  // ─── Filtros ativos ────────────────────────────────
  const filtrosAtivos =
    !!search.empresa || !!search.projeto || !!search.supervisor ||
    !!search.categoria || !!search.tipo || !!search.nivel ||
    !!search.situacao || !!search.janela;

  const clearFilters = () =>
    setSearch({
      empresa: "", projeto: "", supervisor: "", categoria: "", tipo: "",
      nivel: "", situacao: "", janela: "",
    });

  // Helper — construir link para ranking filtrado
  const rankingLink = (patch: Record<string, string>) => ({
    to: "/inteligencia" as const,
    search: {
      empresa: patch.empresa ?? search.empresa,
      projeto: patch.projeto ?? search.projeto,
      supervisor: patch.supervisor ?? search.supervisor,
      categoria: patch.categoria ?? search.categoria,
      tipo: patch.tipo ?? search.tipo,
      nivel: patch.nivel ?? search.nivel,
      janela: patch.janela ?? search.janela,
      q: "",
      page: 0,
      sort: "score",
      dir: "desc" as const,
      det: "",
    },
  });

  const supervisorLink = (patch: Record<string, string>) => ({
    to: "/inteligencia/supervisores" as const,
    search: {
      empresa: patch.empresa ?? search.empresa,
      projeto: patch.projeto ?? search.projeto,
      supervisor: patch.supervisor ?? search.supervisor,
      nivel: patch.nivel ?? search.nivel,
      scoreMin: "", scoreMax: "",
      situacao: search.situacao,
      janela: patch.janela ?? search.janela,
      q: "",
      page: 0,
      sort: "score",
      dir: "desc" as const,
      det: "",
    },
  });

  // ─── Empty / loading ────────────────────────────────
  if (loading || !scope.ready) {
    return (
      <AppShell title="Dashboard Executivo">
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </AppShell>
    );
  }

  const carregando = rankingQuery.isLoading || ausenciasQuery.isLoading || cfgQuery.isLoading;

  if (
    scope.isSupervisorOnly &&
    !carregando &&
    (rankingQuery.data ?? []).length === 0
  ) {
    return (
      <AppShell title="Dashboard Executivo">
        <SupervisorEmptyState
          title="Sem equipe vinculada"
          description="Você ainda não tem colaboradores diretamente sob sua supervisão. Peça ao RH para vincular seus colaboradores para visualizar o dashboard."
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard Executivo · Inteligência">
      <TooltipProvider delayDuration={200}>
        <div className="space-y-6">
          <IntelligenceNav current="/inteligencia/dashboard" />
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 p-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">Dashboard Executivo</h1>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  Janela {janelaEfetiva}d
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Visão estratégica do absenteísmo — KPIs, comparação com o período anterior,
                evolução, heatmap, criticidade, rankings e tendências. Para acompanhamento
                operacional acesse <strong>Governança</strong>; para integridade dos dados,
                <strong> Qualidade dos Dados</strong>.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link {...rankingLink({})}>
                  <Trophy className="h-4 w-4" /> Ranking analítico
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { rankingQuery.refetch(); ausenciasQuery.refetch(); }}
                disabled={rankingQuery.isFetching || ausenciasQuery.isFetching}
              >
                <RefreshCw className={cn("h-4 w-4", (rankingQuery.isFetching || ausenciasQuery.isFetching) && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </div>

          {/* Filtros globais */}
          <Card className="border-border/60">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Filtros globais
                </span>
                {filtrosAtivos && (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={clearFilters}>
                    <X className="h-3 w-3" /> Limpar
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                <Select value={search.janela || "auto"} onValueChange={(v) => setSearch({ janela: v === "auto" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Padrão ({cfgQuery.data?.janela_dias ?? 90}d)</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="60">Últimos 60 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                    <SelectItem value="180">Últimos 180 dias</SelectItem>
                    <SelectItem value="365">Últimos 365 dias</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={search.empresa || "all"} onValueChange={(v) => setSearch({ empresa: v === "all" ? "" : v, projeto: "" })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas empresas</SelectItem>
                    {(empresasQuery.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={search.projeto || "all"} onValueChange={(v) => setSearch({ projeto: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos projetos</SelectItem>
                    {(projetosQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={search.supervisor || "all"} onValueChange={(v) => setSearch({ supervisor: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Supervisor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos supervisores</SelectItem>
                    {(supervisoresQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={search.nivel || "all"} onValueChange={(v) => setSearch({ nivel: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Criticidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas criticidades</SelectItem>
                    {(["CRITICA","ALTA","ATENCAO","BAIXA"] as Nivel[]).map((n) => (
                      <SelectItem key={n} value={n}>{NIVEL_META[n].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={search.categoria || "all"} onValueChange={(v) => setSearch({ categoria: v === "all" ? "" : v, tipo: "" })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas categorias</SelectItem>
                    <SelectItem value="FALTAS">Faltas</SelectItem>
                    <SelectItem value="ATESTADOS">Atestados</SelectItem>
                    <SelectItem value="DECLARACOES">Declarações</SelectItem>
                    <SelectItem value="SUSPENSOES">Suspensões</SelectItem>
                    <SelectItem value="ACIDENTES">Acidentes</SelectItem>
                    <SelectItem value="OUTROS">Outros</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={search.tipo || "all"} onValueChange={(v) => setSearch({ tipo: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value="all">Todos tipos</SelectItem>
                    {(tiposQuery.data ?? []).map((t) => (
                      <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={search.situacao || "all"} onValueChange={(v) => setSearch({ situacao: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas situações</SelectItem>
                    <SelectItem value="com_criticos">Com críticos</SelectItem>
                    <SelectItem value="reincidentes">Com reincidentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              icon={Users2}
              label="Colaboradores"
              value={fmtNum(kpis.analisados)}
              hint="Analisados no período"
              accent="primary"
              formula="Total de colaboradores com pelo menos uma ocorrência na janela e visíveis para o seu escopo."
            />
            <KpiCard
              icon={Flame}
              label="Alta + Crítica"
              value={fmtNum(kpis.critAlta)}
              hint={`${kpis.analisados > 0 ? fmtPct((kpis.critAlta / kpis.analisados) * 100) : "0%"} do total`}
              accent="danger"
              formula="Soma de colaboradores classificados como ALTA ou CRÍTICA pelos limiares da configuração vigente."
            />
            <KpiCard
              icon={Gauge}
              label="Score médio"
              value={fmtNum(kpis.scoreMedio, 2)}
              hint="Média dos scores atuais"
              accent="warning"
              formula="Média aritmética do score de todos os colaboradores analisados na janela."
            />
            <KpiCard
              icon={ClipboardList}
              label="Ocorrências"
              value={fmtNum(kpis.ocorCur)}
              delta={delta(kpis.ocorCur, kpis.ocorPrev)}
              invertDelta
              accent="info"
              formula="Total de ausências com data de início na janela atual, comparado à mesma duração anterior."
            />
            <KpiCard
              icon={ClipboardList}
              label="Faltas"
              value={fmtNum(kpis.faltasCur)}
              delta={delta(kpis.faltasCur, kpis.faltasPrev)}
              invertDelta
              accent="danger"
              formula="Ocorrências do tipo FALTA na janela atual vs. mesma duração anterior."
            />
            <KpiCard
              icon={ClipboardList}
              label="Atestados"
              value={fmtNum(kpis.atestCur)}
              delta={delta(kpis.atestCur, kpis.atestPrev)}
              invertDelta
              accent="info"
              formula="Ocorrências do tipo ATESTADO na janela atual vs. mesma duração anterior."
            />
            <KpiCard
              icon={CalendarIcon}
              label="Dias perdidos"
              value={fmtNum(kpis.diasCur)}
              delta={delta(kpis.diasCur, kpis.diasPrev)}
              invertDelta
              accent="warning"
              formula="Soma dos dias das ausências (quantidade calculada) na janela atual vs. anterior."
            />
            <KpiCard
              icon={TrendingUp}
              label="Taxa absenteísmo"
              value={fmtPct(kpis.taxaCur)}
              delta={delta(kpis.taxaCur, kpis.taxaPrev)}
              invertDelta
              accent="warning"
              formula="Dias perdidos ÷ (colaboradores analisados × dias da janela) × 100."
            />
            <KpiCard
              icon={UserCog}
              label="Reincidência"
              value={fmtPct(kpis.reincidePct)}
              hint={`${fmtNum(kpis.reincidentes)} colaboradores`}
              accent="danger"
              formula="Colaboradores com 2 ou mais ocorrências na janela ÷ total analisado × 100."
            />
            <KpiCard
              icon={Timer}
              label="SLA de lançamento"
              value={fmtPct(kpis.slaCur)}
              delta={kpis.slaCur != null && kpis.slaPrev != null ? delta(kpis.slaCur, kpis.slaPrev) : undefined}
              accent="success"
              formula={`% de ausências registradas em até ${SLA_HORAS}h após a data de início.`}
            />
          </div>

          {/* Distribuição + Top colaboradores */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribuição de criticidade</CardTitle>
                <CardDescription className="text-xs">Clique em uma faixa para abrir o ranking filtrado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribuicao}
                        dataKey="qtd"
                        nameKey="label"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        stroke="hsl(var(--background))"
                      >
                        {distribuicao.map((d) => <Cell key={d.nivel} fill={d.color} />)}
                      </Pie>
                      <ReTooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number, _n, item: any) => [`${v} (${item?.payload?.pct?.toFixed(1)}%)`, item?.payload?.label]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {distribuicao.map((d) => (
                    <Link
                      key={d.nivel}
                      {...rankingLink({ nivel: d.nivel })}
                      className="flex items-center justify-between rounded-md border border-transparent px-2 py-1 text-xs transition-colors hover:border-border hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                        <span className="font-medium">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums text-muted-foreground">
                        <span>{d.qtd}</span>
                        <span className="w-14 text-right">{d.pct.toFixed(1)}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2">
              <RankingWidget
                title="Top colaboradores"
                subtitle="Ranking analítico por score de risco"
                icon={Users2}
                items={topColaboradores.map((r) => ({
                  id: r.colaborador_id,
                  title: r.nome_completo,
                  subtitle: `${empresaMap.get(r.empresa_id) ?? "—"} · ${projetoMap.get(r.projeto_id) ?? "—"}`,
                  value: r.score.toFixed(1),
                  badge: NIVEL_META[r.nivel].label,
                  badgeCls: NIVEL_META[r.nivel].badge,
                  href: rankingLink({}),
                }))}
                emptyText="Nenhum colaborador no período."
              />
            </div>
          </div>

          {/* Ranking resumido de supervisores → tela dedicada */}
          <div id="ranking-supervisores" className="scroll-mt-24">
            <RankingWidget
              title="Ranking resumido de supervisores"
              subtitle="Top 5 por % crítico · abra a tela dedicada para o ranking completo"
              icon={UserCog}
              items={topSupervisores.slice(0, 5).map((s) => ({
                id: s.id,
                title: s.nome,
                subtitle: `${s.colabs} colab. · score médio ${s.scoreMedio.toFixed(1)}`,
                value: `${s.pctCritico.toFixed(1)}%`,
                href: supervisorLink({ supervisor: s.id === "__sem__" ? "" : s.id }),
              }))}
              emptyText="Nenhum supervisor no período."
              action={
                <Link
                  to="/inteligencia/supervisores"
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Ver ranking completo →
                </Link>
              }
            />
          </div>



          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Dados agregados a partir do score vigente (SECURITY INVOKER) e das ausências visíveis
            ao seu perfil. Nenhum dado sensível é exposto. Papéis: {roles.join(", ") || "—"}.
          </div>
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

// RankingWidget agora vive em src/components/inteligencia/ranking-widget.tsx
// para reuso pelas telas dedicadas de Inteligência e Ranking de Supervisores.

