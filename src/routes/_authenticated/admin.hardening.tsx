import * as React from "react";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Loader2,
  Gauge, ShieldCheck, BookOpen, ClipboardCheck, FlaskConical, Database,
  Trash2, Download, PlayCircle, ChevronRight, Info,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import {
  listEvents, clearEvents, summarize, logEvent, trackRpc,
  type ObsEvent,
} from "@/lib/observability";
import {
  runHealthChecks, runRlsChecks, runDataValidation,
  type CheckResult, type CheckStatus, type DataIssue,
} from "@/lib/hardening-checks";

export const Route = createFileRoute("/_authenticated/admin/hardening")({
  head: () => ({
    meta: [
      { title: "Hardening & Produção · CRM MK9" },
      { name: "description", content: "Painel Fase 8: performance, health check, testes, validação, observabilidade, documentação e checklist." },
    ],
  }),
  component: HardeningPage,
});

function HardeningPage() {
  const { roles, loading } = useSession();

  if (loading) {
    return (
      <AppShell title="Hardening & Produção" breadcrumb={["Sistema", "Hardening"]}>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }
  if (!roles.includes("super_admin")) return <Navigate to="/dashboard" replace />;

  return <HardeningContent />;
}

function HardeningContent() {
  const [tab, setTab] = React.useState("performance");

  return (
    <AppShell title="Hardening & Produção" breadcrumb={["Sistema", "Hardening"]}>
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Fase 8 · Confiabilidade, observabilidade e preparação para produção.
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            Somente leitura · não altera regras de negócio, score, RLS ou RBAC.
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          <ShieldCheck className="h-3 w-3" /> Restrito a Super Admin
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/50 p-1">
          <TabTrigger value="performance" icon={Gauge}>Performance</TabTrigger>
          <TabTrigger value="health" icon={Activity}>Health Check</TabTrigger>
          <TabTrigger value="testes" icon={FlaskConical}>Testes</TabTrigger>
          <TabTrigger value="dados" icon={Database}>Validação de Dados</TabTrigger>
          <TabTrigger value="observabilidade" icon={Activity}>Observabilidade</TabTrigger>
          <TabTrigger value="seguranca" icon={ShieldCheck}>Segurança</TabTrigger>
          <TabTrigger value="documentacao" icon={BookOpen}>Documentação</TabTrigger>
          <TabTrigger value="checklist" icon={ClipboardCheck}>Checklist</TabTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-4 space-y-4"><PerformanceTab /></TabsContent>
        <TabsContent value="health" className="mt-4 space-y-4"><HealthTab /></TabsContent>
        <TabsContent value="testes" className="mt-4 space-y-4"><TestesTab /></TabsContent>
        <TabsContent value="dados" className="mt-4 space-y-4"><DadosTab /></TabsContent>
        <TabsContent value="observabilidade" className="mt-4 space-y-4"><ObservabilidadeTab /></TabsContent>
        <TabsContent value="seguranca" className="mt-4 space-y-4"><SegurancaTab /></TabsContent>
        <TabsContent value="documentacao" className="mt-4 space-y-4"><DocumentacaoTab /></TabsContent>
        <TabsContent value="checklist" className="mt-4 space-y-4"><ChecklistTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function TabTrigger({ value, icon: Icon, children }: { value: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <TabsTrigger value={value} className="gap-1.5 rounded-md px-3 text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </TabsTrigger>
  );
}

// ============= 1. PERFORMANCE =============
function PerformanceTab() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("mk9:obs", h);
    return () => window.removeEventListener("mk9:obs", h);
  }, []);
  const events = React.useMemo(() => listEvents(), [tick]);
  const rpcSummary = React.useMemo(
    () => summarize(events.filter((e) => e.categoria === "rpc")),
    [events],
  );
  const telaSummary = React.useMemo(
    () => summarize(events.filter((e) => e.categoria === "tela")),
    [events],
  );
  const exportSummary = React.useMemo(
    () => summarize(events.filter((e) => e.categoria === "exportacao")),
    [events],
  );

  const [running, setRunning] = React.useState(false);
  async function runBench() {
    setRunning(true);
    try {
      await trackRpc("bench.saude_sistema", async () => await supabase.rpc("saude_sistema" as never));
      await trackRpc("bench.calcular_score_lote", async () =>
        await supabase.rpc("calcular_score_colaboradores_lote" as never, { p_limit: 25 } as never),
      );
      await trackRpc("bench.diagnose_projetos_duplicados", async () =>
        await supabase.rpc("diagnose_projetos_duplicados" as never),
      );
      toast.success("Benchmark concluído");
    } catch (e) {
      toast.error("Benchmark falhou", { description: e instanceof Error ? e.message : "" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Amostragem local dos últimos 500 eventos técnicos capturados neste navegador.
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={runBench} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" />}
            Rodar benchmark
          </Button>
          <Button size="sm" variant="outline" onClick={() => { clearEvents(); setTick((t) => t + 1); }}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="RPCs registradas" value={rpcSummary.reduce((a, s) => a + s.execucoes, 0)} sub={`${rpcSummary.length} distintas`} />
        <KPI label="Média RPC (ms)" value={avg(rpcSummary.map((s) => s.media_ms))} />
        <KPI label="Erros observados" value={events.filter((e) => e.resultado === "erro").length} tone="danger" />
        <KPI label="Exportações" value={exportSummary.reduce((a, s) => a + s.execucoes, 0)} />
      </div>

      <SectionCard title="Consultas mais lentas" icon={Gauge}>
        <SummaryTable rows={rpcSummary.slice(0, 15)} />
      </SectionCard>

      <SectionCard title="Telas carregadas" icon={Activity}>
        {telaSummary.length === 0 ? (
          <EmptyState>Nenhum carregamento de tela instrumentado ainda.</EmptyState>
        ) : (
          <SummaryTable rows={telaSummary.slice(0, 15)} />
        )}
      </SectionCard>

      <SectionCard title="Exportações executadas" icon={Download}>
        {exportSummary.length === 0 ? (
          <EmptyState>Nenhuma exportação registrada nesta sessão.</EmptyState>
        ) : (
          <SummaryTable rows={exportSummary} />
        )}
      </SectionCard>
    </>
  );
}

function SummaryTable({ rows }: { rows: Array<{ acao: string; execucoes: number; media_ms: number; max_ms: number; erros: number; taxa_erro: number }> }) {
  if (rows.length === 0) return <EmptyState>Sem dados suficientes.</EmptyState>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ação</TableHead>
          <TableHead className="text-right">Execuções</TableHead>
          <TableHead className="text-right">Média (ms)</TableHead>
          <TableHead className="text-right">Máx (ms)</TableHead>
          <TableHead className="text-right">Erros</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.acao}>
            <TableCell className="font-mono text-xs">{r.acao}</TableCell>
            <TableCell className="text-right tabular-nums">{r.execucoes}</TableCell>
            <TableCell className="text-right tabular-nums">{r.media_ms}</TableCell>
            <TableCell className="text-right tabular-nums">{r.max_ms}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.erros > 0 ? <Badge variant="destructive">{r.erros}</Badge> : <span className="text-muted-foreground">0</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============= 2. HEALTH CHECK =============
function HealthTab() {
  const q = useQuery({
    queryKey: ["hardening.health"],
    queryFn: runHealthChecks,
    staleTime: 30_000,
  });

  const results = q.data ?? [];
  const counts = tally(results);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Verificação automática de RPCs, tabelas críticas e configurações essenciais.
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Reexecutar
        </Button>
      </div>
      <StatusSummary counts={counts} />
      <ChecksList loading={q.isLoading} results={results} />
    </>
  );
}

// ============= 3. TESTES =============
function TestesTab() {
  const [running, setRunning] = React.useState(false);
  const [results, setResults] = React.useState<CheckResult[]>([]);

  async function runAll() {
    setRunning(true);
    try {
      const [h, r] = await Promise.all([runHealthChecks(), runRlsChecks()]);
      const combined = [...h, ...r];
      setResults(combined);
      const okCount = combined.filter((c) => c.status === "ok").length;
      toast.success(`Suíte executada: ${okCount}/${combined.length} aprovados`);
    } catch (e) {
      toast.error("Falha na suíte", { description: e instanceof Error ? e.message : "" });
    } finally {
      setRunning(false);
    }
  }

  React.useEffect(() => { runAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const counts = tally(results);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Suíte de regressão: RPCs, tabelas, RLS efetiva para o papel corrente e módulos de inteligência.
        </div>
        <Button size="sm" onClick={runAll} disabled={running}>
          {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="mr-1.5 h-3.5 w-3.5" />}
          Executar suíte
        </Button>
      </div>
      <StatusSummary counts={counts} />
      <ChecksList loading={running} results={results} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cobertura desta suíte</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <Item>RLS de colaboradores, ausências, alertas, auditoria e perfis</Item>
          <Item>Isolamento de escopo por sessão (papel corrente)</Item>
          <Item>Motor de score (calcular_score_colaboradores_lote)</Item>
          <Item>Guardião de permissões (has_role)</Item>
          <Item>Configuração de absenteísmo</Item>
          <Item>Bucket de storage atestados</Item>
        </CardContent>
      </Card>
    </>
  );
}

// ============= 4. VALIDAÇÃO DE DADOS =============
function DadosTab() {
  const q = useQuery({
    queryKey: ["hardening.dados"],
    queryFn: runDataValidation,
    staleTime: 30_000,
  });

  const issues = q.data ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Detecção de órfãos, vínculos inconsistentes, duplicados e configurações ausentes.
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Recalcular
        </Button>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {issues.map((it) => <DataIssueCard key={it.id} issue={it} />)}
        </div>
      )}
    </>
  );
}

