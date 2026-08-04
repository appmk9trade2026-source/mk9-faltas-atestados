import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Ban, BriefcaseMedical,
  Calendar as CalendarIcon, CheckCircle2, ClipboardList, Clock, Download,
  FileText, LayoutDashboard, Lightbulb, MessageSquare, RefreshCw, ShieldAlert,
  TrendingDown, TrendingUp, Trophy, Truck, UserRound, Users, X,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategorias, CATEGORIA_CORES, type Categoria } from "@/lib/categorias";
import { useSessionScope } from "@/hooks/use-session-scope";
import { SupervisorEmptyState } from "@/components/supervisor-empty-state";
import { DesempenhoPositivoSection } from "@/components/dashboard/desempenho-positivo";
import { dashboardLayoutV2 } from "@/lib/dashboard-flags";
import { SectionHeader } from "@/components/dashboard/section-header";
import { VisaoGeralKpisGrid } from "@/components/dashboard/visao-geral-kpis";
import { TendenciasChart } from "@/components/dashboard/tendencias-chart";
import { UltimasOcorrencias } from "@/components/dashboard/ultimas-ocorrencias";
import { InsightsAutomaticos } from "@/components/dashboard/insights-automaticos";
import { InsightsResumo } from "@/components/dashboard/insights-resumo";
import { BarrasDistribuicao } from "@/components/dashboard/barras-distribuicao";
import { RankList, RankListCard } from "@/components/dashboard/rank-list";
import { ResumoTabs } from "@/components/dashboard/resumo-tabs";
import {
  AlertasInteligentes,
  useComparativoPeriodoAnterior,
  type FiltroSugerido,
} from "@/components/dashboard/alertas-inteligentes";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · CRM MK9" }] }),
  component: DashboardPage,
});

// ---------- Types
type Preset = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_anterior" | "custom";
type Filters = {
  preset: Preset;
  inicio: string; // yyyy-MM-dd
  fim: string;
  empresa_id?: string;
  projeto_id?: string;
  supervisor?: string;
  tipo?: string;
  status?: string;
  categoria_id?: string;
  tipo_oficial_id?: string;
};
type Kpis = {
  total: number; pendentes: number; lancadas: number;
  faltas: number; atestados: number; declaracoes: number; suspensoes: number;
  acidentes_trabalho: number; acidentes_trajeto: number;
  tempo_medio_lanc_h: number;
  colaboradores_ativos: number;
  comunicacoes_enviadas: number;
  backlog_processamento: number;
  processados_hoje: number;
  tempo_medio_processamento_h: number;
};
type DashboardData = {
  periodo: { inicio: string; fim: string; prev_inicio: string; prev_fim: string };
  kpis: Kpis;
  prev: Kpis;
  por_dia: Array<{ dia: string; total: number; pendentes: number; lancadas: number }>;
  por_empresa: Array<{ empresa_id: string; nome: string; total: number }>;
  por_projeto: Array<{ projeto_id: string; nome: string; total: number }>;
  por_tipo: Array<{ nome: string; total: number }>;
  por_status: Array<{ nome: string; total: number }>;
  top_supervisores: Array<{ nome: string; total: number }>;
  top_colaboradores: Array<{ id: string; nome: string; total: number }>;
  tempo_diario: Array<{ dia: string; horas: number }>;
  heatmap: Array<{ dow: number; total: number }>;
  ultimos: Array<{
    id: string; registrado_em: string; colab_nome: string; empresa_nome: string;
    projeto_nome: string; tipo: string; status: string; data_inicio: string; data_fim: string;
    tipo_oficial_nome?: string | null; tipo_oficial_codigo?: string | null;
  }>;
  top_empresas: Array<{ empresa_id: string; nome: string; total: number }>;
  top_projetos: Array<{ projeto_id: string; nome: string; total: number }>;
  por_categoria: Array<{ categoria_id: string | null; codigo: string | null; nome: string | null; cor: string | null; total: number }>;
  por_tipo_oficial: Array<{ tipo_id: string | null; codigo: string; nome: string; cor: string | null; categoria_id: string | null; total: number }>;
};

