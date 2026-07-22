// Fase 3 — Ranking Analítico de Supervisores
// Reutiliza calcular_score_colaboradores_lote (SECURITY INVOKER) e agrega
// no cliente por supervisor_usuario_id. RLS já limita as linhas visíveis,
// portanto supervisores enxergam apenas os próprios colaboradores.
// Não recalcula score. Não persiste nada. Não altera RBAC/RLS.
import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter as FilterIcon,
  Gauge,
  RefreshCw,
  Search,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCog,
  Users2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
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

type AusenciaSlaRow = {
  id: string;
  colaborador_id: string;
  data_inicio: string;
  registrado_em: string | null;
  created_at: string;
};

type SupervisorAgg = {
  supervisor_id: string;
  supervisor_nome: string;
  empresas: Set<string>;
  projetos: Set<string>;
  colaboradores_ativos: number;
  total_ocorrencias: number;
  total_faltas: number;
  total_atestados: number;
  total_dias_perdidos: number;
  score_medio: number;
  nivel_equipe: Nivel;
  pct_criticos: number;
  contagem_niveis: Record<Nivel, number>;
  sla_pct: number | null;
  tempo_medio_horas: number | null;
  ultima_atualizacao: string | null;
  rows: ScoreRow[];
};

// SLA: lançamento em até 48h após data_inicio da ocorrência
const SLA_HORAS = 48;
const PAGE_SIZE = 20;

const NIVEL_META: Record<Nivel, { label: string; dot: string; badge: string; order: number }> = {
  BAIXA: {
    label: "Baixa",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    order: 0,
  },
  ATENCAO: {
    label: "Atenção",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    order: 1,
  },
  ALTA: {
    label: "Alta",
    dot: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    order: 2,
  },
  CRITICA: {
    label: "Crítica",
    dot: "bg-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/40",
    order: 3,
  },
};

