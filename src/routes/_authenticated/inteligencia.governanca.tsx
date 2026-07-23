// Fase 7 — Governança, Qualidade dos Dados, Eficiência, Auditoria Executiva,
// Insights Executivos e Saúde do Módulo (Super Admin).
//
// Regras de arquitetura (fixadas na Fase 7):
//  • Zero recálculo de score/criticidade — todos os dados vêm de tabelas já existentes.
//  • Zero mudança em RLS/RBAC/absenteismo_config/estrutura do banco.
//  • Todas as consultas usam o cliente autenticado (SECURITY INVOKER + RLS).
//  • Filtros globais compartilhados entre abas via URL (`Route.useSearch`).
//  • Exportação CSV client-side sobre as linhas que o usuário realmente vê.
//  • Painel "Saúde do Módulo" gated para Super Admin (roles.includes("super_admin")).
//  • Preparação para futuras integrações: dataset builders são funções puras
//    (`buildGovernanca`, `buildQualidade`, `buildEficiencia`, `buildAuditoria`,
//    `buildInsights`, `buildSaude`) reutilizáveis por endpoints/exports futuros.

import * as React from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  Activity, AlertTriangle, ArrowRight, BellRing, Building2, CheckCircle2,
  ClipboardList, Clock, Download, Filter as FilterIcon, Gauge, LinkIcon,
  RefreshCw, Search, ShieldCheck, Sparkles, Timer, TrendingDown, TrendingUp,
  UserCog, Users2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { IntelligenceNav } from "@/components/inteligencia/intelligence-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { useServerFn } from "@tanstack/react-start";
import { reconciliarSupervisores, type ReconciliarSupervisoresResultado } from "@/lib/reconciliar-supervisores.functions";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────
type Status = "NOVO" | "EM_ANALISE" | "RESOLVIDO" | "IGNORADO";
type Crit = "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA";

type Alerta = {
  id: string;
  tipo: string;
  escopo: string;
  criticidade: Crit;
  status: Status;
  titulo: string;
  descricao: string;
  colaborador_id: string | null;
  supervisor_usuario_id: string | null;
  projeto_id: string | null;
  empresa_id: string | null;
  responsavel_id: string | null;
  assumido_em: string | null;
  resolvido_em: string | null;
  resolvido_por: string | null;
  detectado_em: string;
  created_at: string;
  updated_at: string;
};

type Evento = {
  id: string;
  alerta_id: string;
  tipo: "CRIADO" | "COMENTARIO" | "STATUS_ALTERADO" | "ATRIBUIDO" | "LIDO";
  usuario_id: string | null;
  comentario: string | null;
  dados: Record<string, unknown>;
  created_at: string;
};

