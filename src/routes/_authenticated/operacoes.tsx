import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Database, Download, HardDrive,
  History, Loader2, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck,
  Users, MessageSquare, FileText, ScrollText, Timer, XCircle, MinusCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AutomacaoStatusCards, HistoricoExecucoes, MotorControls } from "@/components/automacao/automacao-motor";
import { BIHealthCard } from "@/components/bi/bi-health-card";

export const Route = createFileRoute("/_authenticated/operacoes")({
  head: () => ({ meta: [{ title: "Operações · CRM MK9" }] }),
  component: OperacoesPage,
});

function OperacoesPage() {
  const { roles, loading } = useSession();
  if (loading) return <AppShell title="Operações" breadcrumb={["Sistema", "Operações"]}><Skeleton className="h-40 w-full" /></AppShell>;
  const canWrite = roles.includes("super_admin");
  const canRead = canWrite || roles.includes("compliance");
  if (!canRead) return <Navigate to="/dashboard" replace />;
  return <OperacoesContent canWrite={canWrite} />;
}

type Dashboard = {
  sistema_status: string; banco_status: string; db_size: string;
  usuarios: number; usuarios_ativos: number; colaboradores: number;
  ausencias: number; ausencias_pendentes: number; comunicacoes: number;
  auditorias_24h: number; auditorias_total: number;
  ultimo_backup: null | { id: string; tipo: string; status: string; solicitado_por_nome: string | null; inicio: string; fim: string | null; duracao_segundos: number | null; tamanho_bytes: number | null };
  alertas_ativos: number; alertas_resolvidos: number; alertas_ignorados: number;
  tempo_medio_ms_24h: number; gerado_em: string;
};

type HealthCheck = {
  checks: { nome: string; status: "OK" | "ATENCAO" | "ERRO"; detalhe?: string }[];
  resumo: { tabelas: number; rls: number; policies: number; triggers: number; views: number; mviews: number };
  gerado_em: string;
};

type BackupLog = {
  id: string; tipo: string; status: string; solicitado_por_nome: string | null;
  inicio: string; fim: string | null; duracao_segundos: number | null;
  tamanho_bytes: number | null; observacoes: string | null; created_at: string;
};

type Alerta = {
  id: string; tipo: string; severidade: string; status: string;
  titulo: string; mensagem: string | null; origem: string | null;
  created_at: string; resolvido_em: string | null;
};

