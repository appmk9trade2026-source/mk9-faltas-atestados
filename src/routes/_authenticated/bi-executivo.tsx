import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, Calendar as CalendarIcon,
  Database, Download, Info, RefreshCw, Save, Sparkles, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { VariacoesAtipicasTab } from "@/components/bi/variacoes-tab";
import { RecorrenciaTab } from "@/components/bi/recorrencia-tab";
import { exportBI, type ExportFormato } from "@/lib/bi-export";
import { APP_META } from "@/lib/app-meta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/bi-executivo")({
  head: () => ({
    meta: [
      { title: "BI Executivo · CRM MK9" },
      { name: "description", content: "Inteligência executiva de absenteísmo agregada, sem dados pessoais." },
    ],
  }),
  component: BIExecutivoPage,
});

type Granularidade = "DIA" | "SEMANA" | "MES" | "TRIMESTRE" | "ANO";

const CORES = ["#2563eb", "#dc2626", "#16a34a", "#7c3aed", "#ea580c", "#6b7280", "#0891b2", "#db2777"];
const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Filtros = {
  data_inicio: string;
  data_fim: string;
  empresa_ids: string[];
  projeto_ids: string[];
  categoria_ids: string[];
  granularidade: Granularidade;
  comparar_periodo_anterior: boolean;
};

