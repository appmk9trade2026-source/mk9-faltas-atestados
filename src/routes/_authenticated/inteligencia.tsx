// Fase 2 — Ranking Analítico de Colaboradores
// Utiliza exclusivamente as RPCs SECURITY INVOKER existentes:
//   - calcular_score_colaboradores_lote (lista/score)
//   - calcular_score_colaborador (drawer — recomposição pontual)
// Filtros/paginação/ordenação são aplicados no cliente sobre o retorno
// já filtrado por RLS. Categoria/Tipo/Criticidade filtram linhas via
// breakdown já retornado — não recalculam nada.
import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter as FilterIcon,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
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
  peso_falta: number;
  peso_atestado: number;
  peso_declaracao: number;
  peso_suspensao: number;
  peso_acidente_trabalho: number;
  peso_acidente_trajeto: number;
  peso_outros: number;
  peso_dia_perdido: number;
  peso_reincidencia: number;
  janela_dias: number;
  limiar_atencao: number;
  limiar_alta: number;
  limiar_critica: number;
};

// ─── Constants (labels — cores dos badges vêm da config) ─────────────
const NIVEL_META: Record<Nivel, { label: string; dot: string; badge: string; icon: string }> = {
  BAIXA: {
    label: "Baixa",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: "🟢",
  },
  ATENCAO: {
    label: "Atenção",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: "🟡",
  },
  ALTA: {
    label: "Alta",
    dot: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    icon: "🟠",
  },
  CRITICA: {
    label: "Crítica",
    dot: "bg-destructive",
    badge: "bg-destructive/10 text-destructive border-destructive/40",
    icon: "🔴",
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

const PESO_LABEL: Record<keyof Breakdown, string> = {
  faltas: "Faltas injustificadas",
  atestados: "Atestados médicos",
  declaracoes: "Declarações",
  suspensoes: "Suspensões",
  acidente_trabalho: "Acidentes de trabalho",
  acidente_trajeto: "Acidentes de trajeto",
  outros: "Outros",
  dias_perdidos: "Dias perdidos",
  reincidencia_bonus: "Bônus de reincidência",
  janela_dias: "Janela (dias)",
};

const PESO_MAP: Partial<Record<keyof Breakdown, keyof Config>> = {
  faltas: "peso_falta",
  atestados: "peso_atestado",
  declaracoes: "peso_declaracao",
  suspensoes: "peso_suspensao",
  acidente_trabalho: "peso_acidente_trabalho",
  acidente_trajeto: "peso_acidente_trajeto",
  outros: "peso_outros",
  dias_perdidos: "peso_dia_perdido",
};

const PAGE_SIZE = 25;

// ─── Route + search params ───────────────────────────────────────────
const searchSchema = z.object({
  empresa: fallback(z.string(), "").default(""),
  projeto: fallback(z.string(), "").default(""),
  supervisor: fallback(z.string(), "").default(""),
  categoria: fallback(z.string(), "").default(""),
  tipo: fallback(z.string(), "").default(""),
  nivel: fallback(z.string(), "").default(""),
  janela: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number(), 0).default(0),
  sort: fallback(z.string(), "score").default("score"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  det: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({
    meta: [
      { title: "Inteligência de Absenteísmo · CRM MK9" },
      { name: "description", content: "Ranking analítico de colaboradores com score de criticidade e composição." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: InteligenciaPage,
});

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function nivelFromScore(score: number, cfg: Config | null): Nivel {
  if (!cfg) return "BAIXA";
  if (score >= cfg.limiar_critica) return "CRITICA";
  if (score >= cfg.limiar_alta) return "ALTA";
  if (score >= cfg.limiar_atencao) return "ATENCAO";
  return "BAIXA";
}

// ─── Page ────────────────────────────────────────────────────────────
function InteligenciaPage() {
  const { loading, roles } = useSession();
  const scope = useSessionScope();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const isSuperAdmin = roles.includes("super_admin");

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

  // Config (para limiares e composição do score)
  const cfgQuery = useQuery({
    queryKey: ["inteligencia", "config"],
    enabled: scope.ready,
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase
        .from("absenteismo_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração não encontrada");
      return data as Config;
    },
    staleTime: 5 * 60_000,
  });

  // Ranking
  const rankingQuery = useQuery({
    queryKey: [
      "inteligencia",
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

  // Referências para nomes e filtros (respeitam RLS naturalmente)
  const empresasQuery = useQuery({
    queryKey: ["inteligencia", "ref", "empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
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
      const { data, error } = await supabase.rpc("get_supervisores_visiveis");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
    staleTime: 5 * 60_000,
  });


  const tiposQuery = useQuery({
    queryKey: ["inteligencia", "ref", "tipos", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_ausencia")
        .select("id, codigo, nome")
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

  const rows = rankingQuery.data ?? [];

  // Filtragem (categoria/tipo/nivel/supervisor/busca)
  const filtered = React.useMemo(() => {
    const q = search.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (search.supervisor && r.supervisor_usuario_id !== search.supervisor) return false;
      if (search.nivel && r.nivel !== (search.nivel as Nivel)) return false;
      if (search.categoria) {
        const keys = CATEGORIA_BREAKDOWN_KEYS[search.categoria] ?? [];
        const has = keys.some((k) => Number(r.breakdown?.[k] ?? 0) > 0);
        if (!has) return false;
      }
      if (search.tipo) {
        const key = TIPO_BREAKDOWN_KEY[search.tipo];
        if (!key || Number(r.breakdown?.[key] ?? 0) <= 0) return false;
      }
      if (q) {
        const hay =
          `${r.nome_completo} ${r.matricula} ${empresaMap.get(r.empresa_id) ?? ""} ${
            projetoMap.get(r.projeto_id) ?? ""
          } ${supervisorMap.get(r.supervisor_usuario_id ?? "") ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search.supervisor, search.nivel, search.categoria, search.tipo, search.q, empresaMap, projetoMap, supervisorMap]);

  // Ordenação
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = search.dir === "asc" ? 1 : -1;
    const cmp = (a: ScoreRow, b: ScoreRow) => {
      switch (search.sort) {
        case "nome":
          return a.nome_completo.localeCompare(b.nome_completo, "pt-BR") * dir;
        case "empresa":
          return (empresaMap.get(a.empresa_id) ?? "").localeCompare(empresaMap.get(b.empresa_id) ?? "", "pt-BR") * dir;
        case "projeto":
          return (projetoMap.get(a.projeto_id) ?? "").localeCompare(projetoMap.get(b.projeto_id) ?? "", "pt-BR") * dir;
        case "supervisor":
          return (
            (supervisorMap.get(a.supervisor_usuario_id ?? "") ?? "").localeCompare(
              supervisorMap.get(b.supervisor_usuario_id ?? "") ?? "",
              "pt-BR",
            ) * dir
          );
        case "total":
          return (a.total_ocorrencias - b.total_ocorrencias) * dir;
        case "faltas":
          return ((a.breakdown?.faltas ?? 0) - (b.breakdown?.faltas ?? 0)) * dir;
        case "atestados":
          return ((a.breakdown?.atestados ?? 0) - (b.breakdown?.atestados ?? 0)) * dir;
        case "declaracoes":
          return ((a.breakdown?.declaracoes ?? 0) - (b.breakdown?.declaracoes ?? 0)) * dir;
        case "dias":
          return (a.total_dias_perdidos - b.total_dias_perdidos) * dir;
        case "nivel": {
          const order: Record<Nivel, number> = { BAIXA: 0, ATENCAO: 1, ALTA: 2, CRITICA: 3 };
          return (order[a.nivel] - order[b.nivel]) * dir;
        }
        case "ultima": {
          const av = a.ultima_ocorrencia ? new Date(a.ultima_ocorrencia).getTime() : 0;
          const bv = b.ultima_ocorrencia ? new Date(b.ultima_ocorrencia).getTime() : 0;
          return (av - bv) * dir;
        }
        case "score":
        default:
          return (a.score - b.score) * dir;
      }
    };
    arr.sort(cmp);
    return arr;
  }, [filtered, search.sort, search.dir, empresaMap, projetoMap, supervisorMap]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(search.page, totalPages - 1);
  const pageRows = React.useMemo(
    () => sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sorted, currentPage],
  );

  const kpis = React.useMemo(() => {
    const total = sorted.length;
    const criticos = sorted.filter((r) => r.nivel === "CRITICA").length;
    const altos = sorted.filter((r) => r.nivel === "ALTA").length;
    const dias = sorted.reduce((acc, r) => acc + (r.total_dias_perdidos ?? 0), 0);
    return { total, criticos, altos, dias };
  }, [sorted]);

  const selectedRow = React.useMemo(
    () => (search.det ? rows.find((r) => r.colaborador_id === search.det) ?? null : null),
    [rows, search.det],
  );

  const toggleSort = (col: string) => {
    if (search.sort === col) {
      setSearch({ dir: search.dir === "asc" ? "desc" : "asc", page: 0 });
    } else {
      setSearch({ sort: col, dir: "desc", page: 0 });
    }
  };

  const filtrosAtivos =
    !!search.empresa ||
    !!search.projeto ||
    !!search.supervisor ||
    !!search.categoria ||
    !!search.tipo ||
    !!search.nivel ||
    !!search.janela ||
    !!search.q;

  if (loading) {
    return (
      <AppShell title="Inteligência">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Inteligência de Absenteísmo">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">Ranking Analítico</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Análise gerencial para prevenção. Score calculado pela configuração vigente, priorizando
                colaboradores em situação de risco. Esta visão é analítica — não punitiva.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => rankingQuery.refetch()}
                disabled={rankingQuery.isFetching}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", rankingQuery.isFetching && "animate-spin")} />
                Atualizar
              </Button>
              {isSuperAdmin && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/inteligencia/configuracao">
                    <Settings className="h-4 w-4 mr-2" />
                    Configurar pesos
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={Users2} label="Colaboradores analisados" value={kpis.total} />
            <KpiCard icon={AlertTriangle} label="Casos críticos" value={kpis.criticos} tone="critical" />
            <KpiCard icon={TrendingUp} label="Casos altos" value={kpis.altos} tone="warn" />
            <KpiCard icon={Calendar} label="Dias perdidos (janela)" value={kpis.dias} />
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
                          categoria: "",
                          tipo: "",
                          nivel: "",
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
                    placeholder="Buscar por nome, matrícula, empresa…"
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
                  options={(supervisoresQuery.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
                />
                <FilterSelect
                  placeholder="Categoria"
                  value={search.categoria}
                  onChange={(v) => setSearch({ categoria: v })}
                  options={Object.keys(CATEGORIA_BREAKDOWN_KEYS).map((c) => ({
                    value: c,
                    label: c.charAt(0) + c.slice(1).toLowerCase(),
                  }))}
                />
                <FilterSelect
                  placeholder="Tipo"
                  value={search.tipo}
                  onChange={(v) => setSearch({ tipo: v })}
                  options={(tiposQuery.data ?? [])
                    .filter((t) => TIPO_BREAKDOWN_KEY[t.codigo])
                    .map((t) => ({ value: t.codigo, label: t.nome }))}
                />
                <FilterSelect
                  placeholder="Criticidade"
                  value={search.nivel}
                  onChange={(v) => setSearch({ nivel: v })}
                  options={(Object.keys(NIVEL_META) as Nivel[]).map((n) => ({
                    value: n,
                    label: NIVEL_META[n].label,
                  }))}
                />
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
          {scope.isSupervisorOnly && !rankingQuery.isLoading && rows.length === 0 ? (
            <SupervisorEmptyState />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-base">Ranking de colaboradores</CardTitle>
                    <CardDescription>
                      {rankingQuery.isLoading
                        ? "Carregando…"
                        : `${sorted.length} colaborador(es) — ordenado por ${labelForCol(search.sort)}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {rankingQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
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
                            <SortableTh label="Colaborador" col="nome" search={search} onSort={toggleSort} />
                            <SortableTh label="Empresa" col="empresa" search={search} onSort={toggleSort} />
                            <SortableTh label="Projeto" col="projeto" search={search} onSort={toggleSort} />
                            <SortableTh label="Supervisor" col="supervisor" search={search} onSort={toggleSort} />
                            <SortableTh label="Total" col="total" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Faltas" col="faltas" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Atest." col="atestados" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Decl." col="declaracoes" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Dias" col="dias" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Score" col="score" search={search} onSort={toggleSort} align="right" />
                            <SortableTh label="Nível" col="nivel" search={search} onSort={toggleSort} />
                            <SortableTh label="Última" col="ultima" search={search} onSort={toggleSort} />
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((r, idx) => {
                            const meta = NIVEL_META[r.nivel];
                            const position = currentPage * PAGE_SIZE + idx + 1;
                            return (
                              <tr
                                key={r.colaborador_id}
                                className="border-t cursor-pointer transition-colors hover:bg-muted/40"
                                onClick={() => setSearch({ det: r.colaborador_id })}
                              >
                                <td className="py-2.5 px-3 tabular-nums text-muted-foreground">
                                  <RankBadge position={position} />
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-medium">{r.nome_completo}</div>
                                  <div className="text-xs text-muted-foreground">Mat. {r.matricula}</div>
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {empresaMap.get(r.empresa_id) ?? "—"}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {projetoMap.get(r.projeto_id) ?? "—"}
                                </td>
                                <td className="py-2.5 px-3">
                                  <SupervisorCell
                                    supervisorId={r.supervisor_usuario_id}
                                    supervisorMap={supervisorMap}
                                  />
                                </td>

                                <td className="py-2.5 px-3 text-right tabular-nums">{r.total_ocorrencias}</td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {r.breakdown?.faltas ?? 0}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {r.breakdown?.atestados ?? 0}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">
                                  {r.breakdown?.declaracoes ?? 0}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums">{r.total_dias_perdidos}</td>
                                <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                                  {Number(r.score).toFixed(1)}
                                </td>
                                <td className="py-2.5 px-3">
                                  <Badge variant="outline" className={cn("gap-1.5 font-medium border", meta.badge)}>
                                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                                    {meta.label}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground text-xs">
                                  {fmtDate(r.ultima_ocorrencia)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginação */}
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
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages - 1}
                          onClick={() => setSearch({ page: currentPage + 1 })}
                        >
                          Próxima
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Drawer de detalhes */}
        <ColaboradorDrawer
          row={selectedRow}
          cfg={cfgQuery.data ?? null}
          empresaNome={selectedRow ? empresaMap.get(selectedRow.empresa_id) ?? "—" : ""}
          projetoNome={selectedRow ? projetoMap.get(selectedRow.projeto_id) ?? "—" : ""}
          supervisorNome={
            selectedRow ? supervisorMap.get(selectedRow.supervisor_usuario_id ?? "") ?? "—" : ""
          }
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
                "mt-2 text-3xl font-semibold tabular-nums",
                tone === "critical" && "text-destructive",
                tone === "warn" && "text-orange-600 dark:text-orange-400",
              )}
            >
              {value.toLocaleString("pt-BR")}
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg p-2",
              tone === "critical"
                ? "bg-destructive/10 text-destructive"
                : tone === "warn"
                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
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

function labelForCol(c: string): string {
  const map: Record<string, string> = {
    score: "score",
    nome: "nome",
    empresa: "empresa",
    projeto: "projeto",
    supervisor: "supervisor",
    total: "total de ocorrências",
    faltas: "faltas",
    atestados: "atestados",
    declaracoes: "declarações",
    dias: "dias perdidos",
    nivel: "criticidade",
    ultima: "última ocorrência",
  };
  return map[c] ?? c;
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-3">
        <Sparkles className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Nenhum colaborador encontrado</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
        {hasFilters
          ? "Tente ajustar ou limpar os filtros aplicados."
          : "Ainda não há ocorrências suficientes na janela configurada para gerar um ranking."}
      </p>
    </div>
  );
}

// ─── Drawer ──────────────────────────────────────────────────────────
type Occurrence = {
  id: string;
  tipo: string;
  motivo: string | null;
  data_inicio: string;
  data_fim: string | null;
  dias: number | null;
  status: string | null;
  tipo_ausencia_nome: string | null;
};

function ColaboradorDrawer({
  row,
  cfg,
  empresaNome,
  projetoNome,
  supervisorNome,
  onClose,
}: {
  row: ScoreRow | null;
  cfg: Config | null;
  empresaNome: string;
  projetoNome: string;
  supervisorNome: string;
  onClose: () => void;
}) {
  const open = !!row;

  const occurrencesQuery = useQuery({
    queryKey: ["inteligencia", "ocorrencias", row?.colaborador_id],
    enabled: !!row,
    queryFn: async (): Promise<Occurrence[]> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select("id, tipo, motivo, data_inicio, data_fim, dias, status, tipo_ausencia_nome")
        .eq("colaborador_id", row!.colaborador_id)
        .order("data_inicio", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Occurrence[];
    },
    staleTime: 30_000,
  });

  const composicao = React.useMemo(() => {
    if (!row || !cfg) return [] as Array<{ key: keyof Breakdown; label: string; qtd: number; peso: number; contrib: number }>;
    const items: Array<{ key: keyof Breakdown; label: string; qtd: number; peso: number; contrib: number }> = [];
    (Object.keys(PESO_MAP) as Array<keyof Breakdown>).forEach((k) => {
      const cfgKey = PESO_MAP[k];
      if (!cfgKey) return;
      const qtd = Number(row.breakdown?.[k] ?? 0);
      const peso = Number(cfg[cfgKey] ?? 0);
      const contrib = qtd * peso;
      if (qtd > 0) items.push({ key: k, label: PESO_LABEL[k], qtd, peso, contrib });
    });
    const bonus = Number(row.breakdown?.reincidencia_bonus ?? 0);
    if (bonus > 0) {
      items.push({
        key: "reincidencia_bonus",
        label: "Bônus de reincidência",
        qtd: 1,
        peso: bonus,
        contrib: bonus,
      });
    }
    return items.sort((a, b) => b.contrib - a.contrib);
  }, [row, cfg]);

  const totalContrib = composicao.reduce((acc, i) => acc + i.contrib, 0);
  const meta = row ? NIVEL_META[row.nivel] : NIVEL_META.BAIXA;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {row && (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <SheetTitle className="text-xl">{row.nome_completo}</SheetTitle>
                  <SheetDescription>Matrícula {row.matricula}</SheetDescription>
                </div>
                <Badge variant="outline" className={cn("gap-1.5 border", meta.badge)}>
                  <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  {meta.label}
                </Badge>
              </div>
              <Button asChild size="sm" variant="outline" className="self-start">
                <Link
                  to="/inteligencia/colaboradores/$colaboradorId"
                  params={{ colaboradorId: row.colaborador_id }}
                >
                  Abrir perfil analítico completo
                </Link>
              </Button>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Score destaque */}
              <div className="rounded-lg border bg-gradient-to-br from-muted/40 to-transparent p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Score de criticidade</p>
                    <p className="text-4xl font-semibold tabular-nums mt-1">{Number(row.score).toFixed(1)}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{row.total_ocorrencias} ocorrência(s)</div>
                    <div>{row.total_dias_perdidos} dia(s) perdido(s)</div>
                    <div>Janela: {row.breakdown?.janela_dias ?? cfg?.janela_dias ?? "—"} dias</div>
                  </div>
                </div>
              </div>

              {/* Dados básicos */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Vínculos</h3>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <InfoRow icon={Building2} label="Empresa" value={empresaNome} />
                  <InfoRow icon={Trophy} label="Projeto" value={projetoNome} />
                  <InfoRow icon={UserCog} label="Supervisor" value={supervisorNome} />
                  <InfoRow icon={Calendar} label="Última ocorrência" value={fmtDateTime(row.ultima_ocorrencia)} />
                </div>
              </div>

              <Separator />

              {/* Composição do score */}
              <div>
                <h3 className="text-sm font-semibold mb-1">Composição do score</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Fatores que contribuíram, usando os pesos vigentes da configuração.
                </p>
                {composicao.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    Nenhum fator com contribuição positiva na janela.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {composicao.map((c) => {
                      const pct = totalContrib > 0 ? (c.contrib / totalContrib) * 100 : 0;
                      return (
                        <div key={c.key} className="rounded-md border p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{c.label}</span>
                            <span className="tabular-nums font-semibold">+{c.contrib.toFixed(1)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {c.key === "reincidencia_bonus"
                                ? "aplicado"
                                : `${c.qtd} × peso ${c.peso}`}
                            </span>
                            <span className="tabular-nums">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Últimas ocorrências */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Últimas ocorrências</h3>
                {occurrencesQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : (occurrencesQuery.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    Nenhuma ocorrência registrada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(occurrencesQuery.data ?? []).map((o) => (
                      <div key={o.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {o.tipo_ausencia_nome ?? o.tipo}
                          </span>
                          <span className="text-xs text-muted-foreground">{fmtDate(o.data_inicio)}</span>
                        </div>
                        {o.motivo && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.motivo}</p>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          {o.dias != null && <span>{o.dias} dia(s)</span>}
                          {o.status && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                              {o.status}
                            </Badge>
                          )}
                        </div>
                      </div>
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

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
