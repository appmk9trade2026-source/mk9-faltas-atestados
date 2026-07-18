import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Clock, Database, Gauge, RefreshCw, XCircle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/observabilidade")({
  component: ObservabilidadePage,
  errorComponent: ({ error }) => (
    <div className="p-6"><p className="text-destructive">Erro: {error.message}</p></div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type Json = Record<string, unknown>;

async function rpc<T = Json>(name: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name);
  if (error) throw error;
  return data as T;
}

async function registrar(acao: string, detalhes: Json = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("observabilidade_registrar_execucao", { p_acao: acao, p_detalhes: detalhes });
}

function ObservabilidadePage() {
  const { roles } = useSession();
  const qc = useQueryClient();
  const canWrite = roles.includes("super_admin");

  const health = useQuery({ queryKey: ["obs", "health"], queryFn: () => rpc<Json>("plataforma_health_score"), staleTime: 30_000 });
  const db = useQuery({ queryKey: ["obs", "db"], queryFn: () => rpc<Json>("database_healthcheck"), staleTime: 60_000 });
  const perf = useQuery({ queryKey: ["obs", "perf"], queryFn: () => rpc<Json>("database_performance"), staleTime: 60_000 });
  const cron = useQuery({ queryKey: ["obs", "cron"], queryFn: () => rpc<Json>("cron_healthcheck"), staleTime: 30_000 });
  const idx = useQuery({ queryKey: ["obs", "idx"], queryFn: () => rpc<Json>("database_indices_report"), staleTime: 120_000 });

  const refreshAll = useMutation({
    mutationFn: async () => {
      await registrar("REFRESH_MANUAL");
      await qc.invalidateQueries({ queryKey: ["obs"] });
    },
    onSuccess: () => toast.success("Diagnósticos atualizados"),
    onError: (e: Error) => toast.error(e.message),
  });

  const score = (health.data?.score as number) ?? 0;
  const classe = (health.data?.classificacao as string) ?? "—";
  const comp = (health.data?.componentes ?? {}) as Record<string, number>;

  const scoreColor = score >= 90 ? "text-emerald-600" : score >= 75 ? "text-blue-600" : score >= 60 ? "text-amber-600" : "text-red-600";
  const scoreBadge = classe === "EXCELENTE" ? "default" : classe === "BOM" ? "secondary" : classe === "ATENCAO" ? "outline" : "destructive";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gauge className="h-6 w-6" /> Centro de Qualidade Operacional</h1>
          <p className="text-sm text-muted-foreground">Observabilidade, performance e diagnóstico do CRM MK9. Somente leitura.</p>
        </div>
        <Button onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending || !canWrite} variant="outline" size="sm">
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshAll.isPending && "animate-spin")} />
          Atualizar diagnóstico
        </Button>
      </div>

      {/* Health Score */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Health Score da Plataforma</CardTitle>
            <Badge variant={scoreBadge as "default"}>{classe}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-6 flex-wrap">
            <div>
              <div className={cn("text-6xl font-bold tabular-nums", scoreColor)}>{score}</div>
              <div className="text-xs text-muted-foreground">de 100</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[300px]">
              <MiniScore label="Banco" value={comp.banco} icon={Database} />
              <MiniScore label="Performance" value={comp.performance} icon={Zap} />
              <MiniScore label="Cron" value={comp.cron} icon={Clock} />
              <MiniScore label="BI" value={comp.bi} icon={Activity} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            <strong>Fórmula:</strong> {String(health.data?.formula ?? "")}
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="diagnostico">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="cron">Jobs pg_cron</TabsTrigger>
          <TabsTrigger value="indices">Índices</TabsTrigger>
        </TabsList>

        <TabsContent value="diagnostico" className="space-y-4 mt-4">
          <DiagList titulo="Tabelas sem RLS" itens={(db.data?.tabelas_sem_rls as Json[]) ?? []} severidade="ALTA" render={(i) => `${i.schema}.${i.tabela}`} />
          <DiagList titulo="Tabelas sem PK" itens={(db.data?.tabelas_sem_pk as Json[]) ?? []} severidade="MEDIA" render={(i) => `${i.schema}.${i.tabela}`} />
          <DiagList titulo="Funções SECURITY DEFINER sem search_path" itens={(db.data?.funcoes_sem_search_path as Json[]) ?? []} severidade="MEDIA" render={(i) => `${i.schema}.${i.funcao}`} />
          <DiagList titulo="Índices inválidos" itens={(db.data?.indices_invalidos as Json[]) ?? []} severidade="ALTA" render={(i) => `${i.tabela} → ${i.indice}`} />
          <DiagList titulo="Triggers desabilitadas" itens={(db.data?.triggers_desabilitadas as Json[]) ?? []} severidade="MEDIA" render={(i) => `${i.tabela} → ${i.trigger}`} />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Cache Hit Ratio</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{Number(perf.data?.cache_hit_pct ?? 0).toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground mt-1">Ideal: acima de 95%</p>
            </CardContent>
          </Card>
          <PerfTable titulo="Maiores tabelas" dados={(perf.data?.maiores_tabelas as Json[]) ?? []} cols={["tabela", "tamanho", "linhas"]} />
          <PerfTable titulo="Maiores índices" dados={(perf.data?.maiores_indices as Json[]) ?? []} cols={["indice", "tabela", "tamanho"]} />
          <PerfTable titulo="Sequential scans (top 15)" dados={(perf.data?.seq_scans as Json[]) ?? []} cols={["tabela", "seq_scan", "idx_scan", "linhas"]} />
          <PerfTable titulo="Vacuum / Analyze" dados={(perf.data?.vacuum_analyze as Json[]) ?? []} cols={["tabela", "last_autovacuum", "last_autoanalyze", "mortas"]} />
        </TabsContent>

        <TabsContent value="cron" className="space-y-4 mt-4">
          {((cron.data?.jobs as Json[]) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum job crm_mk9_* encontrado.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {((cron.data?.jobs as Json[]) ?? []).map((j) => (
                <CronCard key={String(j.jobname)} job={j} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="indices" className="space-y-4 mt-4">
          <PerfTable titulo="Índices não utilizados" dados={(idx.data?.nao_utilizados as Json[]) ?? []} cols={["tabela", "indice", "scans", "tamanho"]} />
          <PerfTable titulo="Índices potencialmente duplicados" dados={(idx.data?.duplicados as Json[]) ?? []} cols={["tabela", "indices", "definicao"]} />
          <p className="text-xs text-muted-foreground">Nunca remova índices automaticamente. Valide impacto em produção antes de aplicar sugestões.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniScore({ label, value, icon: Icon }: { label: string; value: number | undefined; icon: React.ComponentType<{ className?: string }> }) {
  const v = value ?? 0;
  const color = v >= 90 ? "text-emerald-600" : v >= 75 ? "text-blue-600" : v >= 60 ? "text-amber-600" : "text-red-600";
  return (
    <div className="p-3 border rounded-lg">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{v}</div>
    </div>
  );
}

function DiagList({ titulo, itens, severidade, render }: {
  titulo: string; itens: Json[]; severidade: "ALTA" | "MEDIA" | "BAIXA"; render: (i: Json) => string;
}) {
  const ok = itens.length === 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className={cn("h-4 w-4", severidade === "ALTA" ? "text-red-600" : "text-amber-600")} />}
            {titulo}
          </CardTitle>
          <Badge variant={ok ? "secondary" : severidade === "ALTA" ? "destructive" : "outline"}>{itens.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {ok ? (
          <p className="text-xs text-emerald-600">Sem ocorrências.</p>
        ) : (
          <ul className="text-sm space-y-1 max-h-40 overflow-y-auto font-mono">
            {itens.map((i, k) => <li key={k}>{render(i)}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PerfTable({ titulo, dados, cols }: { titulo: string; dados: Json[]; cols: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{titulo}</CardTitle></CardHeader>
      <CardContent>
        {dados.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {dados.map((row, i) => (
                  <TableRow key={i}>
                    {cols.map((c) => <TableCell key={c} className="font-mono text-xs">{formatCell(row[c])}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function CronCard({ job }: { job: Json }) {
  const estado = String(job.estado ?? "—");
  const ultima = (job.ultima_execucao ?? {}) as Json;
  const estadoColor =
    estado === "OK" ? "text-emerald-600" :
    estado === "ATRASADO" ? "text-amber-600" :
    estado === "FALHOU" ? "text-red-600" : "text-muted-foreground";
  const Icon = estado === "OK" ? CheckCircle2 : estado === "FALHOU" ? XCircle : AlertTriangle;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono">{String(job.jobname)}</CardTitle>
          <div className={cn("flex items-center gap-1 text-sm font-medium", estadoColor)}>
            <Icon className="h-4 w-4" /> {estado}
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        <div>Agenda: <span className="font-mono">{String(job.schedule)}</span></div>
        <div>Ativo: {job.active ? "Sim" : "Não"}</div>
        <div>Falhas 24h: <strong>{String(job.falhas_24h ?? 0)}</strong></div>
        {ultima.start_time ? (
          <div className="pt-2 border-t mt-2">
            <div>Última: {new Date(String(ultima.start_time)).toLocaleString("pt-BR")}</div>
            <div>Status: <span className="font-mono">{String(ultima.status ?? "—")}</span></div>
          </div>
        ) : (
          <div className="pt-2 border-t mt-2 text-muted-foreground">Sem execuções registradas.</div>
        )}
      </CardContent>
    </Card>
  );
}