// ─── Route ────────────────────────────────────────────────────────────
const searchSchema = z.object({
  tab:       fallback(z.string(), "fluxo").default("fluxo"),
  periodo:   fallback(z.string(), "30").default("30"),
  empresa:   fallback(z.string(), "").default(""),
  projeto:   fallback(z.string(), "").default(""),
  supervisor:fallback(z.string(), "").default(""),
  status:    fallback(z.string(), "").default(""),
  crit:      fallback(z.string(), "").default(""),
  usuario:   fallback(z.string(), "").default(""),
  q:         fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/inteligencia/governanca")({
  head: () => ({
    meta: [
      { title: "Governança · Inteligência · CRM MK9" },
      { name: "description", content: "Acompanhamento operacional dos alertas do módulo de Inteligência: fluxo, SLA, operação por RH/Supervisor/Empresa/Projeto e auditoria." },
      { property: "og:title", content: "Governança · CRM MK9" },
      { property: "og:description", content: "Painel operacional dos alertas e processos do módulo de Inteligência de Absenteísmo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: GovernancaPage,
});

// ─── Utils ────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms < 0) return "—";
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY_MS) return `${(ms / HOUR_MS).toFixed(1)}h`;
  return `${(ms / DAY_MS).toFixed(1)}d`;
}
function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}
function trend(cur: number, prev: number): "up" | "down" | "flat" {
  if (cur === prev) return "flat";
  return cur > prev ? "up" : "down";
}

// CSV helper — client-side.
function toCSV(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : (v instanceof Date ? v.toISOString() : String(v));
    if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = columns.map((c) => esc(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(";")).join("\n");
  return `${head}\n${body}\n`;
}
function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// SLA por criticidade (horas). Alinhado com Fase 6 (heurística conservadora).
const SLA_HOURS: Record<Crit, number> = { CRITICA: 24, ALTA: 48, ATENCAO: 96, BAIXA: 168 };
function slaMs(c: Crit) { return SLA_HOURS[c] * HOUR_MS; }

// ─── Página ───────────────────────────────────────────────────────────
function GovernancaPage() {
  const { loading, roles } = useSession();
  const scope = useSessionScope();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isSuperAdmin = roles.includes("super_admin");
  const isSupervisorOnly = roles.length > 0 && roles.every((r) => r === "supervisor");

  const setSearch = React.useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) => {
      navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }), replace: true });
    },
    [navigate],
  );

  const periodoDias = Math.max(1, Math.min(365, Number(search.periodo) || 30));
  const sinceIso = React.useMemo(() => new Date(Date.now() - periodoDias * DAY_MS).toISOString(), [periodoDias]);
  const prevSinceIso = React.useMemo(() => new Date(Date.now() - 2 * periodoDias * DAY_MS).toISOString(), [periodoDias]);

  // ── Referenciais ────────────────────────────────────────────────
  const empresasQuery = useQuery({
    queryKey: ["gov", "empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => (await supabase.from("empresas").select("id, nome, ativo").order("nome")).data ?? [],
    staleTime: 5 * 60_000,
  });
  const projetosQuery = useQuery({
    queryKey: ["gov", "projetos", ...scope.keyParts, search.empresa || null],
    enabled: scope.ready,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id, nome, empresa_id, ativo").order("nome");
      if (search.empresa) q = q.eq("empresa_id", search.empresa);
      return (await q).data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const supervisoresQuery = useQuery({
    queryKey: ["gov", "profiles", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => (await supabase.from("profiles").select("id, nome, ativo").order("nome")).data ?? [],
    staleTime: 5 * 60_000,
  });
  const empresaMap = React.useMemo(() => new Map((empresasQuery.data ?? []).map((e) => [e.id as string, e.nome as string])), [empresasQuery.data]);
  const projetoMap = React.useMemo(() => new Map((projetosQuery.data ?? []).map((p) => [p.id as string, p.nome as string])), [projetosQuery.data]);
  const supervisorMap = React.useMemo(() => new Map((supervisoresQuery.data ?? []).map((p) => [p.id as string, p.nome as string])), [supervisoresQuery.data]);

  // ── Alertas (janela + janela anterior, para comparativos) ───────
  const alertasQuery = useQuery({
    queryKey: ["gov", "alertas", ...scope.keyParts, periodoDias],
    enabled: scope.ready,
    queryFn: async (): Promise<Alerta[]> => {
      const { data, error } = await supabase
        .from("inteligencia_alertas")
        .select("*")
        .gte("detectado_em", prevSinceIso)
        .order("detectado_em", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Alerta[];
    },
    staleTime: 30_000,
  });

  // ── Eventos (para auditoria + eficiência) ───────────────────────
  const eventosQuery = useQuery({
    queryKey: ["gov", "eventos", ...scope.keyParts, periodoDias],
    enabled: scope.ready,
    queryFn: async (): Promise<Evento[]> => {
      const { data, error } = await supabase
        .from("inteligencia_alerta_eventos")
        .select("*")
        .gte("created_at", prevSinceIso)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as Evento[];
    },
    staleTime: 30_000,
  });

  // ── Filtro aplicado ─────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    const raw = alertasQuery.data ?? [];
    const q = search.q.trim().toLowerCase();
    return raw.filter((a) => {
      if (new Date(a.detectado_em).toISOString() < sinceIso) return false;
      if (search.empresa && a.empresa_id !== search.empresa) return false;
      if (search.projeto && a.projeto_id !== search.projeto) return false;
      if (search.supervisor && a.supervisor_usuario_id !== search.supervisor) return false;
      if (search.status && a.status !== search.status) return false;
      if (search.crit && a.criticidade !== search.crit) return false;
      if (q && !`${a.titulo} ${a.descricao}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [alertasQuery.data, sinceIso, search]);

  const prevFiltered = React.useMemo(() => {
    const raw = alertasQuery.data ?? [];
    return raw.filter((a) => {
      const iso = new Date(a.detectado_em).toISOString();
      if (iso >= sinceIso) return false;
      if (iso < prevSinceIso) return false;
      if (search.empresa && a.empresa_id !== search.empresa) return false;
      if (search.projeto && a.projeto_id !== search.projeto) return false;
      if (search.supervisor && a.supervisor_usuario_id !== search.supervisor) return false;
      return true;
    });
  }, [alertasQuery.data, sinceIso, prevSinceIso, search.empresa, search.projeto, search.supervisor]);

  const filtrosAtivos = !!(search.empresa || search.projeto || search.supervisor || search.status || search.crit || search.q);

  // ── Datasets (funções puras: futuras integrações reutilizam) ────
  const gov = React.useMemo(() => buildGovernanca(filtered, prevFiltered), [filtered, prevFiltered]);
  const eff = React.useMemo(() => buildEficiencia(filtered, empresaMap, projetoMap, supervisorMap), [filtered, empresaMap, projetoMap, supervisorMap]);
  const insights = React.useMemo(() => buildInsights(filtered, prevFiltered, empresaMap, projetoMap, supervisorMap), [filtered, prevFiltered, empresaMap, projetoMap, supervisorMap]);

  if (loading) {
    return <AppShell title="Governança"><Skeleton className="h-96 w-full" /></AppShell>;
  }

  return (
    <AppShell title="Governança">
      <TooltipProvider delayDuration={250}>
        <div className="space-y-6">
          <IntelligenceNav current="/inteligencia/governanca" />
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2"><ShieldCheck className="h-5 w-5 text-primary" /></div>
                <h1 className="text-2xl font-semibold tracking-tight">Governança</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Acompanhamento operacional dos alertas — fluxo, SLA, operação por RH/Supervisor/Empresa/Projeto e auditoria.
                Métricas estratégicas ficam no <strong>Dashboard Executivo</strong>; integridade de cadastros, em <strong>Qualidade dos Dados</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm"
                onClick={() => { void alertasQuery.refetch(); void eventosQuery.refetch(); }}
                disabled={alertasQuery.isFetching || eventosQuery.isFetching}>
                <RefreshCw className={cn("h-4 w-4 mr-2", (alertasQuery.isFetching || eventosQuery.isFetching) && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </div>

          {/* Filtros globais */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Filtros globais</CardTitle>
                {filtrosAtivos && (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs"
                    onClick={() => setSearch({ empresa:"", projeto:"", supervisor:"", status:"", crit:"", q:"", usuario:"" })}>
                    Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar…" value={search.q} onChange={(e) => setSearch({ q: e.target.value })} className="pl-9" />
                </div>
                <Sel placeholder="Período" allowEmpty={false} value={search.periodo}
                  onChange={(v) => setSearch({ periodo: v || "30" })}
                  options={[{value:"7",label:"7 dias"},{value:"30",label:"30 dias"},{value:"60",label:"60 dias"},{value:"90",label:"90 dias"},{value:"180",label:"180 dias"}]} />
                <Sel placeholder="Empresa" value={search.empresa}
                  onChange={(v) => setSearch({ empresa: v, projeto: "" })}
                  options={(empresasQuery.data ?? []).map((e) => ({ value: e.id as string, label: e.nome as string }))} />
                <Sel placeholder="Projeto" value={search.projeto}
                  onChange={(v) => setSearch({ projeto: v })}
                  options={(projetosQuery.data ?? []).map((p) => ({ value: p.id as string, label: p.nome as string }))} />
                <Sel placeholder="Supervisor" value={search.supervisor}
                  onChange={(v) => setSearch({ supervisor: v })}
                  options={(supervisoresQuery.data ?? []).map((p) => ({ value: p.id as string, label: p.nome as string }))} />
                <Sel placeholder="Status" value={search.status} onChange={(v) => setSearch({ status: v })}
                  options={[{value:"NOVO",label:"Novo"},{value:"EM_ANALISE",label:"Em análise"},{value:"RESOLVIDO",label:"Resolvido"},{value:"IGNORADO",label:"Ignorado"}]} />
                <Sel placeholder="Criticidade" value={search.crit} onChange={(v) => setSearch({ crit: v })}
                  options={[{value:"CRITICA",label:"Crítica"},{value:"ALTA",label:"Alta"},{value:"ATENCAO",label:"Atenção"},{value:"BAIXA",label:"Baixa"}]} />
              </div>
            </CardContent>
          </Card>

          {/* Tabs — foco operacional: Fluxo & SLA · Operação · Auditoria · Saúde */}
          <Tabs value={search.tab} onValueChange={(v) => setSearch({ tab: v })}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="fluxo"><Gauge className="h-4 w-4 mr-1.5" /> Fluxo & SLA</TabsTrigger>
              <TabsTrigger value="operacao"><Timer className="h-4 w-4 mr-1.5" /> Operação</TabsTrigger>
              <TabsTrigger value="auditoria"><ShieldCheck className="h-4 w-4 mr-1.5" /> Auditoria</TabsTrigger>
              {isSuperAdmin && (
                <TabsTrigger value="saude"><Activity className="h-4 w-4 mr-1.5" /> Saúde do Módulo</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="fluxo" className="mt-6">
              <GovernancaTab gov={gov} isLoading={alertasQuery.isLoading} periodoDias={periodoDias} filtered={filtered} />
            </TabsContent>

            <TabsContent value="operacao" className="mt-6">
              <EficienciaTab eff={eff} isLoading={alertasQuery.isLoading} filtered={filtered} eventos={eventosQuery.data ?? []} sinceIso={sinceIso} />
            </TabsContent>

            <TabsContent value="auditoria" className="mt-6">
              <AuditoriaTab
                alertas={filtered}
                eventos={eventosQuery.data ?? []}
                supervisorMap={supervisorMap}
                empresaMap={empresaMap}
                projetoMap={projetoMap}
                usuarioFilter={search.usuario}
                onUsuarioChange={(v) => setSearch({ usuario: v })}
                sinceIso={sinceIso}
                isLoading={alertasQuery.isLoading || eventosQuery.isLoading}
              />
            </TabsContent>

            {isSuperAdmin && (
              <TabsContent value="saude" className="mt-6">
                <SaudeTab scopeReady={scope.ready} keyParts={scope.keyParts} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

// ─── Governança ───────────────────────────────────────────────────────
type GovernancaData = ReturnType<typeof buildGovernanca>;

function buildGovernanca(cur: Alerta[], prev: Alerta[]) {
  const byStatus = (rows: Alerta[]) => ({
    NOVO: rows.filter((r) => r.status === "NOVO").length,
    EM_ANALISE: rows.filter((r) => r.status === "EM_ANALISE").length,
    RESOLVIDO: rows.filter((r) => r.status === "RESOLVIDO").length,
    IGNORADO: rows.filter((r) => r.status === "IGNORADO").length,
  });
  const curS = byStatus(cur);
  const prevS = byStatus(prev);

  const tempoAssumir = avg(
    cur.filter((a) => a.assumido_em)
       .map((a) => new Date(a.assumido_em!).getTime() - new Date(a.detectado_em).getTime()),
  );
  const tempoResolver = avg(
    cur.filter((a) => a.resolvido_em)
       .map((a) => new Date(a.resolvido_em!).getTime() - new Date(a.detectado_em).getTime()),
  );

  const abertos = curS.NOVO + curS.EM_ANALISE;
  const backlog = cur.filter((a) => (a.status === "NOVO" || a.status === "EM_ANALISE")).length;
  const taxaResolucao = pct(curS.RESOLVIDO, cur.length);
  const criticosPendentes = cur.filter((a) => a.criticidade === "CRITICA" && (a.status === "NOVO" || a.status === "EM_ANALISE")).length;

  const now = Date.now();
  const vencidos = cur.filter((a) => {
    if (a.status !== "NOVO" && a.status !== "EM_ANALISE") return false;
    return now - new Date(a.detectado_em).getTime() > slaMs(a.criticidade);
  }).length;

  return {
    total: cur.length,
    prevTotal: prev.length,
    ...curS,
    prevNOVO: prevS.NOVO, prevEM_ANALISE: prevS.EM_ANALISE, prevRESOLVIDO: prevS.RESOLVIDO,
    abertos, backlog, taxaResolucao, criticosPendentes, vencidos,
    tempoAssumir, tempoResolver,
  };
}

function GovernancaTab({ gov, isLoading, periodoDias, filtered }: { gov: GovernancaData; isLoading: boolean; periodoDias: number; filtered: Alerta[] }) {
  if (isLoading) return <Grid><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></Grid>;

  const kpis = [
    { label: "Alertas na janela",  value: gov.total, prev: gov.prevTotal, icon: BellRing },
    { label: "Abertos",            value: gov.abertos, icon: Sparkles, tone: "warn" as const },
    { label: "Em análise",         value: gov.EM_ANALISE, prev: gov.prevEM_ANALISE, icon: Clock },
    { label: "Resolvidos",         value: gov.RESOLVIDO, prev: gov.prevRESOLVIDO, icon: CheckCircle2, tone: "good" as const },
    { label: "Ignorados",          value: gov.IGNORADO, icon: XCircle },
    { label: "Backlog",            value: gov.backlog, icon: ClipboardList, tone: gov.backlog > 0 ? "warn" as const : undefined },
    { label: "Críticos pendentes", value: gov.criticosPendentes, icon: AlertTriangle, tone: gov.criticosPendentes > 0 ? "critical" as const : undefined },
    { label: "Vencidos (SLA)",     value: gov.vencidos, icon: Timer, tone: gov.vencidos > 0 ? "critical" as const : undefined },
    { label: "Taxa de resolução",  valueText: `${gov.taxaResolucao.toFixed(1)}%`, icon: Gauge, tone: gov.taxaResolucao >= 60 ? "good" as const : gov.taxaResolucao >= 30 ? undefined : "warn" as const },
    { label: "Tempo até assumir",  valueText: fmtDuration(gov.tempoAssumir), icon: Timer },
    { label: "Tempo até resolver", valueText: fmtDuration(gov.tempoResolver), icon: Timer },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} icon={k.icon} label={k.label}
            value={k.valueText ?? k.value ?? 0}
            hint={k.prev != null ? `janela anterior: ${k.prev}` : undefined}
            tone={k.tone} />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Distribuição por criticidade × status</CardTitle>
            <CardDescription>Últimos {periodoDias} dias, respeitando os filtros.</CardDescription>
          </div>
          <ExportMenu
            filename={`governanca_${new Date().toISOString().slice(0,10)}`}
            columns={[
              { key: "detectado_em", label: "Detectado" },
              { key: "tipo", label: "Tipo" }, { key: "escopo", label: "Escopo" },
              { key: "criticidade", label: "Criticidade" }, { key: "status", label: "Status" },
              { key: "titulo", label: "Título" },
              { key: "assumido_em", label: "Assumido" }, { key: "resolvido_em", label: "Resolvido" },
            ]}
            rows={filtered.map((a) => ({ ...a }))}
          />
        </CardHeader>
        <CardContent>
          <MatrizCritStatus rows={filtered} />
        </CardContent>
      </Card>
    </div>
  );
}

function MatrizCritStatus({ rows }: { rows: Alerta[] }) {
  const CRITS: Crit[] = ["CRITICA", "ALTA", "ATENCAO", "BAIXA"];
  const STATUSES: Status[] = ["NOVO", "EM_ANALISE", "RESOLVIDO", "IGNORADO"];
  const matrix: Record<Crit, Record<Status, number>> = {} as never;
  CRITS.forEach((c) => { matrix[c] = { NOVO: 0, EM_ANALISE: 0, RESOLVIDO: 0, IGNORADO: 0 }; });
  rows.forEach((r) => { matrix[r.criticidade][r.status] += 1; });
  const max = Math.max(1, ...CRITS.flatMap((c) => STATUSES.map((s) => matrix[c][s])));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="text-left font-medium py-2 pr-3">Criticidade</th>
            {STATUSES.map((s) => <th key={s} className="text-center font-medium py-2 px-2">{STATUS_LBL[s]}</th>)}
            <th className="text-right font-medium py-2 pl-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {CRITS.map((c) => {
            const total = STATUSES.reduce((s, st) => s + matrix[c][st], 0);
            return (
              <tr key={c} className="border-t">
                <td className="py-2 pr-3"><Badge variant="outline" className={cn("border", CRIT_META[c].badge)}>{CRIT_META[c].label}</Badge></td>
                {STATUSES.map((s) => {
                  const v = matrix[c][s];
                  const alpha = v === 0 ? 0 : 0.15 + (v / max) * 0.6;
                  return (
                    <td key={s} className="text-center py-2 px-2 tabular-nums font-medium"
                      style={{ backgroundColor: v ? `hsl(var(--primary) / ${alpha.toFixed(2)})` : undefined }}>
                      {v || "—"}
                    </td>
                  );
                })}
                <td className="py-2 pl-3 text-right tabular-nums font-semibold">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Qualidade dos Dados ──────────────────────────────────────────────
function QualidadeTab({ scopeReady, keyParts, isSupervisorOnly, canReconciliar }: { scopeReady: boolean; keyParts: readonly string[]; isSupervisorOnly: boolean; canReconciliar: boolean }) {
  const q = useQuery({
    queryKey: ["gov", "qualidade", ...keyParts],
    enabled: scopeReady,
    queryFn: async () => {
      const [empresas, projetos, colaboradores, supervisores, usuarioProj] = await Promise.all([
        supabase.from("empresas").select("id, nome, ativo"),
        supabase.from("projetos").select("id, nome, empresa_id, ativo"),
        supabase.from("colaboradores").select("id, nome_completo, ativo, empresa_id, projeto_id, supervisor_usuario_id"),
        supabase.from("profiles").select("id, nome, ativo"),
        supabase.from("usuario_projetos").select("user_id, projeto_id"),
      ]);
      if (empresas.error) throw empresas.error;
      if (projetos.error) throw projetos.error;
      if (colaboradores.error) throw colaboradores.error;
      if (supervisores.error) throw supervisores.error;
      if (usuarioProj.error) throw usuarioProj.error;
      return {
        empresas: empresas.data ?? [],
        projetos: projetos.data ?? [],
        colaboradores: colaboradores.data ?? [],
        supervisores: supervisores.data ?? [],
        usuarioProj: usuarioProj.data ?? [],
      };
    },
    staleTime: 60_000,
  });

  if (isSupervisorOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restrito</CardTitle>
          <CardDescription>Qualidade dos dados agrega toda a organização — disponível para RH, Compliance e Super Admin.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (q.isLoading) return <Grid><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></Grid>;
  if (q.isError) return <ErrorCard message={(q.error as Error)?.message ?? "Falha ao carregar qualidade dos dados."} />;

  const { empresas, projetos, colaboradores, supervisores } = q.data!;
  const empresasAtivas = empresas.filter((e) => e.ativo);
  const projetosAtivos = projetos.filter((p) => p.ativo);
  const colabAtivos = colaboradores.filter((c) => c.ativo);
  const supActivos = supervisores.filter((s) => s.ativo);

  const projByEmpresa = new Map<string, number>();
  projetosAtivos.forEach((p) => projByEmpresa.set(p.empresa_id as string, (projByEmpresa.get(p.empresa_id as string) ?? 0) + 1));

  const supComEquipe = new Set(colabAtivos.map((c) => c.supervisor_usuario_id).filter(Boolean) as string[]);
  const projComSup = new Set(colabAtivos.filter((c) => c.projeto_id && c.supervisor_usuario_id).map((c) => c.projeto_id as string));

  const cards: Array<{
    id: string; label: string; count: number; hint: string;
    severity: "info" | "warn" | "critical";
    link?: { to: string; label: string };
    sample?: string[];
  }> = [
    {
      id: "colab_sem_supervisor",
      label: "Colaboradores sem supervisor",
      count: colabAtivos.filter((c) => !c.supervisor_usuario_id).length,
      hint: "Ativos sem supervisor_usuario_id — não recebem alertas via supervisor.",
      severity: colabAtivos.filter((c) => !c.supervisor_usuario_id).length > 0 ? "warn" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
      sample: colabAtivos.filter((c) => !c.supervisor_usuario_id).slice(0, 5).map((c) => c.nome_completo as string),
    },
    {
      id: "colab_sem_empresa",
      label: "Colaboradores sem empresa",
      count: colabAtivos.filter((c) => !c.empresa_id).length,
      hint: "Vínculo empresa ausente.",
      severity: colabAtivos.filter((c) => !c.empresa_id).length > 0 ? "critical" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "colab_sem_projeto",
      label: "Colaboradores sem projeto",
      count: colabAtivos.filter((c) => !c.projeto_id).length,
      hint: "Sem projeto — não entram em rankings por projeto.",
      severity: colabAtivos.filter((c) => !c.projeto_id).length > 0 ? "warn" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "sup_sem_equipe",
      label: "Supervisores ativos sem equipe",
      count: supActivos.filter((s) => !supComEquipe.has(s.id as string)).length,
      hint: "Perfis ativos sem colaboradores atribuídos.",
      severity: "info",
      link: { to: "/usuarios", label: "Gerenciar usuários" },
      sample: supActivos.filter((s) => !supComEquipe.has(s.id as string)).slice(0, 5).map((s) => s.nome as string),
    },
    {
      id: "proj_sem_sup",
      label: "Projetos ativos sem supervisor",
      count: projetosAtivos.filter((p) => !projComSup.has(p.id as string)).length,
      hint: "Nenhum colaborador ativo do projeto tem supervisor definido.",
      severity: projetosAtivos.filter((p) => !projComSup.has(p.id as string)).length > 0 ? "warn" : "info",
      link: { to: "/configuracoes", label: "Configurações" },
      sample: projetosAtivos.filter((p) => !projComSup.has(p.id as string)).slice(0, 5).map((p) => p.nome as string),
    },
    {
      id: "emp_sem_proj",
      label: "Empresas ativas sem projetos ativos",
      count: empresasAtivas.filter((e) => !projByEmpresa.get(e.id as string)).length,
      hint: "Empresa ativa sem projetos operacionais.",
      severity: "info",
      link: { to: "/configuracoes", label: "Configurações" },
      sample: empresasAtivas.filter((e) => !projByEmpresa.get(e.id as string)).slice(0, 5).map((e) => e.nome as string),
    },
    {
      id: "colab_projeto_orfao",
      label: "Colaboradores em projeto inativo",
      count: colabAtivos.filter((c) => c.projeto_id && !projetosAtivos.find((p) => p.id === c.projeto_id)).length,
      hint: "Registros órfãos — projeto inativo ou removido.",
      severity: colabAtivos.filter((c) => c.projeto_id && !projetosAtivos.find((p) => p.id === c.projeto_id)).length > 0 ? "critical" : "info",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "colab_empresa_inconsistente",
      label: "Vínculos empresa × projeto inconsistentes",
      count: colabAtivos.filter((c) => {
        if (!c.projeto_id) return false;
        const proj = projetos.find((p) => p.id === c.projeto_id);
        return proj && c.empresa_id && proj.empresa_id !== c.empresa_id;
      }).length,
      hint: "Empresa do colaborador difere da empresa do projeto.",
      severity: "critical",
      link: { to: "/colaboradores", label: "Abrir Colaboradores" },
    },
    {
      id: "colab_dup",
      label: "Possíveis colaboradores duplicados",
      count: (() => {
        const map = new Map<string, number>();
        colabAtivos.forEach((c) => {
          const key = `${(c.nome_completo as string).trim().toLowerCase()}::${c.empresa_id ?? ""}`;
          map.set(key, (map.get(key) ?? 0) + 1);
        });
        return Array.from(map.values()).filter((n) => n > 1).length;
      })(),
      hint: "Mesmo nome dentro da mesma empresa (ativos).",
      severity: "warn",
      link: { to: "/colaboradores", label: "Revisar colaboradores" },
    },
  ];

  const rows = cards.map((c) => ({
    indicador: c.label, quantidade: c.count, criticidade: c.severity, exemplos: (c.sample ?? []).join(" · "),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        {canReconciliar && (
          <Link
            to="/colaboradores_/reprocessar-supervisores"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            Reprocessar por planilha
          </Link>
        )}
        {canReconciliar && <ReconciliarSupervisoresButton keyParts={keyParts} />}
        <ExportMenu filename={`qualidade_${new Date().toISOString().slice(0,10)}`}
          rows={rows}
          columns={[
            { key: "indicador", label: "Indicador" },
            { key: "quantidade", label: "Quantidade" },
            { key: "criticidade", label: "Criticidade" },
            { key: "exemplos", label: "Exemplos" },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <QualidadeCard key={c.id} {...c} />
        ))}
      </div>
    </div>
  );
}

function ReconciliarSupervisoresButton({ keyParts }: { keyParts: readonly string[] }) {
  const call = useServerFn(reconciliarSupervisores);
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<ReconciliarSupervisoresResultado | null>(null);

  async function run() {
    setLoading(true);
    try {
      const r = await call();
      setReport(r);
      toast.success(`Reconciliação concluída — ${r.atualizados} de ${r.processados} vínculos preenchidos.`);
      await qc.invalidateQueries({ queryKey: ["gov", "qualidade", ...keyParts] });
      await qc.invalidateQueries({ queryKey: ["inteligencia"] });
      await qc.invalidateQueries({ queryKey: ["colaboradores"] });
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao reconciliar supervisores.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const header = ["colaborador_id", "matricula", "email", "motivo"];
    const lines = [header.join(";")].concat(
      report.detalhes.map((d) =>
        [d.colaborador_id, d.matricula ?? "", d.email ?? "", d.motivo]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"),
      ),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliacao_supervisores_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      {report && (
        <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary">Processados {report.processados}</Badge>
          <Badge variant="default">Atualizados {report.atualizados}</Badge>
          {report.inexistente > 0 && <Badge variant="outline">Inexistente {report.inexistente}</Badge>}
          {report.sem_papel_supervisor > 0 && <Badge variant="outline">Sem papel {report.sem_papel_supervisor}</Badge>}
          {report.duplicidade > 0 && <Badge variant="outline">Duplicidade {report.duplicidade}</Badge>}
          {report.email_vazio > 0 && <Badge variant="outline">E-mail vazio {report.email_vazio}</Badge>}
          {report.email_invalido > 0 && <Badge variant="outline">E-mail inválido {report.email_invalido}</Badge>}
          {report.detalhes.length > 0 && (
            <Button size="sm" variant="ghost" onClick={exportCsv} className="h-7 px-2">
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          )}
        </div>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
            {loading ? "Reconciliando…" : "Reconciliar Supervisores"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Percorre colaboradores sem supervisor vinculado e preenche <code>supervisor_usuario_id</code>
          pelo e-mail do supervisor, somente quando existe um perfil ativo com papel Supervisor correspondente.
          Nada mais é alterado.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}


function QualidadeCard({ label, count, hint, severity, link, sample }: {
  label: string; count: number; hint: string;
  severity: "info" | "warn" | "critical";
  link?: { to: string; label: string };
  sample?: string[];
}) {
  const tone =
    count === 0 ? "text-emerald-600 dark:text-emerald-400" :
    severity === "critical" ? "text-destructive" :
    severity === "warn" ? "text-amber-600 dark:text-amber-400" :
    "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <Tooltip><TooltipTrigger asChild><ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" /></TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn("text-3xl font-semibold tabular-nums", tone)}>{count.toLocaleString("pt-BR")}</div>
        {sample && sample.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {sample.map((s) => <li key={s} className="truncate">• {s}</li>)}
          </ul>
        )}
        {link && count > 0 && (
          <Button asChild size="sm" variant="ghost" className="border w-full justify-between">
            <Link to={link.to}>{link.label} <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        )}
        {count === 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Nada a corrigir.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Eficiência ───────────────────────────────────────────────────────
type EficienciaData = ReturnType<typeof buildEficiencia>;

function buildEficiencia(
  cur: Alerta[],
  empresaMap: Map<string, string>,
  projetoMap: Map<string, string>,
  supervisorMap: Map<string, string>,
) {
  type Bucket = { chave: string; label: string; total: number; abertos: number; resolvidos: number; ignorados: number; tempos: number[] };
  const mkBucket = (chave: string, label: string): Bucket =>
    ({ chave, label, total: 0, abertos: 0, resolvidos: 0, ignorados: 0, tempos: [] });

  const accum = (b: Bucket, a: Alerta) => {
    b.total += 1;
    if (a.status === "NOVO" || a.status === "EM_ANALISE") b.abertos += 1;
    else if (a.status === "RESOLVIDO") b.resolvidos += 1;
    else if (a.status === "IGNORADO") b.ignorados += 1;
    if (a.resolvido_em) b.tempos.push(new Date(a.resolvido_em).getTime() - new Date(a.detectado_em).getTime());
  };

  const bySup = new Map<string, Bucket>();
  const byProj = new Map<string, Bucket>();
  const byEmp = new Map<string, Bucket>();
  const byResp = new Map<string, Bucket>();

  cur.forEach((a) => {
    if (a.supervisor_usuario_id) {
      const key = a.supervisor_usuario_id;
      if (!bySup.has(key)) bySup.set(key, mkBucket(key, supervisorMap.get(key) ?? "—"));
      accum(bySup.get(key)!, a);
    }
    if (a.projeto_id) {
      const key = a.projeto_id;
      if (!byProj.has(key)) byProj.set(key, mkBucket(key, projetoMap.get(key) ?? "—"));
      accum(byProj.get(key)!, a);
    }
    if (a.empresa_id) {
      const key = a.empresa_id;
      if (!byEmp.has(key)) byEmp.set(key, mkBucket(key, empresaMap.get(key) ?? "—"));
      accum(byEmp.get(key)!, a);
    }
    if (a.responsavel_id) {
      const key = a.responsavel_id;
      if (!byResp.has(key)) byResp.set(key, mkBucket(key, supervisorMap.get(key) ?? "—"));
      accum(byResp.get(key)!, a);
    }
  });

  // Volume mensal (últimos ~12 meses relativos aos dados presentes)
  const mensal = new Map<string, { total: number; resolvidos: number }>();
  cur.forEach((a) => {
    const d = new Date(a.detectado_em);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = mensal.get(k) ?? { total: 0, resolvidos: 0 };
    cur.total += 1;
    if (a.status === "RESOLVIDO") cur.resolvidos += 1;
    mensal.set(k, cur);
  });
  const mensalSorted = Array.from(mensal.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12);

  const finalize = (m: Map<string, Bucket>) =>
    Array.from(m.values()).map((b) => ({
      ...b,
      tempo_medio: avg(b.tempos),
      taxa: pct(b.resolvidos, b.total),
    })).sort((a, b) => b.total - a.total);

  return {
    tempoMedioResolucao: avg(cur.filter((a) => a.resolvido_em).map((a) => new Date(a.resolvido_em!).getTime() - new Date(a.detectado_em).getTime())),
    tempoMedioAnalise: avg(cur.filter((a) => a.assumido_em && a.resolvido_em).map((a) => new Date(a.resolvido_em!).getTime() - new Date(a.assumido_em!).getTime())),
    supervisores: finalize(bySup),
    projetos: finalize(byProj),
    empresas: finalize(byEmp),
    responsaveis: finalize(byResp),
    mensal: mensalSorted,
  };
}

function EficienciaTab({ eff, isLoading, filtered, eventos, sinceIso }: {
  eff: EficienciaData; isLoading: boolean; filtered: Alerta[]; eventos: Evento[]; sinceIso: string;
}) {
  const reaberturas = React.useMemo(() => {
    const evs = eventos.filter((e) => e.tipo === "STATUS_ALTERADO" && new Date(e.created_at).toISOString() >= sinceIso);
    return evs.filter((e) => {
      const de = String((e.dados as { de?: string })?.de ?? "");
      const para = String((e.dados as { para?: string })?.para ?? "");
      return (de === "RESOLVIDO" || de === "IGNORADO") && (para === "NOVO" || para === "EM_ANALISE");
    }).length;
  }, [eventos, sinceIso]);

  if (isLoading) return <Grid><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></Grid>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Timer} label="Tempo médio de resolução" value={fmtDuration(eff.tempoMedioResolucao)} />
        <KpiCard icon={Timer} label="Tempo médio em análise" value={fmtDuration(eff.tempoMedioAnalise)} />
        <KpiCard icon={RefreshCw} label="Reaberturas" value={reaberturas} tone={reaberturas > 0 ? "warn" : undefined} />
        <KpiCard icon={ClipboardList} label="Volume total" value={filtered.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingCard title="Alertas por Supervisor" icon={UserCog} rows={eff.supervisores} filename="eficiencia_supervisores" />
        <RankingCard title="Alertas por Projeto"     icon={Sparkles} rows={eff.projetos}     filename="eficiencia_projetos" />
        <RankingCard title="Alertas por Empresa"     icon={Building2} rows={eff.empresas}   filename="eficiencia_empresas" />
        <RankingCard title="Backlog por responsável (RH/analista)" icon={Users2} rows={eff.responsaveis} filename="eficiencia_responsaveis" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Volume mensal & resolução</CardTitle>
          <CardDescription>Barra empilhada — resolvido vs. demais. Indicador de processo, não de mérito individual.</CardDescription>
        </CardHeader>
        <CardContent>
          {eff.mensal.length === 0 ? <EmptyInline label="Sem dados mensais no período." /> : (
            <div className="space-y-2">
              {eff.mensal.map(([mes, m]) => {
                const p = pct(m.resolvidos, m.total);
                return (
                  <div key={mes} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-muted-foreground tabular-nums">{mes}</div>
                    <div className="flex-1 h-6 rounded-md bg-muted overflow-hidden relative">
                      <div className="h-full bg-emerald-500/70" style={{ width: `${p}%` }} />
                      <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px] font-medium">
                        <span className="text-muted-foreground">{m.resolvidos}/{m.total}</span>
                        <span className="text-muted-foreground">{p.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Indicadores desta aba são <strong>métricas de processo</strong>. Não devem ser utilizados para ranqueamento punitivo de pessoas.
      </p>
    </div>
  );
}

function RankingCard({ title, icon: Icon, rows, filename }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  rows: Array<{ label: string; total: number; abertos: number; resolvidos: number; tempo_medio: number | null; taxa: number }>;
  filename: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <ExportMenu filename={filename}
          rows={rows.map((r) => ({ ...r, tempo_medio: fmtDuration(r.tempo_medio), taxa: r.taxa.toFixed(1) + "%" }))}
          columns={[
            { key: "label", label: title.split(" ").pop()! },
            { key: "total", label: "Total" }, { key: "abertos", label: "Abertos" },
            { key: "resolvidos", label: "Resolvidos" }, { key: "taxa", label: "Taxa" },
            { key: "tempo_medio", label: "Tempo médio" },
          ]}
        />
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? <EmptyInline label="Sem dados no período." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-medium py-1.5 pr-2">Nome</th>
                  <th className="text-right font-medium py-1.5 px-2">Total</th>
                  <th className="text-right font-medium py-1.5 px-2">Abertos</th>
                  <th className="text-right font-medium py-1.5 px-2">Taxa</th>
                  <th className="text-right font-medium py-1.5 pl-2">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.label} className="border-t">
                    <td className="py-1.5 pr-2 truncate max-w-[200px]">{r.label}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.total}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.abertos}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.taxa.toFixed(1)}%</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{fmtDuration(r.tempo_medio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Auditoria Executiva ──────────────────────────────────────────────
function AuditoriaTab({
  alertas, eventos, supervisorMap, empresaMap, projetoMap,
  usuarioFilter, onUsuarioChange, sinceIso, isLoading,
}: {
  alertas: Alerta[]; eventos: Evento[];
  supervisorMap: Map<string, string>; empresaMap: Map<string, string>; projetoMap: Map<string, string>;
  usuarioFilter: string; onUsuarioChange: (v: string) => void;
  sinceIso: string; isLoading: boolean;
}) {
  const alertaIds = React.useMemo(() => new Set(alertas.map((a) => a.id)), [alertas]);

  const evsFiltrados = React.useMemo(() => {
    return eventos.filter((e) => {
      if (!alertaIds.has(e.alerta_id)) return false;
      if (new Date(e.created_at).toISOString() < sinceIso) return false;
      if (usuarioFilter && e.usuario_id !== usuarioFilter) return false;
      return true;
    });
  }, [eventos, alertaIds, sinceIso, usuarioFilter]);

  const consolidado = React.useMemo(() => {
    // Consolida por alerta: quem criou / assumiu / comentou / resolveu, tempos.
    const byAlerta = new Map<string, Evento[]>();
    evsFiltrados.forEach((e) => {
      const arr = byAlerta.get(e.alerta_id) ?? [];
      arr.push(e); byAlerta.set(e.alerta_id, arr);
    });
    return alertas
      .filter((a) => byAlerta.has(a.id))
      .map((a) => {
        const evs = (byAlerta.get(a.id) ?? []).sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
        const criador = evs.find((e) => e.tipo === "CRIADO")?.usuario_id ?? null;
        const assumidoBy = evs.find((e) => e.tipo === "STATUS_ALTERADO" && (e.dados as { para?: string })?.para === "EM_ANALISE")?.usuario_id ?? null;
        const resolvidoBy = evs.find((e) => e.tipo === "STATUS_ALTERADO" && (e.dados as { para?: string })?.para === "RESOLVIDO")?.usuario_id ?? a.resolvido_por;
        const comentaristas = new Set(evs.filter((e) => e.tipo === "COMENTARIO" && e.usuario_id).map((e) => e.usuario_id!));
        return {
          alerta: a,
          criador, assumidoBy, resolvidoBy,
          comentaristas: Array.from(comentaristas),
          tempoAteAssumir: a.assumido_em ? new Date(a.assumido_em).getTime() - new Date(a.detectado_em).getTime() : null,
          tempoAteResolver: a.resolvido_em ? new Date(a.resolvido_em).getTime() - new Date(a.detectado_em).getTime() : null,
          eventos: evs,
        };
      })
      .sort((a, b) => new Date(b.alerta.updated_at).getTime() - new Date(a.alerta.updated_at).getTime());
  }, [alertas, evsFiltrados]);

  const usuariosOptions = React.useMemo(() => {
    const ids = new Set<string>();
    eventos.forEach((e) => { if (e.usuario_id) ids.add(e.usuario_id); });
    return Array.from(ids).map((id) => ({ value: id, label: supervisorMap.get(id) ?? id.slice(0, 8) }));
  }, [eventos, supervisorMap]);

  const exportRows = consolidado.map((r) => ({
    detectado_em: r.alerta.detectado_em,
    resolvido_em: r.alerta.resolvido_em,
    titulo: r.alerta.titulo,
    empresa: r.alerta.empresa_id ? empresaMap.get(r.alerta.empresa_id) ?? "" : "",
    projeto: r.alerta.projeto_id ? projetoMap.get(r.alerta.projeto_id) ?? "" : "",
    supervisor: r.alerta.supervisor_usuario_id ? supervisorMap.get(r.alerta.supervisor_usuario_id) ?? "" : "",
    criador: r.criador ? supervisorMap.get(r.criador) ?? r.criador : "",
    assumido_por: r.assumidoBy ? supervisorMap.get(r.assumidoBy) ?? r.assumidoBy : "",
    resolvido_por: r.resolvidoBy ? supervisorMap.get(r.resolvidoBy) ?? r.resolvidoBy : "",
    tempo_assumir: fmtDuration(r.tempoAteAssumir),
    tempo_resolver: fmtDuration(r.tempoAteResolver),
    status: r.alerta.status,
    criticidade: r.alerta.criticidade,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Filtros da auditoria</CardTitle>
            <div className="ml-auto"><ExportMenu filename={`auditoria_${new Date().toISOString().slice(0,10)}`} rows={exportRows}
              columns={[
                { key: "detectado_em", label: "Detectado" },
                { key: "titulo", label: "Título" },
                { key: "empresa", label: "Empresa" }, { key: "projeto", label: "Projeto" },
                { key: "supervisor", label: "Supervisor" },
                { key: "criador", label: "Criador" }, { key: "assumido_por", label: "Assumido por" },
                { key: "resolvido_por", label: "Resolvido por" },
                { key: "tempo_assumir", label: "Tempo p/ assumir" }, { key: "tempo_resolver", label: "Tempo p/ resolver" },
                { key: "resolvido_em", label: "Resolvido em" }, { key: "status", label: "Status" }, { key: "criticidade", label: "Criticidade" },
              ]} /></div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-3 md:grid-cols-3">
            <Sel placeholder="Usuário (autor)" value={usuarioFilter} onChange={onUsuarioChange} options={usuariosOptions} />
            <div className="text-xs text-muted-foreground md:col-span-2 self-center">
              Demais filtros (empresa, projeto, supervisor, status, criticidade, período) são compartilhados com as outras abas.
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : consolidado.length === 0 ? (
        <EmptyCard title="Sem eventos de auditoria" description="Nenhuma atividade registrada com os filtros atuais." />
      ) : (
        <div className="space-y-3">
          {consolidado.slice(0, 60).map((r) => (
            <Card key={r.alerta.id}>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.alerta.titulo}</span>
                      <Badge variant="outline" className={cn("border", CRIT_META[r.alerta.criticidade].badge)}>{CRIT_META[r.alerta.criticidade].label}</Badge>
                      <Badge variant="outline" className={cn("border", STATUS_META[r.alerta.status].badge)}>{STATUS_LBL[r.alerta.status]}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {r.alerta.empresa_id && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{empresaMap.get(r.alerta.empresa_id) ?? "—"}</span>}
                      {r.alerta.projeto_id && <span>· {projetoMap.get(r.alerta.projeto_id) ?? "—"}</span>}
                      {r.alerta.supervisor_usuario_id && <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" />{supervisorMap.get(r.alerta.supervisor_usuario_id) ?? "—"}</span>}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="border">
                    <Link to="/inteligencia/alertas" search={{ det: r.alerta.id } as never}>
                      <LinkIcon className="h-3 w-3 mr-1" /> Abrir alerta
                    </Link>
                  </Button>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-4 text-xs">
                  <MetaLine label="Detectado"     value={fmtDateTime(r.alerta.detectado_em)} />
                  <MetaLine label="Assumido"      value={r.alerta.assumido_em ? `${fmtDateTime(r.alerta.assumido_em)} · ${fmtDuration(r.tempoAteAssumir)}` : "—"} />
                  <MetaLine label="Resolvido"     value={r.alerta.resolvido_em ? `${fmtDateTime(r.alerta.resolvido_em)} · ${fmtDuration(r.tempoAteResolver)}` : "—"} />
                  <MetaLine label="Responsável"   value={r.alerta.responsavel_id ? supervisorMap.get(r.alerta.responsavel_id) ?? "—" : "—"} />
                </div>

                <div className="mt-3 grid gap-1.5 text-xs">
                  {r.eventos.slice(-6).map((e) => (
                    <div key={e.id} className="flex items-start gap-2">
                      <span className="text-muted-foreground tabular-nums shrink-0">{fmtDateTime(e.created_at)}</span>
                      <span className="text-muted-foreground shrink-0">·</span>
                      <span className="shrink-0 font-medium">{eventoLabel(e)}</span>
                      {e.usuario_id && <span className="text-muted-foreground">· {supervisorMap.get(e.usuario_id) ?? "usuário"}</span>}
                      {e.comentario && <span className="text-muted-foreground truncate">— "{e.comentario}"</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {consolidado.length > 60 && (
            <p className="text-xs text-muted-foreground text-center">Mostrando 60 de {consolidado.length}. Refine os filtros para ver mais.</p>
          )}
        </div>
      )}
    </div>
  );
}

function eventoLabel(e: Evento): string {
  switch (e.tipo) {
    case "CRIADO": return "Alerta criado";
    case "COMENTARIO": return "Comentário";
    case "STATUS_ALTERADO": {
      const de = String((e.dados as { de?: string })?.de ?? "?");
      const para = String((e.dados as { para?: string })?.para ?? "?");
      return `Status ${de} → ${para}`;
    }
    case "ATRIBUIDO": return "Responsável atribuído";
    case "LIDO": return "Marcado como lido";
    default: return e.tipo;
  }
}

// ─── Insights Executivos ──────────────────────────────────────────────
type InsightsData = ReturnType<typeof buildInsights>;

function buildInsights(
  cur: Alerta[], prev: Alerta[],
  empresaMap: Map<string, string>, projetoMap: Map<string, string>, supervisorMap: Map<string, string>,
) {
  // Volume por dimensão em cada janela → variação.
  const countBy = (rows: Alerta[], key: "empresa_id" | "projeto_id" | "supervisor_usuario_id") => {
    const m = new Map<string, number>();
    rows.forEach((r) => { const v = r[key]; if (v) m.set(v as string, (m.get(v as string) ?? 0) + 1); });
    return m;
  };
  const mkDelta = (
    curMap: Map<string, number>, prevMap: Map<string, number>, nameMap: Map<string, string>,
  ) => {
    const keys = new Set([...curMap.keys(), ...prevMap.keys()]);
    const rows = Array.from(keys).map((k) => {
      const c = curMap.get(k) ?? 0; const p = prevMap.get(k) ?? 0;
      return { id: k, label: nameMap.get(k) ?? k.slice(0, 8), cur: c, prev: p, delta: c - p };
    });
    return rows;
  };

  const empresas = mkDelta(countBy(cur, "empresa_id"), countBy(prev, "empresa_id"), empresaMap);
  const projetos = mkDelta(countBy(cur, "projeto_id"), countBy(prev, "projeto_id"), projetoMap);
  const equipes  = mkDelta(countBy(cur, "supervisor_usuario_id"), countBy(prev, "supervisor_usuario_id"), supervisorMap);

  const sortMelhor = (rows: typeof empresas) => [...rows].sort((a, b) => a.delta - b.delta).slice(0, 5);
  const sortPior   = (rows: typeof empresas) => [...rows].sort((a, b) => b.delta - a.delta).slice(0, 5);

  // Estabilidade = |delta| baixo com volume não-nulo.
  const estabilidade = (rows: typeof empresas) =>
    [...rows]
      .filter((r) => r.cur + r.prev > 0)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || (b.cur + b.prev) - (a.cur + a.prev))
      .slice(0, 5);
  const volatilidade = (rows: typeof empresas) =>
    [...rows]
      .filter((r) => r.cur + r.prev > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);

  return {
    empresasPositivas: sortMelhor(empresas),
    empresasNegativas: sortPior(empresas),
    projetosRecuperacao: sortMelhor(projetos),
    projetosDeterioracao: sortPior(projetos),
    equipesEstaveis: estabilidade(equipes),
    equipesVolateis: volatilidade(equipes),
  };
}

function InsightsTab({ insights, isLoading }: { insights: InsightsData; isLoading: boolean }) {
  if (isLoading) return <Grid><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></Grid>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <InsightCard title="Empresas com tendência positiva" icon={TrendingDown} tone="good" rows={insights.empresasPositivas} unit="alertas" />
      <InsightCard title="Empresas com tendência negativa" icon={TrendingUp} tone="critical" rows={insights.empresasNegativas} unit="alertas" />
      <InsightCard title="Projetos em recuperação"          icon={TrendingDown} tone="good" rows={insights.projetosRecuperacao} unit="alertas" />
      <InsightCard title="Projetos em deterioração"         icon={TrendingUp} tone="critical" rows={insights.projetosDeterioracao} unit="alertas" />
      <InsightCard title="Equipes mais estáveis"            icon={ShieldCheck} rows={insights.equipesEstaveis} unit="alertas" abs />
      <InsightCard title="Equipes mais voláteis"            icon={Activity} tone="warn" rows={insights.equipesVolateis} unit="alertas" abs />
    </div>
  );
}

function InsightCard({ title, icon: Icon, tone, rows, unit, abs }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  tone?: "good" | "warn" | "critical";
  rows: Array<{ id: string; label: string; cur: number; prev: number; delta: number }>;
  unit: string; abs?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "rounded-md p-1.5",
            tone === "good" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
            tone === "critical" ? "bg-destructive/10 text-destructive" :
            tone === "warn" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
            "bg-muted text-muted-foreground",
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>Comparação com a janela anterior.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? <EmptyInline label="Sem dados suficientes para comparar." /> : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const t = trend(r.cur, r.prev);
              const displayDelta = abs ? Math.abs(r.delta) : r.delta;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">{r.label}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                    <span>{r.prev} → {r.cur} {unit}</span>
                    <span className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded",
                      abs ? "text-muted-foreground bg-muted" :
                      t === "up" ? "text-destructive bg-destructive/10" :
                      t === "down" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" :
                      "text-muted-foreground bg-muted",
                    )}>
                      {!abs && t === "up" && <TrendingUp className="h-3 w-3" />}
                      {!abs && t === "down" && <TrendingDown className="h-3 w-3" />}
                      {abs ? "Δ" : (displayDelta > 0 ? "+" : "")}{displayDelta}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Saúde do Módulo (Super Admin) ────────────────────────────────────
function SaudeTab({ scopeReady, keyParts }: { scopeReady: boolean; keyParts: readonly string[] }) {
  const q = useQuery({
    queryKey: ["gov", "saude", ...keyParts],
    enabled: scopeReady,
    queryFn: async () => {
      const [alertas, eventos, configRes] = await Promise.all([
        supabase.from("inteligencia_alertas").select("id, criticidade, status, detectado_em, assumido_em, resolvido_em, updated_at").order("updated_at", { ascending: false }).limit(2000),
        supabase.from("inteligencia_alerta_eventos").select("id, tipo, created_at").order("created_at", { ascending: false }).limit(3000),
        supabase.from("absenteismo_config").select("updated_at").limit(1),
      ]);
      if (alertas.error) throw alertas.error;
      if (eventos.error) throw eventos.error;
      if (configRes.error) throw configRes.error;
      return { alertas: alertas.data ?? [], eventos: eventos.data ?? [], config: configRes.data?.[0] ?? null };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <Grid><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></Grid>;
  if (q.isError) return <ErrorCard message={(q.error as Error)?.message ?? "Falha ao carregar saúde do módulo."} />;

  const { alertas, eventos, config } = q.data!;
  const criados = eventos.filter((e) => e.tipo === "CRIADO");
  const ultimaDeteccao = criados[0]?.created_at ?? null;
  const ultimaMudanca = eventos.find((e) => e.tipo === "STATUS_ALTERADO")?.created_at ?? null;

  const now = Date.now();
  const last24h = alertas.filter((a) => now - new Date(a.detectado_em).getTime() <= DAY_MS);
  const last7d  = alertas.filter((a) => now - new Date(a.detectado_em).getTime() <= 7 * DAY_MS);

  const tempoAssumirRPC = avg(alertas.filter((a) => a.assumido_em).map((a) => new Date(a.assumido_em!).getTime() - new Date(a.detectado_em).getTime()));
  const tempoResolverRPC = avg(alertas.filter((a) => a.resolvido_em).map((a) => new Date(a.resolvido_em!).getTime() - new Date(a.detectado_em).getTime()));

  const cards = [
    { icon: Activity,    label: "Última execução da detecção", value: fmtDateTime(ultimaDeteccao) },
    { icon: Activity,    label: "Última mudança de status",    value: fmtDateTime(ultimaMudanca) },
    { icon: ClipboardList, label: "Alertas gerados (24h)",     value: last24h.filter((a) => criados.find((e) => e.created_at >= a.detectado_em)).length || last24h.length },
    { icon: ClipboardList, label: "Alertas gerados (7d)",      value: last7d.length },
    { icon: CheckCircle2, label: "Processados (7d)",           value: last7d.filter((a) => a.status === "RESOLVIDO" || a.status === "IGNORADO").length },
    { icon: AlertTriangle, label: "Falhas em análise (7d)",    value: last7d.filter((a) => a.status === "EM_ANALISE" && now - new Date(a.assumido_em ?? a.detectado_em).getTime() > 7 * DAY_MS).length, tone: "warn" as const },
    { icon: Timer,       label: "Tempo médio até assumir",     value: fmtDuration(tempoAssumirRPC) },
    { icon: Timer,       label: "Tempo médio até resolver",    value: fmtDuration(tempoResolverRPC) },
    { icon: ClipboardList, label: "Total de alertas monitorados", value: alertas.length },
    { icon: ClipboardList, label: "Total de eventos monitorados", value: eventos.length },
    { icon: Activity,    label: "Última mudança em absenteismo_config", value: fmtDateTime(config?.updated_at ?? null) },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="text-base">Painel técnico</CardTitle>
          <CardDescription>
            Visão somente-leitura do estado interno do módulo. Restrito ao Super Admin.
            Métricas derivadas dos eventos e alertas persistidos; não há chamadas privilegiadas nem bypass de RLS.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value as string | number} tone={c.tone} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preparação para futuras integrações</CardTitle>
          <CardDescription>
            Dataset builders (<code>buildGovernanca</code>, <code>buildQualidade</code>, <code>buildEficiencia</code>, <code>buildAuditoria</code>, <code>buildInsights</code>)
            são funções puras já isoladas neste módulo e poderão ser expostas via server functions dedicadas para:
            BI corporativo, APIs de analytics, automações, notificações externas, workflows e dashboards personalizados.
            Nenhuma dessas integrações é implementada nesta fase.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// ─── Componentes utilitários ──────────────────────────────────────────
const STATUS_LBL: Record<Status, string> = { NOVO: "Novo", EM_ANALISE: "Em análise", RESOLVIDO: "Resolvido", IGNORADO: "Ignorado" };
const STATUS_META: Record<Status, { badge: string }> = {
  NOVO:       { badge: "bg-primary/10 text-primary border-primary/30" },
  EM_ANALISE: { badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  RESOLVIDO:  { badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  IGNORADO:   { badge: "bg-muted text-muted-foreground border-muted-foreground/30" },
};
const CRIT_META: Record<Crit, { label: string; badge: string }> = {
  BAIXA:   { label: "Baixa",   badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  ATENCAO: { label: "Atenção", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  ALTA:    { label: "Alta",    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30" },
  CRITICA: { label: "Crítica", badge: "bg-destructive/10 text-destructive border-destructive/40" },
};

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function KpiCard({
  icon: Icon, label, value, hint, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; hint?: string; tone?: "critical" | "warn" | "good";
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn(
              "mt-1.5 text-2xl font-semibold tabular-nums truncate",
              tone === "critical" && "text-destructive",
              tone === "warn" && "text-amber-600 dark:text-amber-400",
              tone === "good" && "text-emerald-600 dark:text-emerald-400",
            )}>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
            {hint && <p className="mt-1 text-[11px] text-muted-foreground truncate">{hint}</p>}
          </div>
          <div className={cn(
            "rounded-md p-1.5 shrink-0",
            tone === "critical" ? "bg-destructive/10 text-destructive" :
            tone === "warn" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
            tone === "good" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
            "bg-muted text-muted-foreground",
          )}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Sel({
  placeholder, value, onChange, options, allowEmpty = true,
}: {
  placeholder: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; allowEmpty?: boolean;
}) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__all__">{placeholder} (todos)</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ExportMenu({ filename, rows, columns }: {
  filename: string;
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string }>;
}) {
  const doExport = (kind: "csv" | "xlsx" | "pdf") => {
    if (rows.length === 0) { toast.warning("Nada para exportar com os filtros atuais."); return; }
    const csv = toCSV(rows, columns);
    switch (kind) {
      case "csv":
        downloadFile(`${filename}.csv`, csv, "text/csv");
        break;
      case "xlsx":
        // Fallback compatível: gera CSV que o Excel abre nativamente.
        downloadFile(`${filename}.csv`, csv, "application/vnd.ms-excel");
        toast.message("Exportado como CSV (compatível com Excel).", { description: "XLSX nativo será habilitado em uma futura integração de BI." });
        break;
      case "pdf": {
        const html = buildPrintableHTML(filename, columns, rows);
        const w = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
        if (!w) { toast.error("Bloqueado pelo navegador. Permita pop-ups para exportar PDF."); return; }
        w.document.open(); w.document.write(html); w.document.close();
        setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 300);
        break;
      }
    }
  };
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" className="border h-8 px-2" onClick={() => doExport("csv")}>
        <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
      </Button>
      <Button size="sm" variant="ghost" className="border h-8 px-2" onClick={() => doExport("xlsx")}>
        <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
      </Button>
      <Button size="sm" variant="ghost" className="border h-8 px-2" onClick={() => doExport("pdf")}>
        <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
      </Button>
    </div>
  );
}

function buildPrintableHTML(title: string, columns: Array<{ key: string; label: string }>, rows: Array<Record<string, unknown>>): string {
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 32px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">Exportado em ${new Date().toLocaleString("pt-BR")} · ${rows.length} registro(s)</div>
<table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`;
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function EmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-14 text-center">
        <div className="mx-auto h-12 w-12 grid place-items-center rounded-full bg-muted mb-3">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
function EmptyInline({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground text-center py-6">{label}</p>;
}
function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-destructive">Falha ao carregar</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

// Separator import kept for future expansions of the tab layout.
void Separator;