// ---------- Helpers
const fmt = (d: Date) => format(d, "yyyy-MM-dd");
function presetRange(p: Preset, custom?: { i: string; f: string }): { i: string; f: string } {
  const today = startOfDay(new Date());
  switch (p) {
    case "hoje": return { i: fmt(today), f: fmt(today) };
    case "ontem": { const y = subDays(today, 1); return { i: fmt(y), f: fmt(y) }; }
    case "7d": return { i: fmt(subDays(today, 6)), f: fmt(today) };
    case "30d": return { i: fmt(subDays(today, 29)), f: fmt(today) };
    case "mes": return { i: fmt(startOfMonth(today)), f: fmt(endOfMonth(today)) };
    case "mes_anterior": {
      const m = subMonths(today, 1);
      return { i: fmt(startOfMonth(m)), f: fmt(endOfMonth(m)) };
    }
    case "custom": return { i: custom?.i ?? fmt(today), f: custom?.f ?? fmt(today) };
  }
}

import { MK9_BRAND, MK9_CHART_EXTENDED } from "@/lib/mk9-palette";
const COLORS = MK9_CHART_EXTENDED;
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function delta(curr: number, prev: number): { pct: number; up: boolean } {
  if (!prev) return { pct: curr > 0 ? 100 : 0, up: curr >= prev };
  const pct = ((curr - prev) / prev) * 100;
  return { pct: Math.round(pct), up: pct >= 0 };
}