// ─── Route + search params ───────────────────────────────────────────
const searchSchema = z.object({
  empresa: fallback(z.string(), "").default(""),
  projeto: fallback(z.string(), "").default(""),
  supervisor: fallback(z.string(), "").default(""),
  nivel: fallback(z.string(), "").default(""),
  scoreMin: fallback(z.string(), "").default(""),
  scoreMax: fallback(z.string(), "").default(""),
  situacao: fallback(z.string(), "").default(""),
  janela: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number(), 0).default(0),
  sort: fallback(z.string(), "score").default("score"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  det: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/inteligencia/supervisores")({
  head: () => ({
    meta: [
      { title: "Ranking de Supervisores · CRM MK9" },
      {
        name: "description",
        content: "Ranking analítico de supervisores com indicadores proporcionais de absenteísmo.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: SupervisoresPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function nivelFromScore(score: number, cfg: Config | null): Nivel {
  if (!cfg) return "BAIXA";
  if (score >= cfg.limiar_critica) return "CRITICA";
  if (score >= cfg.limiar_alta) return "ALTA";
  if (score >= cfg.limiar_atencao) return "ATENCAO";
  return "BAIXA";
}

function hoursBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60);
}

// ─── Page ────────────────────────────────────────────────────────────
function SupervisoresPage() {
  const { loading } = useSession();
  const scope = useSessionScope();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = React.useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) => {
      navigate({
        search: (prev: z.infer<typeof searchSchema>) => ({
          ...prev,
          ...patch,
          page: "page" in patch ? (patch.page as number) : 0,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const janelaNum = search.janela ? Number(search.janela) : undefined;

  // Config (limiares)
  const cfgQuery = useQuery({
    queryKey: ["inteligencia", "config"],
    enabled: scope.ready,
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase.from("absenteismo_config").select("*").limit(1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração não encontrada");
      return data as Config;
    },
    staleTime: 5 * 60_000,
  });

  // Score em lote (RLS aplica-se)
  const rankingQuery = useQuery({
    queryKey: [
      "inteligencia",
      "sup",
      "ranking",
      ...scope.keyParts,
      search.empresa || null,
      search.projeto || null,
      janelaNum ?? null,
    ],
    enabled: scope.ready,
    queryFn: async (): Promise<ScoreRow[]> => {
      const { data, error } = await supabase.rpc("calcular_score_colaboradores_lote", {
        _empresa_id: search.empresa || undefined,
        _projeto_id: search.projeto || undefined,
        _janela_dias: janelaNum,
      });
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  // Referências
  const empresasQuery = useQuery({
    queryKey: ["inteligencia", "sup", "ref", "empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const projetosQuery = useQuery({
    queryKey: ["inteligencia", "sup", "ref", "projetos", ...scope.keyParts, search.empresa || null],
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

  const supervisoresRefQuery = useQuery({
    queryKey: ["inteligencia", "sup", "ref", "supervisores", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Ausências para SLA (mesma janela); RLS aplica.
  const janelaEfetiva = janelaNum ?? cfgQuery.data?.janela_dias ?? 90;
  const slaSinceIso = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - janelaEfetiva);
    return d.toISOString();
  }, [janelaEfetiva]);

  const slaQuery = useQuery({
    queryKey: ["inteligencia", "sup", "sla", ...scope.keyParts, janelaEfetiva],
    enabled: scope.ready && !!cfgQuery.data,
    queryFn: async (): Promise<AusenciaSlaRow[]> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select("id, colaborador_id, data_inicio, registrado_em, created_at")
        .gte("data_inicio", slaSinceIso.slice(0, 10));
      if (error) throw error;
      return (data ?? []) as AusenciaSlaRow[];
    },
    staleTime: 60_000,
  });

  const empresaMap = React.useMemo(
    () => new Map((empresasQuery.data ?? []).map((e) => [e.id, e.nome])),
    [empresasQuery.data],
  );
  const projetoMap = React.useMemo(
    () => new Map((projetosQuery.data ?? []).map((p) => [p.id, p.nome])),
    [projetosQuery.data],
  );
  const supervisorNomeMap = React.useMemo(
    () => new Map((supervisoresRefQuery.data ?? []).map((p) => [p.id, p.nome])),
    [supervisoresRefQuery.data],
  );

  // SLA por colaborador
  const slaByColaborador = React.useMemo(() => {
    const map = new Map<string, { total: number; dentro: number; horas: number[] }>();
    for (const a of slaQuery.data ?? []) {
      const ref = a.registrado_em ?? a.created_at;
      if (!ref) continue;
      // horas entre data_inicio (00:00) e o momento do lançamento
      const inicio = new Date(a.data_inicio + "T00:00:00").toISOString();
      const h = hoursBetween(ref, inicio);
      if (h < 0) continue; // lançamento antecipado — ignora
      const entry = map.get(a.colaborador_id) ?? { total: 0, dentro: 0, horas: [] };
      entry.total += 1;
      entry.horas.push(h);
      if (h <= SLA_HORAS) entry.dentro += 1;
      map.set(a.colaborador_id, entry);
    }
    return map;
  }, [slaQuery.data]);

  // Agregação por supervisor
  const aggregates = React.useMemo(() => {
    const cfg = cfgQuery.data ?? null;
    const acc = new Map<string, SupervisorAgg>();

    for (const r of rankingQuery.data ?? []) {
      const sid = r.supervisor_usuario_id ?? "__sem__";
      let a = acc.get(sid);
      if (!a) {
        a = {
          supervisor_id: sid,
          supervisor_nome:
            sid === "__sem__" ? "Sem supervisor" : supervisorNomeMap.get(sid) ?? "Supervisor",
          empresas: new Set(),
          projetos: new Set(),
          colaboradores_ativos: 0,
          total_ocorrencias: 0,
          total_faltas: 0,
          total_atestados: 0,
          total_dias_perdidos: 0,
          score_medio: 0,
          nivel_equipe: "BAIXA",
          pct_criticos: 0,
          contagem_niveis: { BAIXA: 0, ATENCAO: 0, ALTA: 0, CRITICA: 0 },
          sla_pct: null,
          tempo_medio_horas: null,
          ultima_atualizacao: null,
          rows: [],
        };
        acc.set(sid, a);
      }
      a.empresas.add(r.empresa_id);
      a.projetos.add(r.projeto_id);
      a.colaboradores_ativos += 1;
      a.total_ocorrencias += r.total_ocorrencias;
      a.total_faltas += Number(r.breakdown?.faltas ?? 0);
      a.total_atestados += Number(r.breakdown?.atestados ?? 0);
      a.total_dias_perdidos += r.total_dias_perdidos;
      a.contagem_niveis[r.nivel] += 1;
      a.rows.push(r);
      if (r.ultima_ocorrencia) {
        if (!a.ultima_atualizacao || r.ultima_ocorrencia > a.ultima_atualizacao) {
          a.ultima_atualizacao = r.ultima_ocorrencia;
        }
      }
    }

    for (const a of acc.values()) {
      const scoreSum = a.rows.reduce((s, r) => s + Number(r.score), 0);
      a.score_medio = a.colaboradores_ativos > 0 ? scoreSum / a.colaboradores_ativos : 0;
      a.pct_criticos =
        a.colaboradores_ativos > 0
          ? (a.contagem_niveis.CRITICA / a.colaboradores_ativos) * 100
          : 0;
      a.nivel_equipe = nivelFromScore(a.score_medio, cfg);

      // SLA agregado
      let total = 0;
      let dentro = 0;
      const horas: number[] = [];
      for (const r of a.rows) {
        const s = slaByColaborador.get(r.colaborador_id);
        if (!s) continue;
        total += s.total;
        dentro += s.dentro;
        horas.push(...s.horas);
      }
      a.sla_pct = total > 0 ? (dentro / total) * 100 : null;
      a.tempo_medio_horas =
        horas.length > 0 ? horas.reduce((s, h) => s + h, 0) / horas.length : null;
    }

    return Array.from(acc.values());
  }, [rankingQuery.data, cfgQuery.data, supervisorNomeMap, slaByColaborador]);

  // Filtros
  const filtered = React.useMemo(() => {
    const q = search.q.trim().toLowerCase();
    const scoreMin = search.scoreMin ? Number(search.scoreMin) : null;
    const scoreMax = search.scoreMax ? Number(search.scoreMax) : null;
    return aggregates.filter((a) => {
      if (search.supervisor && a.supervisor_id !== search.supervisor) return false;
      if (search.nivel && a.nivel_equipe !== (search.nivel as Nivel)) return false;
      if (search.empresa && !a.empresas.has(search.empresa)) return false;
      if (search.projeto && !a.projetos.has(search.projeto)) return false;
      if (scoreMin != null && a.score_medio < scoreMin) return false;
      if (scoreMax != null && a.score_medio > scoreMax) return false;
      if (search.situacao === "com_criticos" && a.contagem_niveis.CRITICA === 0) return false;
      if (search.situacao === "sem_criticos" && a.contagem_niveis.CRITICA > 0) return false;
      if (search.situacao === "sla_baixo" && (a.sla_pct == null || a.sla_pct >= 80)) return false;
      if (q && !a.supervisor_nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [aggregates, search]);

  // Ordenação
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = search.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (search.sort) {
        case "nome":
          return a.supervisor_nome.localeCompare(b.supervisor_nome, "pt-BR") * dir;
        case "empresas":
          return (a.empresas.size - b.empresas.size) * dir;
        case "projetos":
          return (a.projetos.size - b.projetos.size) * dir;
        case "colabs":
          return (a.colaboradores_ativos - b.colaboradores_ativos) * dir;
        case "total":
          return (a.total_ocorrencias - b.total_ocorrencias) * dir;
        case "faltas":
          return (a.total_faltas - b.total_faltas) * dir;
        case "atestados":
          return (a.total_atestados - b.total_atestados) * dir;
        case "dias":
          return (a.total_dias_perdidos - b.total_dias_perdidos) * dir;
        case "nivel":
          return (NIVEL_META[a.nivel_equipe].order - NIVEL_META[b.nivel_equipe].order) * dir;
        case "pct":
          return (a.pct_criticos - b.pct_criticos) * dir;
        case "sla":
          return ((a.sla_pct ?? -1) - (b.sla_pct ?? -1)) * dir;
        case "tempo":
          return ((a.tempo_medio_horas ?? -1) - (b.tempo_medio_horas ?? -1)) * dir;
        case "ultima": {
          const av = a.ultima_atualizacao ? new Date(a.ultima_atualizacao).getTime() : 0;
          const bv = b.ultima_atualizacao ? new Date(b.ultima_atualizacao).getTime() : 0;
          return (av - bv) * dir;
        }
        case "score":
        default:
          return (a.score_medio - b.score_medio) * dir;
      }
    });
    return arr;
  }, [filtered, search.sort, search.dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(search.page, totalPages - 1);
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // KPIs executivos
  const kpis = React.useMemo(() => {
    const byMaxScore = [...aggregates].sort((a, b) => b.score_medio - a.score_medio)[0] ?? null;
    const byMaxCriticos = [...aggregates].sort(
      (a, b) => b.contagem_niveis.CRITICA - a.contagem_niveis.CRITICA,
    )[0] ?? null;
    const byMaxOcorPer = [...aggregates].sort(
      (a, b) =>
        b.total_ocorrencias / Math.max(1, b.colaboradores_ativos) -
        a.total_ocorrencias / Math.max(1, a.colaboradores_ativos),
    )[0] ?? null;
    const byMaxReinc = [...aggregates].sort((a, b) => {
      const ra = a.rows.reduce((s, r) => s + Number(r.breakdown?.reincidencia_bonus ?? 0), 0);
      const rb = b.rows.reduce((s, r) => s + Number(r.breakdown?.reincidencia_bonus ?? 0), 0);
      return rb - ra;
    })[0] ?? null;
    const byMaxDias = [...aggregates].sort((a, b) => b.total_dias_perdidos - a.total_dias_perdidos)[0] ?? null;
    const bySlaOk = [...aggregates]
      .filter((a) => a.sla_pct != null)
      .sort((a, b) => (b.sla_pct ?? 0) - (a.sla_pct ?? 0))[0] ?? null;
    return { byMaxScore, byMaxCriticos, byMaxOcorPer, byMaxReinc, byMaxDias, bySlaOk };
  }, [aggregates]);

  const selectedAgg = React.useMemo(
    () => (search.det ? aggregates.find((a) => a.supervisor_id === search.det) ?? null : null),
    [aggregates, search.det],
  );

  const toggleSort = (col: string) => {
    if (search.sort === col) setSearch({ dir: search.dir === "asc" ? "desc" : "asc", page: 0 });
    else setSearch({ sort: col, dir: "desc", page: 0 });
  };

  const filtrosAtivos =
    !!search.empresa ||
    !!search.projeto ||
    !!search.supervisor ||
    !!search.nivel ||
    !!search.scoreMin ||
    !!search.scoreMax ||
    !!search.situacao ||
    !!search.janela ||
    !!search.q;

  if (loading) {
    return (
      <AppShell title="Ranking de Supervisores">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ranking de Supervisores">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Trophy className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">Ranking de Supervisores</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Visão gerencial das equipes usando indicadores proporcionais. Score médio, criticidade
                da equipe, SLA de lançamento e reincidência derivados da configuração vigente.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/inteligencia">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Ver colaboradores
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  rankingQuery.refetch();
                  slaQuery.refetch();
                }}
                disabled={rankingQuery.isFetching || slaQuery.isFetching}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4 mr-2",
                    (rankingQuery.isFetching || slaQuery.isFetching) && "animate-spin",
                  )}
                />
                Atualizar
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              icon={Trophy}
              label="Maior score médio"
              value={kpis.byMaxScore?.supervisor_nome ?? "—"}
              sub={kpis.byMaxScore ? kpis.byMaxScore.score_medio.toFixed(1) : "—"}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Equipe mais crítica"
              value={kpis.byMaxCriticos?.supervisor_nome ?? "—"}
              sub={kpis.byMaxCriticos ? `${kpis.byMaxCriticos.contagem_niveis.CRITICA} crítico(s)` : "—"}
              tone="critical"
            />
            <KpiCard
              icon={TrendingUp}
              label="Maior índice de absenteísmo"
              value={kpis.byMaxOcorPer?.supervisor_nome ?? "—"}
              sub={
                kpis.byMaxOcorPer
                  ? `${(kpis.byMaxOcorPer.total_ocorrencias / Math.max(1, kpis.byMaxOcorPer.colaboradores_ativos)).toFixed(2)} / colab.`
                  : "—"
              }
              tone="warn"
            />
            <KpiCard
              icon={TrendingDown}
              label="Maior reincidência"
              value={kpis.byMaxReinc?.supervisor_nome ?? "—"}
              sub={
                kpis.byMaxReinc
                  ? `+${kpis.byMaxReinc.rows
                      .reduce((s, r) => s + Number(r.breakdown?.reincidencia_bonus ?? 0), 0)
                      .toFixed(1)} pts`
                  : "—"
              }
              tone="warn"
            />
            <KpiCard
              icon={Calendar}
              label="Mais dias perdidos"
              value={kpis.byMaxDias?.supervisor_nome ?? "—"}
              sub={kpis.byMaxDias ? `${kpis.byMaxDias.total_dias_perdidos} dia(s)` : "—"}
            />
            <KpiCard
              icon={Gauge}
              label="Maior conformidade SLA"
              value={kpis.bySlaOk?.supervisor_nome ?? "—"}
              sub={kpis.bySlaOk?.sla_pct != null ? `${kpis.bySlaOk.sla_pct.toFixed(0)}%` : "—"}
              tone="ok"
            />
          </div>

          {/* Filtros */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Filtros</CardTitle>
                {filtrosAtivos && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    onClick={() =>
                      navigate({
                        search: () => ({
                          empresa: "",
                          projeto: "",
                          supervisor: "",
                          nivel: "",
                          scoreMin: "",
                          scoreMax: "",
                          situacao: "",
                          janela: "",
                          q: "",
                          page: 0,
                          sort: "score",
                          dir: "desc" as const,
                          det: "",
                        }),
                        replace: true,
                      })
                    }
                  >
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar supervisor…"
                    value={search.q}
                    onChange={(e) => setSearch({ q: e.target.value })}
                    className="pl-9"
                  />
                </div>
                <FilterSelect
                  placeholder="Empresa"
                  value={search.empresa}
                  onChange={(v) => setSearch({ empresa: v, projeto: "" })}
                  options={(empresasQuery.data ?? []).map((e) => ({ value: e.id, label: e.nome }))}
                />
                <FilterSelect
                  placeholder="Projeto"
                  value={search.projeto}
                  onChange={(v) => setSearch({ projeto: v })}
                  options={(projetosQuery.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
                />
                <FilterSelect
                  placeholder="Supervisor"
                  value={search.supervisor}
                  onChange={(v) => setSearch({ supervisor: v })}
                  options={(supervisoresRefQuery.data ?? []).map((p) => ({
                    value: p.id,
                    label: p.nome,
                  }))}
                />
                <FilterSelect
                  placeholder="Criticidade da equipe"
                  value={search.nivel}
                  onChange={(v) => setSearch({ nivel: v })}
                  options={(Object.keys(NIVEL_META) as Nivel[]).map((n) => ({
                    value: n,
                    label: NIVEL_META[n].label,
                  }))}
                />
                <FilterSelect
                  placeholder="Situação"
                  value={search.situacao}
                  onChange={(v) => setSearch({ situacao: v })}
                  options={[
                    { value: "com_criticos", label: "Com colaboradores críticos" },
                    { value: "sem_criticos", label: "Sem colaboradores críticos" },
                    { value: "sla_baixo", label: "SLA abaixo de 80%" },
                  ]}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Score mín."
                    value={search.scoreMin}
                    onChange={(e) => setSearch({ scoreMin: e.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Score máx."
                    value={search.scoreMax}
                    onChange={(e) => setSearch({ scoreMax: e.target.value })}
                  />
                </div>
                <FilterSelect
                  placeholder="Período"
                  value={search.janela}
                  onChange={(v) => setSearch({ janela: v })}
                  options={[
                    { value: "30", label: "Últimos 30 dias" },
                    { value: "60", label: "Últimos 60 dias" },
                    { value: "90", label: "Últimos 90 dias" },
                    { value: "180", label: "Últimos 180 dias" },
                    { value: "365", label: "Últimos 365 dias" },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          {scope.isSupervisorOnly && !rankingQuery.isLoading && aggregates.length === 0 ? (
            <SupervisorEmptyState />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Supervisores</CardTitle>
                <CardDescription>
                  {rankingQuery.isLoading || slaQuery.isLoading
                    ? "Carregando…"
                    : `${sorted.length} supervisor(es) — ordenado por ${labelForCol(search.sort)} · Janela ${janelaEfetiva} dias`}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {rankingQuery.isLoading || slaQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-11 w-full" />
                    ))}
                  </div>
                ) : sorted.length === 0 ? (
                  <EmptyState hasFilters={filtrosAtivos} />
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr className="text-left text-xs uppercase text-muted-foreground">
                            <th className="py-2.5 px-3 w-12">#</th>
                            <SortableTh label="Supervisor" col="nome" search={search} onSort={toggleSort} />
                            <SortableTh label="Empresas" col="empresas" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Projetos" col="projetos" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Colabs" col="colabs" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Total" col="total" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Faltas" col="faltas" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Atest." col="atestados" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Dias" col="dias" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Score médio" col="score" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Nível" col="nivel" search={search} onSort={toggleSort} />
                            <SortableTh label="% Críticos" col="pct" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Tempo méd." col="tempo" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="SLA" col="sla" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Última" col="ultima" search={search} onSort={toggleSort} />
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((a, idx) => {
                            const meta = NIVEL_META[a.nivel_equipe];
                            const position = currentPage * PAGE_SIZE + idx + 1;
                            return (
                              <tr
                                key={a.supervisor_id}
                                className="border-t cursor-pointer transition-colors hover:bg-muted/40"
                                onClick={() => setSearch({ det: a.supervisor_id })}
                              >
                                <td className="py-2.5 px-3 tabular-nums text-muted-foreground">
                                  <RankBadge position={position} />
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-medium">{a.supervisor_nome}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {a.empresas.size === 1
                                      ? empresaMap.get([...a.empresas][0]) ?? "—"
                                      : `${a.empresas.size} empresa(s)`}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.empresas.size}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.projetos.size}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.colaboradores_ativos}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.total_ocorrencias}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.total_faltas}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.total_atestados}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{a.total_dias_perdidos}</td>
                                <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                                  {a.score_medio.toFixed(1)}
                                </td>
                                <td className="py-2.5 px-3">
                                  <Badge variant="outline" className={cn("gap-1.5 border", meta.badge)}>
                                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                                    {meta.label}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {a.pct_criticos.toFixed(0)}%
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                                  {a.tempo_medio_horas != null ? `${a.tempo_medio_horas.toFixed(0)}h` : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <SlaBadge pct={a.sla_pct} />
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground text-xs">
                                  {fmtDate(a.ultima_atualizacao)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between mt-4 text-sm">
                      <div className="text-muted-foreground">
                        Página {currentPage + 1} de {totalPages}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 0}
                          onClick={() => setSearch({ page: currentPage - 1 })}
                        >
                          <ChevronLeft className="h-4 w-4" /> Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages - 1}
                          onClick={() => setSearch({ page: currentPage + 1 })}
                        >
                          Próxima <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Drawer */}
        <SupervisorDrawer
          agg={selectedAgg}
          empresaMap={empresaMap}
          projetoMap={projetoMap}
          slaAusencias={slaQuery.data ?? []}
          onClose={() => setSearch({ det: "" })}
        />
      </TooltipProvider>
    </AppShell>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "critical" | "warn" | "ok";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-sm font-semibold truncate" title={value}>
              {value}
            </p>
            {sub && (
              <p
                className={cn(
                  "text-xs mt-0.5 tabular-nums",
                  tone === "critical"
                    ? "text-destructive"
                    : tone === "warn"
                      ? "text-orange-600 dark:text-orange-400"
                      : tone === "ok"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                )}
              >
                {sub}
              </p>
            )}
          </div>
          <div
            className={cn(
              "rounded-lg p-2 shrink-0",
              tone === "critical"
                ? "bg-destructive/10 text-destructive"
                : tone === "warn"
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  : tone === "ok"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder} (todos)</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortableTh({
  label,
  col,
  search,
  onSort,
  align,
}: {
  label: string;
  col: string;
  search: z.infer<typeof searchSchema>;
  onSort: (c: string) => void;
  align?: "left" | "right";
}) {
  const active = search.sort === col;
  const Arrow = active ? (search.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={cn(
        "py-2.5 px-3 select-none cursor-pointer hover:text-foreground transition-colors",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => onSort(col)}
    >
      <span className={cn("inline-flex items-center gap-1", active && "text-foreground")}>
        {label}
        <Arrow className="h-3 w-3 opacity-60" />
      </span>
    </th>
  );
}

function RankBadge({ position }: { position: number }) {
  if (position === 1) return <span className="text-lg">🥇</span>;
  if (position === 2) return <span className="text-lg">🥈</span>;
  if (position === 3) return <span className="text-lg">🥉</span>;
  return <span>{position}</span>;
}

function SlaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    pct >= 90
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      : pct >= 80
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-destructive/10 text-destructive border-destructive/40";
  return (
    <Badge variant="outline" className={cn("border tabular-nums", tone)}>
      {pct.toFixed(0)}%
    </Badge>
  );
}

function labelForCol(c: string): string {
  const map: Record<string, string> = {
    score: "score médio",
    nome: "supervisor",
    empresas: "empresas",
    projetos: "projetos",
    colabs: "colaboradores",
    total: "total de ocorrências",
    faltas: "faltas",
    atestados: "atestados",
    dias: "dias perdidos",
    nivel: "criticidade",
    pct: "% críticos",
    sla: "SLA",
    tempo: "tempo médio",
    ultima: "última ocorrência",
  };
  return map[c] ?? c;
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-3">
        <Trophy className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Nenhum supervisor encontrado</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
        {hasFilters
          ? "Tente ajustar ou limpar os filtros."
          : "Ainda não há colaboradores com ocorrências suficientes para agregar por supervisor."}
      </p>
    </div>
  );
}

// ─── Drawer ──────────────────────────────────────────────────────────
function SupervisorDrawer({
  agg,
  empresaMap,
  projetoMap,
  slaAusencias,
  onClose,
}: {
  agg: SupervisorAgg | null;
  empresaMap: Map<string, string>;
  projetoMap: Map<string, string>;
  slaAusencias: AusenciaSlaRow[];
  onClose: () => void;
}) {
  const open = !!agg;

  // Distribuição de tipos (agregada a partir do breakdown)
  const distTipos = React.useMemo(() => {
    if (!agg) return [] as Array<{ label: string; value: number }>;
    const acc = {
      Faltas: 0,
      Atestados: 0,
      Declarações: 0,
      Suspensões: 0,
      "Acidentes trab.": 0,
      "Acidentes traj.": 0,
      Outros: 0,
    };
    for (const r of agg.rows) {
      acc.Faltas += Number(r.breakdown?.faltas ?? 0);
      acc.Atestados += Number(r.breakdown?.atestados ?? 0);
      acc.Declarações += Number(r.breakdown?.declaracoes ?? 0);
      acc.Suspensões += Number(r.breakdown?.suspensoes ?? 0);
      acc["Acidentes trab."] += Number(r.breakdown?.acidente_trabalho ?? 0);
      acc["Acidentes traj."] += Number(r.breakdown?.acidente_trajeto ?? 0);
      acc.Outros += Number(r.breakdown?.outros ?? 0);
    }
    return Object.entries(acc)
      .map(([label, value]) => ({ label, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [agg]);

  // Gráfico mensal (últimos 6 meses)
  const mensal = React.useMemo(() => {
    if (!agg) return [] as Array<{ mes: string; total: number }>;
    const colabIds = new Set(agg.rows.map((r) => r.colaborador_id));
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, 0);
    }
    for (const a of slaAusencias) {
      if (!colabIds.has(a.colaborador_id)) continue;
      const d = new Date(a.data_inicio + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([mes, total]) => ({ mes, total }));
  }, [agg, slaAusencias]);

  const maxMensal = Math.max(1, ...mensal.map((m) => m.total));

  const topCriticos = React.useMemo(() => {
    if (!agg) return [];
    return [...agg.rows].sort((a, b) => b.score - a.score).slice(0, 5);
  }, [agg]);

  const totalDist = distTipos.reduce((s, x) => s + x.value, 0);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {agg && (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-xl truncate">{agg.supervisor_nome}</SheetTitle>
                  <SheetDescription>Visão consolidada da equipe</SheetDescription>
                </div>
                <Badge variant="outline" className={cn("gap-1.5 border", NIVEL_META[agg.nivel_equipe].badge)}>
                  <span className={cn("h-2 w-2 rounded-full", NIVEL_META[agg.nivel_equipe].dot)} />
                  {NIVEL_META[agg.nivel_equipe].label}
                </Badge>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniStat icon={Users2} label="Colaboradores" value={agg.colaboradores_ativos} />
                <MiniStat icon={Building2} label="Empresas" value={agg.empresas.size} />
                <MiniStat icon={Trophy} label="Projetos" value={agg.projetos.size} />
                <MiniStat icon={Calendar} label="Dias perdidos" value={agg.total_dias_perdidos} />
                <MiniStat icon={UserCog} label="Ocorrências" value={agg.total_ocorrencias} />
                <MiniStat
                  icon={Sparkles}
                  label="Score médio"
                  value={Number(agg.score_medio.toFixed(1))}
                />
                <MiniStat
                  icon={Timer}
                  label="Tempo médio"
                  value={agg.tempo_medio_horas != null ? `${agg.tempo_medio_horas.toFixed(0)}h` : "—"}
                />
                <MiniStat
                  icon={Gauge}
                  label="SLA"
                  value={agg.sla_pct != null ? `${agg.sla_pct.toFixed(0)}%` : "—"}
                />
              </div>

              <Separator />

              {/* Distribuição de criticidade */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Distribuição de criticidade</h3>
                <div className="space-y-2">
                  {(Object.keys(NIVEL_META) as Nivel[]).map((n) => {
                    const qtd = agg.contagem_niveis[n];
                    const pct = agg.colaboradores_ativos > 0 ? (qtd / agg.colaboradores_ativos) * 100 : 0;
                    return (
                      <div key={n} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", NIVEL_META[n].dot)} />
                            {NIVEL_META[n].label}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {qtd} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", NIVEL_META[n].dot)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Quantidade por tipo de ocorrência */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Ocorrências por tipo</h3>
                {distTipos.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">Sem ocorrências na janela.</p>
                ) : (
                  <div className="space-y-2">
                    {distTipos.map((t) => {
                      const pct = totalDist > 0 ? (t.value / totalDist) * 100 : 0;
                      return (
                        <div key={t.label} className="rounded-md border p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span>{t.label}</span>
                            <span className="tabular-nums font-medium">{t.value}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Gráfico mensal */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Evolução mensal (últimos 6 meses)</h3>
                <div className="flex items-end justify-between gap-2 h-32">
                  {mensal.map((m) => {
                    const h = (m.total / maxMensal) * 100;
                    const [y, mm] = m.mes.split("-");
                    const label = new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("pt-BR", {
                      month: "short",
                    });
                    return (
                      <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex items-end h-full">
                          <div
                            className="w-full bg-primary/70 rounded-t transition-all"
                            style={{ height: `${Math.max(2, h)}%` }}
                            title={`${m.total} ocorrência(s)`}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
                        <span className="text-[10px] tabular-nums font-medium">{m.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Top colaboradores críticos */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Top colaboradores por score</h3>
                {topCriticos.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">Sem colaboradores.</p>
                ) : (
                  <div className="space-y-2">
                    {topCriticos.map((r, i) => {
                      const meta = NIVEL_META[r.nivel];
                      return (
                        <div key={r.colaborador_id} className="flex items-center gap-3 rounded-md border p-2.5">
                          <span className="text-xs font-semibold text-muted-foreground w-5">{i + 1}º</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{r.nome_completo}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.total_ocorrencias} ocorrência(s) · {r.total_dias_perdidos} dia(s)
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("border", meta.badge)}>
                            {Number(r.score).toFixed(1)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Projetos atendidos */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Projetos atendidos</h3>
                <div className="flex flex-wrap gap-2">
                  {[...agg.projetos].map((pid) => (
                    <Badge key={pid} variant="secondary" className="font-normal">
                      {projetoMap.get(pid) ?? "—"}
                    </Badge>
                  ))}
                  {agg.projetos.size === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum projeto vinculado.</p>
                  )}
                </div>
                {agg.empresas.size > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...agg.empresas].map((eid) => (
                      <Badge key={eid} variant="outline" className="font-normal">
                        <Building2 className="h-3 w-3 mr-1" />
                        {empresaMap.get(eid) ?? "—"}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