function BIExecutivoPage() {
  const { roles } = useSession();
  const isSuperAdmin = roles.includes("super_admin");
  const isCompliance = roles.includes("compliance");
  const qc = useQueryClient();

  const [filtros, setFiltros] = useState<Filtros>({
    data_inicio: format(subDays(new Date(), 90), "yyyy-MM-dd"),
    data_fim: format(new Date(), "yyyy-MM-dd"),
    empresa_ids: [],
    projeto_ids: [],
    categoria_ids: [],
    granularidade: "MES",
    comparar_periodo_anterior: true,
  });
  const [showMetodologia, setShowMetodologia] = useState(false);
  const [nomeVisao, setNomeVisao] = useState("");
  const [showSalvar, setShowSalvar] = useState(false);

  const empresasQ = useQuery({
    queryKey: ["bi-empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id,nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoriasQ = useQuery({
    queryKey: ["bi-categorias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias_ausencia" as never)
        .select("id, codigo, nome, cor")
        .eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; codigo: string; nome: string; cor: string | null }>;
    },
  });

  const dadosQ = useQuery({
    queryKey: ["bi-consultar", filtros],
    queryFn: async () => {
      const { data, error } = await sb.rpc("bi_executivo_consultar" as never, {
        p_filtros: filtros as never,
      });
      if (error) throw error;
      return data as never;
    },
  });

  const tendenciaQ = useQuery({
    queryKey: ["bi-tendencia", filtros.data_inicio, filtros.data_fim],
    queryFn: async () => {
      const { data, error } = await sb.rpc("bi_analisar_tendencias" as never, {
        p_filtros: { data_inicio: filtros.data_inicio, data_fim: filtros.data_fim } as never,
      });
      if (error) throw error;
      return data as never;
    },
  });

  const healthQ = useQuery({
    queryKey: ["bi-health"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("bi_healthcheck" as never);
      if (error) return null;
      return data as never;
    },
    enabled: isSuperAdmin || isCompliance,
    refetchInterval: 60_000,
  });

  const visoesQ = useQuery({
    queryKey: ["bi-visoes"],
    queryFn: async () => {
      const { data, error } = await sb.from("bi_visoes_salvas" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string; filtros: Filtros; is_padrao: boolean }>;
    },
  });

  const refreshMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("refresh_bi_absenteismo" as never, { p_origem: "MANUAL" as never });
      if (error) throw error;
      return data as never;
    },
    onSuccess: (r) => {
      const rr = r as { status?: string; linhas?: number };
      if (rr?.status === "CONCLUIDO") toast.success(`Camada atualizada · ${rr.linhas ?? 0} linhas`);
      else if (rr?.status === "IGNORADO_POR_LOCK") toast.info("Outra execução em andamento");
      else toast.error("Falha na atualização");
      qc.invalidateQueries({ queryKey: ["bi-consultar"] });
      qc.invalidateQueries({ queryKey: ["bi-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarVisaoMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { error } = await sb.from("bi_visoes_salvas" as never).insert({
        usuario_id: u.user.id, nome: nomeVisao, filtros: filtros as never,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Visão salva");
      setNomeVisao(""); setShowSalvar(false);
      qc.invalidateQueries({ queryKey: ["bi-visoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dados = (dadosQ.data ?? {}) as {
    kpis?: {
      total_ausencias: number; colaboradores_afetados: number; dias_registrados: number;
      horas_estimadas: number; pendentes: number; lancados: number;
      media_dias_por_registro: number | null; taxa_lancamento: number | null;
    };
    serie_temporal?: Array<{ bucket: string; ausencias: number; colaboradores: number; dias: number }>;
    comparativo_periodo_anterior?: {
      variacao_total_pct: number | null; variacao_dias_pct: number | null;
      total_ausencias_anterior: number; base_anterior_zero: boolean;
      periodo_anterior: { inicio: string; fim: string };
    };
    por_empresa?: Array<{ empresa_id: string; empresa_nome: string; ausencias: number; dias: number; colaboradores: number }>;
    por_projeto?: Array<{ projeto_id: string; projeto_nome: string; ausencias: number; dias: number }>;
    por_categoria?: Array<{ categoria_id: string; categoria_nome: string; categoria_codigo: string; cor: string | null; ausencias: number; dias: number }>;
    por_tipo?: Array<{ tipo_ausencia_id: string; tipo_nome: string; ausencias: number; dias: number }>;
    por_dia_semana?: Array<{ dow: number; ausencias: number }>;
    por_mes?: Array<{ ano: number; mes: number; ausencias: number; dias: number }>;
    concentracao?: {
      top5_projetos: Array<{ projeto_nome: string; ausencias: number; participacao_pct: number }>;
      top5_tipos: Array<{ tipo_nome: string; ausencias: number; participacao_pct: number }>;
    };
    qualidade_dados?: { sem_projeto: number; sem_tipo: number; sem_duracao: number; pendentes_totais: number };
  };

  const kpi = dados.kpis;
  const comp = dados.comparativo_periodo_anterior;
  const tend = (tendenciaQ.data ?? {}) as {
    direcao?: string; intensidade?: string | null; variacao_percentual?: number | null;
    qualidade_amostra?: string; pontos_utilizados?: number;
  };

  const health = healthQ.data as { status?: string; ultima_atualizacao?: string | null; idade_minutos?: number | null; linhas_agregadas?: number } | null;

  const serie = useMemo(() => (dados.serie_temporal ?? []).map((s) => ({
    ...s, label: format(new Date(s.bucket), "dd/MM/yy"),
  })), [dados.serie_temporal]);

  const dowData = useMemo(() => {
    const map = new Map<number, number>((dados.por_dia_semana ?? []).map((d) => [d.dow, d.ausencias]));
    return DOW_LABELS.map((l, i) => ({ dia: l, ausencias: map.get(i) ?? 0 }));
  }, [dados.por_dia_semana]);

  const isLoading = dadosQ.isLoading;

  return (
    <AppShell title="BI Executivo">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">BI Executivo de Absenteísmo</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Indicadores agregados, comparativos e tendências · sem dados pessoais
              </p>
              {health && (
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  <Badge variant={health.status === "ATUALIZADO" ? "default" : "secondary"}>
                    Camada: {health.status ?? "—"}
                  </Badge>
                  {health.ultima_atualizacao && (
                    <span className="text-muted-foreground">
                      Última atualização: {format(new Date(health.ultima_atualizacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  )}
                  {typeof health.linhas_agregadas === "number" && (
                    <span className="text-muted-foreground">· {health.linhas_agregadas} linhas</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowMetodologia(true)}>
                <Info className="h-4 w-4 mr-1" /> Metodologia
              </Button>
              <Dialog open={showSalvar} onOpenChange={setShowSalvar}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Save className="h-4 w-4 mr-1" /> Salvar visão</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Salvar visão atual</DialogTitle></DialogHeader>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={nomeVisao} onChange={(e) => setNomeVisao(e.target.value)} placeholder="Ex.: Últimos 90 dias" maxLength={80} />
                  </div>
                  <DialogFooter>
                    <Button onClick={() => salvarVisaoMut.mutate()} disabled={!nomeVisao.trim() || salvarVisaoMut.isPending}>
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {isSuperAdmin && (
                <Button size="sm" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>
                  <RefreshCw className={cn("h-4 w-4 mr-1", refreshMut.isPending && "animate-spin")} />
                  Atualizar dados
                </Button>
              )}
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <FiltroData label="Início" value={filtros.data_inicio} onChange={(v) => setFiltros({ ...filtros, data_inicio: v })} />
            <FiltroData label="Fim" value={filtros.data_fim} onChange={(v) => setFiltros({ ...filtros, data_fim: v })} />
            <div>
              <Label className="text-xs">Empresa</Label>
              <Select value={filtros.empresa_ids[0] ?? "all"} onValueChange={(v) => setFiltros({ ...filtros, empresa_ids: v === "all" ? [] : [v], projeto_ids: [] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {empresasQ.data?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={filtros.categoria_ids[0] ?? "all"} onValueChange={(v) => setFiltros({ ...filtros, categoria_ids: v === "all" ? [] : [v] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categoriasQ.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Granularidade</Label>
              <Select value={filtros.granularidade} onValueChange={(v) => setFiltros({ ...filtros, granularidade: v as Granularidade })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIA">Dia</SelectItem>
                  <SelectItem value="SEMANA">Semana</SelectItem>
                  <SelectItem value="MES">Mês</SelectItem>
                  <SelectItem value="TRIMESTRE">Trimestre</SelectItem>
                  <SelectItem value="ANO">Ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Visões salvas</Label>
              <Select value="" onValueChange={(id) => {
                const v = visoesQ.data?.find((x) => x.id === id);
                if (v) setFiltros({ ...filtros, ...v.filtros });
              }}>
                <SelectTrigger><SelectValue placeholder="Carregar visão" /></SelectTrigger>
                <SelectContent>
                  {(visoesQ.data ?? []).length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhuma visão salva</div>}
                  {visoesQ.data?.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Volume de Ausências" value={kpi?.total_ausencias ?? 0} loading={isLoading} icon={<BarChart3 className="h-4 w-4" />}
            variacao={comp?.variacao_total_pct ?? null} baseZero={comp?.base_anterior_zero}
            tooltip="Contagem de registros no período. Não é 'taxa de absenteísmo' — não há denominador de jornada." />
          <KpiCard title="Colaboradores Afetados" value={kpi?.colaboradores_afetados ?? 0} loading={isLoading} icon={<Users className="h-4 w-4" />}
            tooltip="Colaboradores distintos com pelo menos uma ausência no período." />
          <KpiCard title="Dias Registrados" value={Number(kpi?.dias_registrados ?? 0)} loading={isLoading} icon={<CalendarIcon className="h-4 w-4" />}
            variacao={comp?.variacao_dias_pct ?? null} baseZero={comp?.base_anterior_zero}
            tooltip="Soma de quantidade_dias das ausências. Registros sem duração ficam fora." />
          <KpiCard title="Horas Estimadas" value={Number(kpi?.horas_estimadas ?? 0)} loading={isLoading} icon={<Activity className="h-4 w-4" />}
            tooltip="Estimativa: dias × 8h. Aproximação, sem base de jornada real." />
          <KpiCard title="Média Dias / Registro" value={kpi?.media_dias_por_registro ?? "—"} loading={isLoading} icon={<TrendingUp className="h-4 w-4" />}
            tooltip="dias_registrados / total_ausencias." />
          <KpiCard title="Taxa de Lançamento" value={kpi?.taxa_lancamento != null ? `${kpi.taxa_lancamento}%` : "—"} loading={isLoading} icon={<TrendingUp className="h-4 w-4" />}
            tooltip="LANCADO / total × 100. Representa lançamento pelo RH, não confirmação do cliente." />
          <KpiCard title="Pendentes" value={kpi?.pendentes ?? 0} loading={isLoading} icon={<AlertTriangle className="h-4 w-4" />}
            tooltip="Ausências ainda não lançadas no sistema do cliente." />
          <KpiCard title="Lançados" value={kpi?.lancados ?? 0} loading={isLoading} icon={<Database className="h-4 w-4" />}
            tooltip="Ausências já lançadas no sistema do cliente pelo RH." />
        </div>

        <Tabs defaultValue="evolucao">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="empresas">Empresas & Projetos</TabsTrigger>
            <TabsTrigger value="sazonalidade">Sazonalidade</TabsTrigger>
            <TabsTrigger value="concentracao">Concentração</TabsTrigger>
            <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
            <TabsTrigger value="tendencia">Tendência</TabsTrigger>
          </TabsList>

          <TabsContent value="evolucao" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Evolução histórica</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-72" /> : serie.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={serie}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} />
                      <ReTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="ausencias" stroke="#2563eb" name="Ausências" strokeWidth={2} />
                      <Line type="monotone" dataKey="colaboradores" stroke="#16a34a" name="Colaboradores" strokeWidth={2} />
                      <Line type="monotone" dataKey="dias" stroke="#ea580c" name="Dias" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categorias" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Distribuição por categoria</CardTitle></CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-72" /> : (dados.por_categoria ?? []).length === 0 ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie data={dados.por_categoria} dataKey="ausencias" nameKey="categoria_nome" outerRadius={110} label>
                          {(dados.por_categoria ?? []).map((c, i) => (
                            <Cell key={c.categoria_id ?? i} fill={c.cor ?? CORES[i % CORES.length]} />
                          ))}
                        </Pie>
                        <ReTooltip /><Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Tipos mais frequentes (Top 10)</CardTitle></CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-72" /> : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={(dados.por_tipo ?? []).slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" fontSize={11} />
                        <YAxis type="category" dataKey="tipo_nome" fontSize={10} width={140} />
                        <ReTooltip />
                        <Bar dataKey="ausencias" fill="#2563eb" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="empresas" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Ranking de empresas</CardTitle></CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-72" /> : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={dados.por_empresa ?? []}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="empresa_nome" fontSize={11} />
                        <YAxis fontSize={11} />
                        <ReTooltip />
                        <Bar dataKey="ausencias" fill="#2563eb" name="Ausências" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Ranking de projetos (Top 15)</CardTitle></CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-72" /> : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={(dados.por_projeto ?? []).slice(0, 15)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" fontSize={11} />
                        <YAxis type="category" dataKey="projeto_nome" fontSize={10} width={140} />
                        <ReTooltip />
                        <Bar dataKey="ausencias" fill="#7c3aed" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sazonalidade" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Dia da semana</CardTitle></CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-72" /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={dowData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="dia" fontSize={11} />
                        <YAxis fontSize={11} />
                        <ReTooltip />
                        <Bar dataKey="ausencias" fill="#0891b2" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">Baseado na data de início da ausência. Não interpretar causalidade.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Sazonalidade mensal</CardTitle></CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-72" /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={(dados.por_mes ?? []).map((m) => ({ ...m, label: `${m.mes}/${String(m.ano).slice(2)}` }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} />
                        <ReTooltip />
                        <Bar dataKey="ausencias" fill="#ea580c" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="concentracao" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Top 5 projetos</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(dados.concentracao?.top5_projetos ?? []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{p.projeto_nome ?? "—"}</span>
                      <div className="flex gap-3 items-center text-sm">
                        <span className="font-semibold">{p.ausencias}</span>
                        <Badge variant="secondary">{p.participacao_pct}%</Badge>
                      </div>
                    </div>
                  ))}
                  {(dados.concentracao?.top5_projetos ?? []).length === 0 && <EmptyState />}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Top 5 tipos</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(dados.concentracao?.top5_tipos ?? []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{p.tipo_nome ?? "—"}</span>
                      <div className="flex gap-3 items-center text-sm">
                        <span className="font-semibold">{p.ausencias}</span>
                        <Badge variant="secondary">{p.participacao_pct}%</Badge>
                      </div>
                    </div>
                  ))}
                  {(dados.concentracao?.top5_tipos ?? []).length === 0 && <EmptyState />}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="qualidade" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Qualidade dos dados</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <QualiCard label="Sem projeto" value={dados.qualidade_dados?.sem_projeto ?? 0} />
                  <QualiCard label="Sem tipo" value={dados.qualidade_dados?.sem_tipo ?? 0} />
                  <QualiCard label="Duração não calculável" value={dados.qualidade_dados?.sem_duracao ?? 0} />
                  <QualiCard label="Pendentes acumulados" value={dados.qualidade_dados?.pendentes_totais ?? 0} />
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Contagens agregadas apenas. Correções devem ser feitas nos módulos operacionais.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tendencia" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Análise descritiva de tendência</CardTitle></CardHeader>
              <CardContent>
                {tendenciaQ.isLoading ? <Skeleton className="h-32" /> : (
                  <div className="grid md:grid-cols-4 gap-3">
                    <div className="p-4 border rounded-lg">
                      <div className="text-xs text-muted-foreground">Direção</div>
                      <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                        {tend.direcao === "ALTA" && <TrendingUp className="text-orange-500" />}
                        {tend.direcao === "QUEDA" && <TrendingDown className="text-emerald-500" />}
                        {tend.direcao}
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-xs text-muted-foreground">Intensidade</div>
                      <div className="text-2xl font-bold mt-1">{tend.intensidade ?? "—"}</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-xs text-muted-foreground">Variação</div>
                      <div className="text-2xl font-bold mt-1">{tend.variacao_percentual != null ? `${tend.variacao_percentual}%` : "—"}</div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-xs text-muted-foreground">Amostra</div>
                      <div className="text-2xl font-bold mt-1">{tend.qualidade_amostra}</div>
                      <div className="text-xs text-muted-foreground">{tend.pontos_utilizados} pontos</div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  Análise descritiva. Não constitui previsão futura nem afirma causa.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Metodologia */}
        <Dialog open={showMetodologia} onOpenChange={setShowMetodologia}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Metodologia</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p><strong>Fonte:</strong> agregação diária da tabela <code>ausencias</code> em <code>bi_absenteismo_diario</code>, sem PII.</p>
              <p><strong>Data de referência:</strong> data_inicio da ausência (fallback: created_at).</p>
              <p><strong>Volume de ausências:</strong> contagem de registros. <em>Não é</em> "taxa de absenteísmo" — não há denominador confiável de jornada.</p>
              <p><strong>Dias registrados:</strong> soma de quantidade_dias. Registros sem duração não entram na soma.</p>
              <p><strong>Horas estimadas:</strong> dias × 8h (aproximação).</p>
              <p><strong>Taxa de lançamento:</strong> LANCADO ÷ total × 100. Representa lançamento pelo RH, não confirmação do cliente.</p>
              <p><strong>Tendência:</strong> comparação descritiva primeiro vs. último bucket mensal. Não é previsão.</p>
              <p><strong>Privacidade:</strong> o BI não expõe nomes, matrículas, telefones, e-mails, documentos ou observações.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function FiltroData({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start font-normal">
            <CalendarIcon className="h-3.5 w-3.5 mr-2" />
            {value ? format(new Date(value + "T00:00:00"), "dd/MM/yyyy") : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value ? new Date(value + "T00:00:00") : undefined}
            onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))} initialFocus />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function KpiCard({ title, value, loading, icon, variacao, baseZero, tooltip }: {
  title: string; value: number | string; loading?: boolean; icon?: React.ReactNode;
  variacao?: number | null; baseZero?: boolean; tooltip?: string;
}) {
  const up = typeof variacao === "number" && variacao > 0;
  const down = typeof variacao === "number" && variacao < 0;
  return (
    <TooltipProvider>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">{icon} {title}</div>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {loading ? <Skeleton className="h-8 mt-2" /> : (
            <div className="mt-1">
              <div className="text-2xl font-bold">
                {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
              </div>
              {typeof variacao === "number" && !baseZero && (
                <div className={cn("text-xs mt-1 flex items-center gap-1",
                  up && "text-orange-600", down && "text-emerald-600", !up && !down && "text-muted-foreground")}>
                  {up && <ArrowUp className="h-3 w-3" />} {down && <ArrowDown className="h-3 w-3" />}
                  {variacao > 0 ? "+" : ""}{variacao}% vs período anterior
                </div>
              )}
              {baseZero && <div className="text-xs mt-1 text-muted-foreground">Sem base anterior</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function QualiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 border rounded-lg">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Database className="h-8 w-8 mb-2 opacity-50" />
      <div className="text-sm">Sem dados no período selecionado</div>
    </div>
  );
}