// ---------- Page
function DashboardPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const scope = useSessionScope();
  const [filters, setFilters] = useState<Filters>(() => {
    const r = presetRange("30d");
    return { preset: "30d", inicio: r.i, fim: r.f };
  });

  const exportRef = useRef<HTMLDivElement>(null);

  // Lookups for filter dropdowns
  const { data: empresas = [] } = useQuery({
    queryKey: ["dash-empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id,nome").eq("ativo", true).order("nome");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const { data: projetos = [] } = useQuery({
    queryKey: ["dash-projetos", ...scope.keyParts, filters.empresa_id],
    enabled: scope.ready,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id,nome,empresa_id").eq("ativo", true).order("nome");
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      const { data } = await q;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ["dash-categorias", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: fetchCategorias,
    staleTime: 10 * 60_000,
  });

  // Main query — single RPC, auto refresh 60s
  const query = useQuery({
    queryKey: ["dashboard-metrics", ...scope.keyParts, filters],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_metrics", {
        _inicio: filters.inicio,
        _fim: filters.fim,
        _empresa_id: filters.empresa_id,
        _projeto_id: filters.projeto_id,
        _supervisor: filters.supervisor,
        _tipo: filters.tipo as never,
        _status: filters.status as never,
        _categoria_id: filters.categoria_id as never,
      });
      if (error) throw error;
      return data as unknown as DashboardData;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = query.data;

  function setPreset(p: Preset) {
    if (p === "custom") { setFilters((f) => ({ ...f, preset: p })); return; }
    const r = presetRange(p);
    setFilters((f) => ({ ...f, preset: p, inicio: r.i, fim: r.f }));
  }

  // Fase 5 — comparativo do período anterior (mesma RPC homologada, somente leitura)
  const prevQuery = useComparativoPeriodoAnterior({
    enabled: scope.ready && !!data?.periodo,
    keyParts: scope.keyParts,
    periodo: data?.periodo,
    filtros: {
      _empresa_id: filters.empresa_id,
      _projeto_id: filters.projeto_id,
      _supervisor: filters.supervisor,
      _tipo: filters.tipo,
      _status: filters.status,
      _categoria_id: filters.categoria_id,
    },
  });

  function aplicarFiltroAlerta(f: FiltroSugerido) {
    setFilters((prev) => ({
      ...prev,
      ...(f.empresa_id ? { empresa_id: f.empresa_id, projeto_id: undefined } : {}),
      ...(f.projeto_id ? { projeto_id: f.projeto_id } : {}),
      ...(f.supervisor ? { supervisor: f.supervisor } : {}),
      ...(f.status ? { status: f.status } : {}),
    }));
  }

  function clearFilters() {
    const r = presetRange("30d");
    setFilters({ preset: "30d", inicio: r.i, fim: r.f });
  }

  const activeChips = useMemo(() => {
    const chips: Array<{ label: string; onClear: () => void }> = [];
    if (filters.empresa_id) {
      const e = empresas.find((x) => x.id === filters.empresa_id);
      chips.push({ label: `Empresa: ${e?.nome ?? "…"}`, onClear: () => setFilters((f) => ({ ...f, empresa_id: undefined, projeto_id: undefined })) });
    }
    if (filters.projeto_id) {
      const p = projetos.find((x) => x.id === filters.projeto_id);
      chips.push({ label: `Projeto: ${p?.nome ?? "…"}`, onClear: () => setFilters((f) => ({ ...f, projeto_id: undefined })) });
    }
    if (filters.supervisor) chips.push({ label: `Sup: ${filters.supervisor}`, onClear: () => setFilters((f) => ({ ...f, supervisor: undefined })) });
    if (filters.categoria_id) {
      const c = categorias.find((x) => x.id === filters.categoria_id);
      chips.push({ label: `Categoria: ${c?.nome ?? "…"}`, onClear: () => setFilters((f) => ({ ...f, categoria_id: undefined })) });
    }
    if (filters.tipo) chips.push({ label: `Tipo: ${filters.tipo}`, onClear: () => setFilters((f) => ({ ...f, tipo: undefined })) });
    if (filters.status) chips.push({ label: `Status: ${filters.status}`, onClear: () => setFilters((f) => ({ ...f, status: undefined })) });
    return chips;
  }, [filters, empresas, projetos, categorias]);

  // ------- Export helpers
  async function exportPNG() {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: null, scale: 2 });
    const link = document.createElement("a");
    link.download = `dashboard-mk9-${filters.inicio}_${filters.fim}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  async function exportPDF() {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: "#ffffff", scale: 2 });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(img, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`dashboard-mk9-${filters.inicio}_${filters.fim}.pdf`);
  }
  function exportSheet(kind: "xlsx" | "csv") {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.kpis]), "KPIs");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_dia), "PorDia");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_empresa), "PorEmpresa");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_projeto), "PorProjeto");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_categoria ?? []), "PorCategoria");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_tipo_oficial ?? []), "PorTipoOficial");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_tipo), "PorTipo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.top_supervisores), "TopSupervisores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.top_colaboradores), "TopColaboradores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.ultimos), "Ultimos");
    if (kind === "csv") {
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data.ultimos));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dashboard-mk9-${filters.inicio}_${filters.fim}.csv`;
      a.click();
    } else {
      XLSX.writeFile(wb, `dashboard-mk9-${filters.inicio}_${filters.fim}.xlsx`);
    }
  }

  useEffect(() => {
    if (query.isError) toast.error("Falha ao carregar métricas.");
  }, [query.isError]);

  if (pathname !== "/dashboard") {
    return (
      <AppShell title="WhatsApp Admin" breadcrumb={["Comunicações", "WhatsApp"]}>
        <div className="space-y-4">
          <Skeleton className="h-9 w-full max-w-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      </AppShell>
    );
  }

  const supervisorSemDados =
    scope.isSupervisorOnly &&
    !query.isLoading &&
    (!data || (data.kpis?.total ?? 0) === 0);

  return (
    <AppShell title="Dashboard" breadcrumb={["Dashboard"]}>
      {supervisorSemDados && (
        <SupervisorEmptyState
          title="Seu dashboard ainda não tem dados"
          description="Nenhum colaborador está vinculado ao seu usuário. Solicite ao RH ou Super Admin a atribuição administrativa para que os indicadores comecem a aparecer."
        />
      )}
      
      {/* KPIs de Processamento (Fase 2) - Visíveis para RH/Admin */}
      {(roles.includes("admin") || roles.includes("rh") || roles.includes("compliance")) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-50/50 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/60">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <History className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Backlog Administrativo</p>
                <h3 className="text-xl font-bold">{data?.kpis?.backlog_processamento ?? 0}</h3>
                <p className="text-[10px] text-muted-foreground">Registros aguardando Charles</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-50/50 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/60">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Processados Hoje</p>
                <h3 className="text-xl font-bold">{data?.kpis?.processados_hoje ?? 0}</h3>
                <p className="text-[10px] text-muted-foreground">Concluídos pela Central</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-50/50 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/60">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tempo Médio Proc.</p>
                <h3 className="text-xl font-bold">{(data?.kpis?.tempo_medio_processamento_h ?? 0).toFixed(1)}h</h3>
                <p className="text-[10px] text-muted-foreground">Média de conclusão administrativa</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Filters bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Período</label>
            <Select value={filters.preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filters.preset === "custom" && (
            <>
              <DateBtn label="Início" value={filters.inicio} onChange={(v) => setFilters((f) => ({ ...f, inicio: v }))} />
              <DateBtn label="Fim" value={filters.fim} onChange={(v) => setFilters((f) => ({ ...f, fim: v }))} />
            </>
          )}

          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Empresa</label>
            <Select value={filters.empresa_id ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, empresa_id: v === "all" ? undefined : v, projeto_id: undefined }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Projeto</label>
            <Select value={filters.projeto_id ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, projeto_id: v === "all" ? undefined : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria</label>
            <Select
              value={filters.categoria_id ?? "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, categoria_id: v === "all" ? undefined : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.cor ?? CATEGORIA_CORES[c.codigo] ?? "#94a3b8" }} />
                      {c.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo (base)</label>
            <Select value={filters.tipo ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, tipo: v === "all" ? undefined : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="FALTA">Falta</SelectItem>
                <SelectItem value="ATESTADO">Atestado</SelectItem>
                <SelectItem value="DECLARACAO">Declaração</SelectItem>
                <SelectItem value="SUSPENSAO">Suspensão</SelectItem>
                <SelectItem value="OUTROS">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="LANCADO">Lançado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", query.isFetching && "animate-spin")} /> Atualizar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" /> Exportar</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportSheet("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportSheet("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPNG}>Imagem (PNG)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeChips.map((c, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {c.label}
                <button onClick={c.onClear} className="ml-1 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------
          Blocos homologados (Fases 1 e 2) — apenas reposicionados na Fase 3.
          Nenhuma query, RPC, filtro, cálculo ou payload foi alterado.
      ------------------------------------------------------------------- */}
      {(() => {
        const blocoCategorias = (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Distribuição por Categoria">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={(data?.por_categoria ?? []).filter((c) => c.nome)}
                    dataKey="total"
                    nameKey="nome"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    onClick={(d: { categoria_id?: string | null }) =>
                      d.categoria_id && setFilters((f) => ({ ...f, categoria_id: d.categoria_id ?? undefined, tipo_oficial_id: undefined }))
                    }
                    cursor="pointer"
                  >
                    {(data?.por_categoria ?? []).filter((c) => c.nome).map((c, i) => (
                      <Cell key={i} fill={c.cor ?? (c.codigo ? CATEGORIA_CORES[c.codigo] : undefined) ?? COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={filters.categoria_id
              ? `Tipos oficiais — ${categorias.find((c) => c.id === filters.categoria_id)?.nome ?? "Categoria"}`
              : "Tipos oficiais por categoria"}>
              <ResponsiveContainer
                width="100%"
                height={Math.max(280, ((data?.por_tipo_oficial ?? []).length || 1) * 26)}
              >
                <BarChart data={data?.por_tipo_oficial ?? []} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={200} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} cursor="pointer">
                    {(data?.por_tipo_oficial ?? []).map((t, i) => {
                      const cat = categorias.find((c) => c.id === t.categoria_id);
                      const fill = t.cor ?? cat?.cor ?? (cat ? CATEGORIA_CORES[cat.codigo] : undefined) ?? COLORS[i % COLORS.length];
                      return <Cell key={i} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        );

        const chartAusenciasDia = (
          <ChartCard title="Ausências por dia">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.por_dia ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke={MK9_BRAND.primary} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartEmpresa = (
          <ChartCard title="Ausências por empresa">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.por_empresa ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill={MK9_BRAND.primaryDark} radius={[4, 4, 0, 0]}
                  onClick={(d: { empresa_id?: string }) => d.empresa_id && setFilters((f) => ({ ...f, empresa_id: d.empresa_id, projeto_id: undefined }))}
                  cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartProjeto = (
          <ChartCard title="Ausências por projeto">
            <ResponsiveContainer width="100%" height={Math.max(260, (data?.por_projeto?.length ?? 0) * 24)}>
              <BarChart data={data?.por_projeto ?? []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill={MK9_BRAND.primary} radius={[0, 4, 4, 0]}
                  onClick={(d: { projeto_id?: string }) => d.projeto_id && setFilters((f) => ({ ...f, projeto_id: d.projeto_id }))}
                  cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartTipos = (
          <ChartCard title="Tipos de ausência">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data?.por_tipo ?? []} dataKey="total" nameKey="nome"
                  innerRadius={55} outerRadius={90} paddingAngle={2}
                  onClick={(d: { nome?: string }) => d.nome && setFilters((f) => ({ ...f, tipo: d.nome }))}
                  cursor="pointer"
                >
                  {(data?.por_tipo ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartPendLanc = (
          <ChartCard title="Pendentes × Lançadas (por dia)">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.por_dia ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="pendentes" stackId="1" stroke="#f59e0b" fill="#f59e0b33" />
                <Area type="monotone" dataKey="lancadas" stackId="1" stroke="#10b981" fill="#10b98133" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartTempo = (
          <ChartCard title="Tempo médio até lançamento (horas)">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.tempo_diario ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="horas" stroke={MK9_BRAND.primaryDark} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartSupervisores = (
          <ChartCard
            title="Supervisores que exigem atenção"
            description="Ranking calculado pela quantidade de ausências registradas no período selecionado. Indica criticidade, não desempenho."
            tone="atencao"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data?.top_supervisores ?? []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} ocorrência(s)`, "Ausências no período"]} />
                <Bar dataKey="total" name="Ausências no período" fill="#f59e0b" radius={[0, 4, 4, 0]}
                  onClick={(d: { nome?: string }) => d.nome && d.nome !== "(Sem supervisor)" && setFilters((f) => ({ ...f, supervisor: d.nome }))}
                  cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const chartColaboradores = (
          <ChartCard
            title="Colaboradores com maior recorrência"
            description="Ranking calculado pela quantidade de ausências registradas no período selecionado. Indica recorrência, não desempenho."
            tone="critico"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data?.top_colaboradores ?? []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} ocorrência(s)`, "Ausências no período"]} />
                <Bar dataKey="total" name="Ausências no período" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        );

        const heatmapCard = (
          <ChartCard title="Mapa de calor — dia da semana">
            <Heatmap data={data?.heatmap ?? []} />
          </ChartCard>
        );

        const rankCards = (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <RankCard
              title="Empresas com mais ocorrências"
              description="Quantidade de ausências registradas no período selecionado."
              tone="atencao"
              rows={data?.top_empresas ?? []}
            />
            <RankCard
              title="Projetos com mais ocorrências"
              description="Quantidade de ausências registradas no período selecionado."
              tone="atencao"
              rows={data?.top_projetos ?? []}
            />
            <RankCard
              title="Supervisores com mais ocorrências"
              description="Quantidade de ausências registradas no período selecionado. Não representa desempenho."
              tone="atencao"
              rows={data?.top_supervisores.map((s) => ({ nome: s.nome, total: s.total })) ?? []}
            />
          </div>
        );

        const desempenhoPositivo = (
          <DesempenhoPositivoSection
            inicio={filters.inicio}
            fim={filters.fim}
            empresaId={filters.empresa_id}
            projetoId={filters.projeto_id}
          />
        );

        const ultimosLegacy = (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Últimos registros</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.ultimos ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.registrado_em), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                        <TableCell className="text-sm">{r.colab_nome}</TableCell>
                        <TableCell className="text-sm">{r.empresa_nome}</TableCell>
                        <TableCell className="text-sm">{r.projeto_nome}</TableCell>
                        <TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell>
                        <TableCell>
                          <Badge className={r.status === "LANCADO" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!query.isLoading && (data?.ultimos ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Sem registros no período.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );

        // ---------- Layout legado (rollback imediato via feature flag)
        if (!dashboardLayoutV2) {
          return (
            <div ref={exportRef} className="space-y-4">
              <KpisGrid data={data} loading={query.isLoading} />
              {blocoCategorias}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {chartAusenciasDia}
                {chartEmpresa}
                {chartProjeto}
                {chartTipos}
                {chartPendLanc}
                {chartTempo}
                {chartSupervisores}
                {chartColaboradores}
              </div>
              {heatmapCard}
              {rankCards}
              {desempenhoPositivo}
              {ultimosLegacy}
            </div>
          );
        }

        // ---------- Layout executivo V2 (Fase 3 + refinamento Fase 4)
        const insightsInput = {
          kpis: data?.kpis,
          prev: data?.prev,
          top_projetos: data?.top_projetos,
          top_empresas: data?.top_empresas,
          top_supervisores: data?.top_supervisores,
          heatmap: data?.heatmap,
        };

        return (
          <div ref={exportRef} className="space-y-8">
            {/* BLOCO 1 — Visão geral + destaques rápidos */}
            <section aria-labelledby="bloco-visao-geral" className="space-y-4">
              <SectionHeader
                id="bloco-visao-geral"
                title="Visão geral da operação"
                question="Como está a operação?"
                description="Indicadores principais do período selecionado, comparados ao período imediatamente anterior."
                icon={LayoutDashboard}
              />
              <VisaoGeralKpisGrid
                kpis={data?.kpis}
                prev={data?.prev}
                loading={query.isLoading}
                series={{ porDia: data?.por_dia, tempoDiario: data?.tempo_diario }}
              />
              <InsightsResumo input={insightsInput} loading={query.isLoading} />
            </section>

            {/* BLOCO 1.5 — Alertas inteligentes (Fase 5) */}
            <section aria-labelledby="bloco-alertas-inteligentes" className="space-y-4">
              <SectionHeader
                id="bloco-alertas-inteligentes"
                title="Alertas Inteligentes"
                question="O que precisa da minha atenção hoje?"
                description="Situações que merecem acompanhamento imediato."
                icon={ShieldAlert}
                tone="atencao"
              />
              <AlertasInteligentes
                loading={query.isLoading}
                onVerDetalhes={aplicarFiltroAlerta}
                input={{
                  periodoLabel: `${format(new Date(`${filters.inicio}T00:00:00`), "dd/MM/yyyy")} a ${format(new Date(`${filters.fim}T00:00:00`), "dd/MM/yyyy")}`,
                  kpis: data?.kpis,
                  prev: data?.prev,
                  porDia: data?.por_dia,
                  supervisores: data?.top_supervisores,
                  supervisoresPrev: prevQuery.data?.top_supervisores,
                  projetos: data?.top_projetos?.map((p) => ({ id: p.projeto_id, nome: p.nome, total: p.total })),
                  projetosPrev: prevQuery.data?.top_projetos,
                  empresas: data?.top_empresas?.map((e) => ({ id: e.empresa_id, nome: e.nome, total: e.total })),
                  empresasPrev: prevQuery.data?.top_empresas,
                }}
              />
            </section>

            {/* BLOCO 2 — Tendências (gráfico principal único) */}
            <section aria-labelledby="bloco-tendencias" className="space-y-4">
              <SectionHeader
                id="bloco-tendencias"
                title="Tendências da operação"
                question="O que mudou?"
                description="Evolução diária das ausências, pendências e lançamentos. Clique na legenda para ligar ou desligar séries."
                icon={TrendingUp}
              />
              <TendenciasChart porDia={data?.por_dia ?? []} loading={query.isLoading} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Distribuição por categoria"
                  description="Participação de cada categoria nas ocorrências do período."
                >
                  <BarrasDistribuicao
                    loading={query.isLoading}
                    itens={(data?.por_categoria ?? [])
                      .filter((c) => c.nome)
                      .map((c, i) => ({
                        id: c.categoria_id,
                        nome: c.nome as string,
                        total: c.total,
                        cor: c.cor ?? (c.codigo ? CATEGORIA_CORES[c.codigo] : undefined) ?? COLORS[i % COLORS.length],
                      }))}
                    onSelect={(it) =>
                      it.id && setFilters((f) => ({ ...f, categoria_id: it.id ?? undefined, tipo_oficial_id: undefined }))
                    }
                  />
                </ChartCard>

                <ChartCard
                  title="Tipos de ausência"
                  description="Volume por tipo base no período selecionado."
                >
                  <BarrasDistribuicao
                    loading={query.isLoading}
                    itens={(data?.por_tipo ?? []).map((t, i) => ({
                      nome: t.nome,
                      total: t.total,
                      cor: COLORS[i % COLORS.length],
                    }))}
                    onSelect={(it) => setFilters((f) => ({ ...f, tipo: it.nome }))}
                  />
                </ChartCard>
              </div>

              <ChartCard
                title={filters.categoria_id
                  ? `Tipos oficiais — ${categorias.find((c) => c.id === filters.categoria_id)?.nome ?? "Categoria"}`
                  : "Tipos oficiais por categoria"}
                description="Distribuição detalhada por tipo oficial."
              >
                <BarrasDistribuicao
                  loading={query.isLoading}
                  limit={12}
                  itens={(data?.por_tipo_oficial ?? []).map((t, i) => {
                    const cat = categorias.find((c) => c.id === t.categoria_id);
                    return {
                      nome: t.nome,
                      total: t.total,
                      cor: t.cor ?? cat?.cor ?? (cat ? CATEGORIA_CORES[cat.codigo] : undefined) ?? COLORS[i % COLORS.length],
                    };
                  })}
                />
              </ChartCard>
            </section>

            {/* BLOCO 3 — Pontos de atenção (compactado na Fase 4) */}
            <section aria-labelledby="bloco-atencao" className="space-y-4">
              <SectionHeader
                id="bloco-atencao"
                title="Onde devemos agir?"
                question="Quem merece atenção?"
                description="Esses indicadores representam concentração de ocorrências e ajudam a priorizar ações."
                icon={AlertTriangle}
                tone="atencao"
              />

              {/* Linha 1 — Supervisores + Colaboradores */}
              <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
                <RankListCard
                  title="Supervisores que exigem atenção"
                  description="Quantidade de ausências no período. Indica criticidade, não desempenho."
                  tone="atencao"
                  icon={AlertTriangle}
                >
                  <RankList
                    rows={data?.top_supervisores ?? []}
                    tone="atencao"
                    loading={query.isLoading}
                    onSelect={(r) =>
                      r.nome !== "(Sem supervisor)" && setFilters((f) => ({ ...f, supervisor: r.nome }))
                    }
                  />
                </RankListCard>

                <RankListCard
                  title="Colaboradores com maior recorrência"
                  description="Quantidade de ausências no período. Indica recorrência, não desempenho."
                  tone="critico"
                  icon={AlertTriangle}
                >
                  <RankList rows={data?.top_colaboradores ?? []} tone="critico" loading={query.isLoading} />
                </RankListCard>
              </div>

              {/* Linha 2 — Empresas + Projetos */}
              <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
                <RankListCard
                  title="Empresas com mais ocorrências"
                  description="Quantidade de ausências registradas no período selecionado."
                  tone="atencao"
                >
                  <RankList
                    rows={data?.por_empresa.map((e) => ({ id: e.empresa_id, nome: e.nome, total: e.total })) ?? []}
                    tone="atencao"
                    loading={query.isLoading}
                    onSelect={(r) => r.id && setFilters((f) => ({ ...f, empresa_id: r.id, projeto_id: undefined }))}
                  />
                </RankListCard>

                <RankListCard
                  title="Projetos com mais ocorrências"
                  description="Quantidade de ausências registradas no período selecionado."
                  tone="atencao"
                >
                  <RankList
                    rows={data?.por_projeto.map((p) => ({ id: p.projeto_id, nome: p.nome, total: p.total })) ?? []}
                    tone="atencao"
                    loading={query.isLoading}
                    onSelect={(r) => r.id && setFilters((f) => ({ ...f, projeto_id: r.id }))}
                  />
                </RankListCard>
              </div>

              {/* Linha 3 — Mapa de calor em largura total */}
              {heatmapCard}

              {/* Tabelas resumidas agrupadas em abas */}
              <ResumoTabs
                loading={query.isLoading}
                empresas={data?.top_empresas ?? []}
                projetos={data?.top_projetos ?? []}
                supervisores={data?.top_supervisores ?? []}
              />
            </section>

            {/* Componentes homologados mantidos no código, apenas ocultos visualmente na Fase 4.
                Nenhuma lógica, query ou payload foi removida. */}
            <div className="hidden" aria-hidden="true">
              {chartAusenciasDia}
              {chartPendLanc}
              {chartTempo}
              {chartTipos}
              {chartEmpresa}
              {chartProjeto}
              {chartSupervisores}
              {chartColaboradores}
              {blocoCategorias}
              {rankCards}
            </div>


            {/* BLOCO 4 — Desempenho positivo (Fase 2, intacto) */}
            <section aria-labelledby="bloco-positivo" className="space-y-4">
              <SectionHeader
                id="bloco-positivo"
                title="Desempenho positivo"
                question="Quem está performando melhor?"
                description="Indicadores proporcionais de desempenho."
                icon={Trophy}
                tone="positivo"
              />
              {desempenhoPositivo}
            </section>

            {/* BLOCO 5 — Últimas ocorrências */}
            <section aria-labelledby="bloco-ultimas" className="space-y-4">
              <SectionHeader
                id="bloco-ultimas"
                title="Últimas ocorrências"
                question="O que acabou de acontecer?"
                description="Registros mais recentes do período, com busca rápida e filtro de status."
                icon={ClipboardList}
              />
              <UltimasOcorrencias rows={data?.ultimos ?? []} loading={query.isLoading} />
            </section>

            {/* BLOCO 6 — Insights automáticos */}
            <section aria-labelledby="bloco-insights" className="space-y-4">
              <SectionHeader
                id="bloco-insights"
                title="Insights automáticos"
                question="Quais ações devo tomar?"
                description="Leituras geradas por regras determinísticas a partir dos mesmos números exibidos acima."
                icon={Lightbulb}
              />
              <InsightsAutomaticos
                loading={query.isLoading}
                input={{
                  kpis: data?.kpis,
                  prev: data?.prev,
                  top_projetos: data?.top_projetos,
                  top_empresas: data?.top_empresas,
                  top_supervisores: data?.top_supervisores,
                  heatmap: data?.heatmap,
                }}
              />
            </section>
          </div>
        );
      })()}

    </AppShell>
  );
}

// ---------- Sub-components
function DateBtn({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-[150px]">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(new Date(value), "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={new Date(value)} onSelect={(d) => { if (d) { onChange(fmt(d)); setOpen(false); } }} className="pointer-events-auto p-3" initialFocus />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function KpisGrid({ data, loading }: { data?: DashboardData; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }
  const k = data.kpis; const p = data.prev;
  const items = [
    { label: "Colaboradores ativos", value: k.colaboradores_ativos, icon: Users, prev: p.total /* placeholder */, hidePrev: true },
    { label: "Total de ausências", value: k.total, icon: Activity, prev: p.total },
    { label: "Pendentes", value: k.pendentes, icon: Clock, prev: p.pendentes },
    { label: "Lançadas", value: k.lancadas, icon: CheckCircle2, prev: p.lancadas },
    { label: "Faltas", value: k.faltas, icon: Ban, prev: p.faltas },
    { label: "Atestados", value: k.atestados, icon: BriefcaseMedical, prev: p.atestados },
    { label: "Declarações", value: k.declaracoes, icon: FileText, prev: p.declaracoes },
    { label: "Suspensões", value: k.suspensoes, icon: ShieldAlert, prev: p.suspensoes },
    { label: "Acidentes de trabalho", value: k.acidentes_trabalho, icon: AlertTriangle, prev: p.acidentes_trabalho },
    { label: "Acidentes de trajeto", value: k.acidentes_trajeto, icon: Truck, prev: p.acidentes_trajeto },
    { label: "Tempo médio lançamento (h)", value: Math.round(k.tempo_medio_lanc_h * 10) / 10, icon: ClipboardList, prev: p.tempo_medio_lanc_h, inverse: true },
    { label: "Comunicações enviadas", value: k.comunicacoes_enviadas, icon: MessageSquare, prev: p.comunicacoes_enviadas },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => {
        const d = delta(Number(it.value), Number(it.prev ?? 0));
        const good = it.inverse ? !d.up : d.up;
        return (
          <Card key={it.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-muted-foreground">{it.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{it.value}</p>
                </div>
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <it.icon className="h-4 w-4" />
                </div>
              </div>
              {!it.hidePrev && (
                <div className="mt-2 flex items-center gap-1 text-xs">
                  {d.up ? <ArrowUp className={cn("h-3 w-3", good ? "text-emerald-500" : "text-red-500")} />
                        : <ArrowDown className={cn("h-3 w-3", good ? "text-emerald-500" : "text-red-500")} />}
                  <span className={cn("font-medium", good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{Math.abs(d.pct)}%</span>
                  <span className="text-muted-foreground">vs. período anterior</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Tom semântico dos cards: neutro (informação) ou atenção/criticidade. */
type CardTone = "neutro" | "atencao" | "critico";

const TONE_META: Record<CardTone, { card: string; title: string; iconWrap: string }> = {
  neutro: { card: "", title: "", iconWrap: "" },
  atencao: {
    card: "border-amber-500/40",
    title: "text-amber-700 dark:text-amber-400",
    iconWrap: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  critico: {
    card: "border-destructive/40",
    title: "text-destructive",
    iconWrap: "bg-destructive/10 text-destructive",
  },
};

function ChartCard({
  title,
  description,
  tone = "neutro",
  children,
}: {
  title: string;
  description?: string;
  tone?: CardTone;
  children: React.ReactNode;
}) {
  const meta = TONE_META[tone];
  return (
    <Card className={meta.card}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {tone !== "neutro" && (
            <span className={cn("mt-0.5 rounded-md p-1", meta.iconWrap)}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <CardTitle className={cn("text-sm", meta.title)}>{title}</CardTitle>
            {description && (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}


function Heatmap({ data }: { data: Array<{ dow: number; total: number }> }) {
  const map = new Map(data.map((d) => [d.dow, d.total]));
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex flex-wrap gap-3">
      {DOW.map((label, i) => {
        const v = map.get(i) ?? 0;
        const intensity = v / max;
        return (
          <div key={i} className="flex min-w-[80px] flex-1 flex-col items-center rounded-lg border p-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            <div
              className="mt-2 h-10 w-full rounded-md"
              style={{ backgroundColor: `hsl(217 91% ${Math.max(30, 90 - intensity * 60)}% / ${0.15 + intensity * 0.85})` }}
            />
            <span className="mt-2 text-lg font-semibold tabular-nums">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function RankCard({
  title,
  description,
  tone = "neutro",
  rows,
}: {
  title: string;
  description?: string;
  tone?: CardTone;
  rows: Array<{ nome: string; total: number }>;
}) {
  const sum = rows.reduce((a, r) => a + r.total, 0) || 1;
  const meta = TONE_META[tone];
  return (
    <Card className={meta.card}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {tone !== "neutro" && (
            <span className={cn("mt-0.5 rounded-md p-1", meta.iconWrap)}>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <CardTitle className={cn("text-sm", meta.title)}>{title}</CardTitle>
            {description && (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 10).map((r, i) => (
              <TableRow key={`${r.nome}-${i}`}>
                <TableCell className="text-sm">{r.nome}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{r.total}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{Math.round((r.total / sum) * 100)}%</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Sem dados.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