function OperacoesContent({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();

  const dash = useQuery({
    queryKey: ["ops-dashboard"],
    queryFn: async () => {
      const t0 = performance.now();
      const { data, error } = await supabase.rpc("operacoes_dashboard" as never);
      if (error) throw error;
      const ms = Math.round(performance.now() - t0);
      return { ...(data as unknown as Dashboard), _rpc_ms: ms };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const health = useQuery({
    queryKey: ["ops-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("operacoes_health_check" as never);
      if (error) throw error;
      return data as unknown as HealthCheck;
    },
    enabled: canWrite,
    staleTime: 60_000,
  });

  const backups = useQuery({
    queryKey: ["ops-backups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backup_logs" as never).select("*")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as BackupLog[];
    },
    staleTime: 30_000,
  });

  const alertas = useQuery({
    queryKey: ["ops-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_alertas" as never).select("*")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Alerta[];
    },
    staleTime: 30_000,
  });

  const [obs, setObs] = useState("");
  const [openBackup, setOpenBackup] = useState(false);

  const solicitar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: Error | null }>)("registrar_solicitacao_backup", { _observacoes: obs || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação de backup registrada.");
      setObs(""); setOpenBackup(false);
      qc.invalidateQueries({ queryKey: ["ops-backups"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAlerta = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "RESOLVIDO") patch.resolvido_em = new Date().toISOString();
      const { error } = await (supabase.from("operacao_alertas" as never) as unknown as { update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } }).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alerta atualizado.");
      qc.invalidateQueries({ queryKey: ["ops-alertas"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = dash.data;

  const exportBackups = (fmt: "csv" | "xlsx") => {
    const rows = (backups.data ?? []).map((b) => ({
      Data: new Date(b.created_at).toLocaleString("pt-BR"),
      Tipo: b.tipo, Status: b.status,
      Solicitante: b.solicitado_por_nome ?? "",
      Inicio: b.inicio, Fim: b.fim ?? "",
      "Duração (s)": b.duracao_segundos ?? "",
      Observações: b.observacoes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "backups");
    XLSX.writeFile(wb, `backup_logs.${fmt}`);
  };

  return (
    <AppShell title="Centro de Operações" breadcrumb={["Sistema", "Operações"]}>
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Monitoramento operacional · saúde, backup, alertas e métricas. Acesso restrito.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { dash.refetch(); health.refetch(); backups.refetch(); alertas.refetch(); }}>
            {dash.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Atualizar
          </Button>
          {canWrite && (
            <Dialog open={openBackup} onOpenChange={setOpenBackup}>
              <DialogTrigger asChild>
                <Button size="sm"><PlayCircle className="mr-1.5 h-4 w-4" /> Executar Backup</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar solicitação de backup</DialogTitle></DialogHeader>
                <p className="text-xs text-muted-foreground">
                  Esta ação <strong>não executa backup real</strong>. Apenas registra a solicitação no histórico
                  operacional. Backups efetivos são executados pela infraestrutura (Supabase / plataforma).
                </p>
                <Textarea placeholder="Observações (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenBackup(false)}>Cancelar</Button>
                  <Button onClick={() => solicitar.mutate()} disabled={solicitar.isPending}>
                    {solicitar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Registrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard icon={Activity} label="Sistema" value={m?.sistema_status ?? "—"} tone="ok" />
        <StatusCard icon={Database} label="Banco" value={m?.banco_status ?? "—"} tone="ok" sub={m?.db_size} />
        <StatusCard icon={HardDrive} label="Último backup" value={
          m?.ultimo_backup ? new Date(m.ultimo_backup.inicio).toLocaleString("pt-BR") : "Sem registro"
        } sub={m?.ultimo_backup?.status} />
        <StatusCard icon={Timer} label="Tempo médio (24h)" value={m ? `${m.tempo_medio_ms_24h} ms` : "—"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI icon={Users} label="Usuários" value={m?.usuarios} sub={m ? `${m.usuarios_ativos} ativos` : ""} loading={dash.isLoading} />
        <KPI icon={Users} label="Colaboradores" value={m?.colaboradores} loading={dash.isLoading} />
        <KPI icon={FileText} label="Ausências" value={m?.ausencias} sub={m ? `${m.ausencias_pendentes} pendentes` : ""} loading={dash.isLoading} />
        <KPI icon={MessageSquare} label="Comunicações" value={m?.comunicacoes} loading={dash.isLoading} />
        <KPI icon={ScrollText} label="Auditoria (24h)" value={m?.auditorias_24h} sub={m ? `${m.auditorias_total} total` : ""} loading={dash.isLoading} />
        <KPI icon={AlertTriangle} label="Alertas ativos" value={m?.alertas_ativos} loading={dash.isLoading} />
        <KPI icon={CheckCircle2} label="Alertas resolvidos" value={m?.alertas_resolvidos} loading={dash.isLoading} />
        <KPI icon={MinusCircle} label="Alertas ignorados" value={m?.alertas_ignorados} loading={dash.isLoading} />
      </div>

      <BIHealthCard canWrite={canWrite} />


      <Tabs defaultValue="automacao">
        <TabsList>
          <TabsTrigger value="automacao">Automação de SLA</TabsTrigger>
          <TabsTrigger value="health">Health Check</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="dr">Disaster Recovery</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
          <TabsTrigger value="metricas">Métricas & Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="automacao" className="space-y-4">
          <Card><CardContent className="space-y-4 p-5">
            <AutomacaoStatusCards />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Motor server-side executado por agendamento interno. Ações administrativas são idempotentes e auditadas.
              </p>
              <MotorControls canWrite={canWrite} />
            </div>
          </CardContent></Card>
          <Card><CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" /> Histórico de execuções
            </div>
            <HistoricoExecucoes />
          </CardContent></Card>
        </TabsContent>


        <TabsContent value="health" className="space-y-3">
          <Card><CardContent className="p-5">
            {!canWrite ? (
              <p className="text-sm text-muted-foreground">Health check detalhado disponível apenas para Super Admin.</p>
            ) : health.isLoading ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Verificações
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Gerado em {health.data ? new Date(health.data.gerado_em).toLocaleString("pt-BR") : "—"}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {health.data?.checks.map((c) => (
                    <div key={c.nome} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{c.nome}</p>
                        {c.detalhe && <p className="text-xs text-muted-foreground">{c.detalhe}</p>}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
                {health.data && (
                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Tabelas: {health.data.resumo.tabelas}</span>
                    <span>RLS: {health.data.resumo.rls}</span>
                    <span>Policies: {health.data.resumo.policies}</span>
                    <span>Triggers: {health.data.resumo.triggers}</span>
                    <span>Views: {health.data.resumo.views}</span>
                    <span>Materialized Views: {health.data.resumo.mviews}</span>
                  </div>
                )}
              </>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-3">
          <Card><CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <HardDrive className="h-4 w-4 text-primary" /> Histórico de solicitações
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportBackups("csv")}><Download className="mr-1.5 h-3.5 w-3.5" />CSV</Button>
                <Button size="sm" variant="outline" onClick={() => exportBackups("xlsx")}><Download className="mr-1.5 h-3.5 w-3.5" />Excel</Button>
              </div>
            </div>
            <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <strong>Importante:</strong> o botão “Executar Backup” apenas registra uma solicitação. A execução real
              é feita pela infraestrutura do Supabase (backups diários automáticos) ou por rotinas administrativas
              externas. Nenhuma credencial, chave ou variável sensível é exposta neste painel.
            </p>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead>
                <TableHead>Solicitante</TableHead><TableHead>Duração</TableHead><TableHead>Observações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {backups.data?.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum registro.</TableCell></TableRow>
                )}
                {backups.data?.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline">{b.tipo}</Badge></TableCell>
                    <TableCell><Badge>{b.status}</Badge></TableCell>
                    <TableCell>{b.solicitado_por_nome ?? "—"}</TableCell>
                    <TableCell>{b.duracao_segundos ? `${b.duracao_segundos}s` : "—"}</TableCell>
                    <TableCell className="max-w-[320px] truncate">{b.observacoes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="dr" className="space-y-3">
          <Card><CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-primary" /> Plano de Recuperação
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <Info label="RTO (objetivo)" value="4 horas" />
              <Info label="RPO (objetivo)" value="24 horas" />
              <Info label="Última validação" value="—" />
              <Info label="Responsável técnico" value="Super Admin" />
              <Info label="Responsável negócio" value="Compliance" />
              <Info label="Último teste" value="—" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Ordem de restauração</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Validar variáveis de ambiente e credenciais na infraestrutura.</li>
                <li>Restaurar snapshot do banco (Postgres) a partir do backup mais recente do Supabase.</li>
                <li>Restaurar bucket de Storage (atestados).</li>
                <li>Validar Auth e sessões ativas.</li>
                <li>Reaplicar migrações pendentes se necessário.</li>
                <li>Executar Health Check e revalidar RLS, RPCs e triggers.</li>
                <li>Publicar novo build e revalidar DNS/SSL.</li>
              </ol>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Checklist</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {["Banco","Storage","Auth","Variáveis","Deploy","DNS","SSL","RLS","RPC","Triggers"].map((n) => (
                  <div key={n} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{n}</span><Badge variant="outline">A validar</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="alertas" className="space-y-3">
          <Card><CardContent className="p-5">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Severidade</TableHead>
                <TableHead>Título</TableHead><TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Ações</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {alertas.data?.length === 0 && (
                  <TableRow><TableCell colSpan={canWrite ? 6 : 5} className="text-center text-sm text-muted-foreground">Nenhum alerta registrado.</TableCell></TableRow>
                )}
                {alertas.data?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{new Date(a.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline">{a.tipo}</Badge></TableCell>
                    <TableCell><SevBadge sev={a.severidade} /></TableCell>
                    <TableCell>{a.titulo}</TableCell>
                    <TableCell><Badge variant={a.status === "ATIVO" ? "destructive" : a.status === "RESOLVIDO" ? "default" : "secondary"}>{a.status}</Badge></TableCell>
                    {canWrite && (
                      <TableCell className="text-right space-x-1">
                        {a.status === "ATIVO" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => updateAlerta.mutate({ id: a.id, status: "RESOLVIDO" })}>Resolver</Button>
                            <Button size="sm" variant="ghost" onClick={() => updateAlerta.mutate({ id: a.id, status: "IGNORADO" })}>Ignorar</Button>
                          </>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="metricas" className="space-y-3">
          <MetricasLogs />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function MetricasLogs() {
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["ops-metricas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_metricas" as never).select("*")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; categoria: string; tempo_ms: number; sucesso: boolean; created_at: string; detalhes: unknown }[];
    },
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    const rows = q.data ?? [];
    const window = (h: number) => rows.filter((r) => Date.now() - new Date(r.created_at).getTime() <= h * 3600_000);
    const calc = (arr: typeof rows) => {
      if (!arr.length) return { avg: 0, min: 0, max: 0, count: 0 };
      const t = arr.map((a) => a.tempo_ms);
      return { avg: Math.round(t.reduce((s, x) => s + x, 0) / t.length), min: Math.min(...t), max: Math.max(...t), count: t.length };
    };
    return { d1: calc(window(24)), d7: calc(window(24 * 7)), d30: calc(window(24 * 30)) };
  }, [q.data]);

  const filtered = (q.data ?? []).filter((r) =>
    !busca || r.categoria.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["d1","d7","d30"] as const).map((k, i) => (
          <Card key={k}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{["Últimas 24h","Últimos 7 dias","Últimos 30 dias"][i]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats[k].avg} ms</p>
            <p className="text-[11px] text-muted-foreground">min {stats[k].min} · max {stats[k].max} · n {stats[k].count}</p>
          </CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Logs de métricas</span>
          <Input className="ml-auto w-64" placeholder="Filtrar categoria…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data/Hora</TableHead><TableHead>Categoria</TableHead>
            <TableHead>Tempo</TableHead><TableHead>Severidade</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sem métricas registradas.</TableCell></TableRow>
            )}
            {filtered.slice(0, 100).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell><Badge variant="outline">{r.categoria}</Badge></TableCell>
                <TableCell>{r.tempo_ms} ms</TableCell>
                <TableCell>{r.sucesso ? <Badge>OK</Badge> : <Badge variant="destructive">ERRO</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}

function StatusCard({ icon: Icon, label, value, sub, tone }: { icon: typeof Users; label: string; value: string; sub?: string; tone?: "ok" }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${tone === "ok" ? "text-emerald-500" : "text-primary"}`} />
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

function KPI({ icon: Icon, label, value, sub, loading }: { icon: typeof Users; label: string; value: number | string | undefined; sub?: string; loading?: boolean }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>}
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "OK") return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20"><CheckCircle2 className="mr-1 h-3 w-3" />OK</Badge>;
  if (status === "ATENCAO") return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20"><AlertTriangle className="mr-1 h-3 w-3" />Atenção</Badge>;
  return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Erro</Badge>;
}

function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    BAIXA: "bg-slate-500/15 text-slate-600",
    MEDIA: "bg-blue-500/15 text-blue-600",
    ALTA: "bg-amber-500/15 text-amber-600",
    CRITICA: "bg-red-500/15 text-red-600",
  };
  return <Badge className={`${map[sev] ?? ""} hover:opacity-90`}>{sev}</Badge>;
}