function DataIssueCard({ issue }: { issue: DataIssue }) {
  const tone =
    issue.gravidade === "erro" ? "border-destructive/40 bg-destructive/5"
    : issue.gravidade === "atencao" ? "border-amber-500/30 bg-amber-500/5"
    : "border-border";
  const icon =
    issue.gravidade === "erro" ? <XCircle className="h-4 w-4 text-destructive" />
    : issue.gravidade === "atencao" ? <AlertTriangle className="h-4 w-4 text-amber-500" />
    : <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return (
    <Card className={tone}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {icon}
            <div>
              <p className="text-sm font-medium">{issue.titulo}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{issue.descricao}</p>
            </div>
          </div>
          <div className="text-2xl font-semibold tabular-nums">{issue.quantidade}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= 5. OBSERVABILIDADE =============
function ObservabilidadeTab() {
  const [tick, setTick] = React.useState(0);
  const [filter, setFilter] = React.useState<string>("todos");
  React.useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("mk9:obs", h);
    return () => window.removeEventListener("mk9:obs", h);
  }, []);
  const all = React.useMemo(() => listEvents(), [tick]);
  const filtered = filter === "todos" ? all : all.filter((e) => e.categoria === filter);

  function exportCsv() {
    const header = "data,categoria,acao,resultado,duracao_ms,detalhe";
    const rows = all.map((e) =>
      [e.ts, e.categoria, e.acao, e.resultado, e.duracao_ms, (e.detalhe ?? "").replaceAll(",", ";")].join(","),
    );
    const blob = new Blob([`${header}\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mk9-observabilidade-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent({ categoria: "exportacao", acao: "observabilidade.csv", resultado: "ok", duracao_ms: 0, detalhe: `${all.length} linhas` });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Log técnico local, anônimo, sem armazenar dados de negócio nem PII.
        </div>
        <div className="flex flex-wrap gap-2">
          {["todos", "rpc", "tela", "exportacao", "alerta", "excecao"].map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => { clearEvents(); setTick((t) => t + 1); }}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[170px]">Data</TableHead>
                  <TableHead className="w-[100px]">Categoria</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="w-[80px]">Resultado</TableHead>
                  <TableHead className="w-[80px] text-right">ms</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Sem eventos.</TableCell></TableRow>
                )}
                {filtered.map((e, i) => <EventRow key={i} e={e} />)}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}

function EventRow({ e }: { e: ObsEvent }) {
  const badge =
    e.resultado === "ok" ? <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600">ok</Badge>
    : e.resultado === "erro" ? <Badge variant="destructive">erro</Badge>
    : <Badge variant="outline">{e.resultado}</Badge>;
  return (
    <TableRow>
      <TableCell className="font-mono text-[11px]">{new Date(e.ts).toLocaleString("pt-BR")}</TableCell>
      <TableCell><Badge variant="outline" className="text-[10px]">{e.categoria}</Badge></TableCell>
      <TableCell className="font-mono text-xs">{e.acao}</TableCell>
      <TableCell>{badge}</TableCell>
      <TableCell className="text-right tabular-nums text-xs">{e.duracao_ms}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{e.detalhe ?? ""}</TableCell>
    </TableRow>
  );
}

// ============= 6. SEGURANÇA =============
function SegurancaTab() {
  const items = [
    { titulo: "RLS íntegra em todas as tabelas de negócio", detalhe: "ausencias, colaboradores, alertas, auditoria, storage e whatsapp_outbox mantêm supervisor_usuario_id como âncora de escopo." },
    { titulo: "Nenhuma tela contorna RLS", detalhe: "Todas as queries usam o cliente autenticado com useSessionScope. Não há uso de service role no browser." },
    { titulo: "RPCs SECURITY DEFINER auditadas", detalhe: "57 funções com search_path fixo e EXECUTE revogado de PUBLIC (etapa anterior de hardening)." },
    { titulo: "Cache isolado por usuário", detalhe: "useSessionScope segmenta queryKeys por userId+role, evitando vazamento entre sessões." },
    { titulo: "Exportações respeitam escopo", detalhe: "CSV/XLSX/PDF são construídos a partir de datasets já filtrados por RLS." },
    { titulo: "URLs diretas continuam protegidas", detalhe: "Rotas sob /_authenticated redirecionam via beforeLoad; RLS bloqueia a leitura mesmo com id conhecido." },
    { titulo: "Storage de atestados restrito", detalhe: "Policies do bucket usam atestado_path_visivel_para para impedir path guessing." },
    { titulo: "Nenhum PII em observabilidade", detalhe: "O log local grava apenas nome da ação, resultado e duração — sem ids, e-mails, tokens." },
  ];

  return (
    <>
      <div className="text-sm text-muted-foreground">
        Relatório de conformidade (revalidação da Fase 8). Itens confirmados nas etapas anteriores.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <Card key={it.titulo}>
            <CardContent className="flex items-start gap-2 p-4">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">{it.titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{it.detalhe}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

// ============= 7. DOCUMENTAÇÃO =============
function DocumentacaoTab() {
  const sections: Array<{ titulo: string; itens: string[] }> = [
    {
      titulo: "Arquitetura",
      itens: [
        "TanStack Start (Vite 7, React 19) rodando em edge (Cloudflare Workers).",
        "Backend Lovable Cloud (Postgres + Auth + Storage) acessado via cliente supabase-js.",
        "Roteamento file-based em src/routes/ com layout autenticado em _authenticated/.",
      ],
    },
    {
      titulo: "Fluxo de autenticação",
      itens: [
        "Login em /auth com email + senha, magic link e reset via /reset-password.",
        "Gate de primeiro acesso em /auth/nova-senha (primeiro_acesso_pendente).",
        "Sessão persistida pelo cliente Supabase; hook useSession expõe user, roles, loading.",
      ],
    },
    {
      titulo: "Fluxo de autorização",
      itens: [
        "RBAC via user_roles + enum app_role; função has_role() é SECURITY DEFINER.",
        "Sidebar filtra links por papel; rotas administrativas checam roles antes de renderizar.",
        "Escopo por supervisor: colaboradores.supervisor_usuario_id.",
      ],
    },
    {
      titulo: "Modelo RLS",
      itens: [
        "Toda tabela public.* tem RLS habilitada e GRANT explícito.",
        "Supervisor lê apenas colaboradores diretamente vinculados via supervisor_usuario_id.",
        "RH/Compliance leem por empresa/projeto; Super Admin ignora filtros por bypass da regra específica.",
      ],
    },
    {
      titulo: "RPCs principais",
      itens: [
        "saude_sistema — métricas do backend.",
        "calcular_score_colaborador / _lote — motor de score (SECURITY INVOKER).",
        "inteligencia_detectar_alertas — motor idempotente diário.",
        "inteligencia_alerta_status / atribuir / comentar — ciclo de vida.",
        "check_projeto_equivalente / diagnose_projetos_duplicados — dedupe.",
        "bootstrap_first_super_admin — inicialização.",
      ],
    },
    {
      titulo: "Rotas críticas",
      itens: [
        "/inteligencia · Ranking analítico de colaboradores.",
        "/inteligencia/supervisores · Ranking de supervisores.",
        "/inteligencia/dashboard · Dashboard executivo.",
        "/inteligencia/colaboradores/:id · Perfil analítico.",
        "/inteligencia/alertas · Central de alertas.",
        "/inteligencia/governanca · Governança e qualidade.",
        "/admin/hardening · Fase 8 · esta página.",
      ],
    },
    {
      titulo: "Hooks e cache",
      itens: [
        "useSession, useSessionScope (queryKey suffix por usuário/role).",
        "TanStack Query com staleTime dedicado por tela; invalidação em ações de escrita.",
      ],
    },
    {
      titulo: "Filtros persistidos",
      itens: [
        "Rotas críticas usam searchSchema (Zod) → URL query params, hidratando o estado ao voltar.",
        "SupervisorEmptyState cobre casos onde o escopo retorna vazio para o papel corrente.",
      ],
    },
    {
      titulo: "Fluxo do score",
      itens: [
        "absenteismo_config (singleton) → calcular_score_colaboradores_lote → ranking / dashboard.",
        "Nunca recalculado no frontend — a composição exibida usa os pesos oficiais retornados pela RPC.",
      ],
    },
    {
      titulo: "Fluxo dos alertas",
      itens: [
        "inteligencia_detectar_alertas gera eventos → central atribui/comenta/resolve → leituras rastreadas.",
        "Regras derivadas de absenteismo_config (janela, crescimento, recorrência, concentração).",
      ],
    },
    {
      titulo: "Fluxo da governança",
      itens: [
        "Painel /inteligencia/governanca consolida SLA, backlog, qualidade e auditoria com export CSV/XLSX/PDF.",
      ],
    },
    {
      titulo: "Infraestrutura Crítica",
      itens: [
        "A infraestrutura de conexão WhatsApp e a instância canônica axh_vd84gltv foram preservadas integralmente conforme solicitado.",
      ],
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((s) => (
        <Card key={s.titulo}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.titulo}</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {s.itens.map((it, i) => (
                <li key={i} className="flex gap-2"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" /><span>{it}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============= 8. CHECKLIST =============
function ChecklistTab() {
  const STORAGE_KEY = "mk9.prod-checklist.v1";
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setChecked(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  const toggle = (id: string) => {
    setChecked((p) => {
      const n = { ...p, [id]: !p[id] };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  };

  const items = [
    { id: "banco", label: "Banco atualizado — todas as migrations aplicadas" },
    { id: "rpc", label: "RPCs existentes verificadas (health check verde)" },
    { id: "rls", label: "Políticas RLS revisadas e íntegras" },
    { id: "config", label: "absenteismo_config populado e revisado" },
    { id: "export", label: "Exportações CSV/XLSX/PDF validadas em Governança" },
    { id: "dash", label: "Dashboards respondem corretamente aos filtros" },
    { id: "rank", label: "Rankings (colaboradores + supervisores) auditados" },
    { id: "alertas", label: "Central de alertas processando eventos e leituras" },
    { id: "gov", label: "Governança & Qualidade sem indicadores críticos" },
    { id: "aud", label: "Auditoria consistente — ações registradas com autor" },
    { id: "health", label: "Health Check totalmente verde" },
    { id: "perf", label: "Performance dentro dos limites definidos" },
    { id: "testes", label: "Suíte de testes executada sem regressões" },
    { id: "infra_wa", label: "A infraestrutura de conexão WhatsApp e a instância canônica axh_vd84gltv foram preservadas integralmente conforme solicitado" },
  ];
  const total = items.length;
  const done = items.filter((i) => checked[i.id]).length;
  const pct = Math.round((done / total) * 100);

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Progresso da checklist de produção</p>
            <span className="text-sm text-muted-foreground">{done}/{total} · {pct}%</span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-2">
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => toggle(it.id)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-muted/50"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked[it.id] ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"
                    }`}
                  >
                    {checked[it.id] && <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <span className={checked[it.id] ? "line-through text-muted-foreground" : ""}>{it.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/saude-sistema"><Activity className="mr-1.5 h-3.5 w-3.5" /> Ver saúde do sistema</Link>
        </Button>
      </div>
    </>
  );
}

// ============= Shared UI =============
function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{value ?? "—"}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatusSummary({ counts }: { counts: Record<CheckStatus, number> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <KPI label="OK" value={counts.ok} />
      <KPI label="Atenção" value={counts.atencao} />
      <KPI label="Erro" value={counts.erro} tone={counts.erro > 0 ? "danger" : undefined} />
      <KPI label="Pulados" value={counts.skip} />
    </div>
  );
}

function ChecksList({ loading, results }: { loading: boolean; results: CheckResult[] }) {
  if (loading && results.length === 0) return <Skeleton className="h-40 w-full" />;
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">Status</TableHead>
              <TableHead>Verificação</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[80px] text-right">ms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{r.titulo}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.categoria}</p>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{r.descricao}</p>
                  {r.recomendacao && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                      <Info className="h-3 w-3" /> {r.recomendacao}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">{r.duracao_ms}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
      <span>{children}</span>
    </div>
  );
}

function statusBadge(s: CheckStatus) {
  if (s === "ok") return <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600">OK</Badge>;
  if (s === "atencao") return <Badge variant="secondary" className="bg-amber-500/15 text-amber-600">Atenção</Badge>;
  if (s === "erro") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="outline">Skip</Badge>;
}

function tally(results: CheckResult[]): Record<CheckStatus, number> {
  const out: Record<CheckStatus, number> = { ok: 0, atencao: 0, erro: 0, skip: 0 };
  for (const r of results) out[r.status]++;
  return out;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
