import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert, ShieldCheck, Info } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type InvRow = {
  schema_name: string;
  function_name: string;
  signature: string;
  security_definer: boolean;
  search_path_configurado: boolean;
  search_path_valor: string | null;
  execute_public: boolean;
  execute_anon: boolean;
  execute_authenticated: boolean;
  execute_service_role: boolean;
  owner_name: string;
  volatility: string;
  status: string;
  grant_status?: string | null;
  expected_roles?: string | null;
  risk_level?: string | null;
  categoria?: string | null;
};

type SlowRow = {
  query_fingerprint: string | null;
  calls: number | null;
  total_exec_time_ms: number | null;
  mean_exec_time_ms: number | null;
  max_exec_time_ms: number | null;
  rows_: number | null;
  shared_blks_hit: number | null;
  shared_blks_read: number | null;
  temp_blks_written: number | null;
  classificacao: string;
  disponivel: string;
};

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  OK: { color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400", label: "OK" },
  SEARCH_PATH_AUSENTE: { color: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400", label: "search_path ausente" },
  SECURITY_DEFINER_EXPOSTA: { color: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400", label: "SECDEF exposta" },
  ANON_EXECUTE: { color: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400", label: "anon EXECUTE" },
  PUBLIC_EXECUTE: { color: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400", label: "public EXECUTE" },
  OWNER_INESPERADO: { color: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400", label: "owner inesperado" },
  GRANT_INCONSISTENTE: { color: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400", label: "grants inconsistentes" },
};

const CLASSIF_STYLE: Record<string, string> = {
  NORMAL: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  ATENCAO: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  LENTA: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
  NAO_DISPONIVEL: "bg-muted text-muted-foreground",
};

function safeCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  const needsQuote = /[",\n]/.test(s) || /^[=+\-@]/.test(s);
  const escaped = s.replace(/"/g, '""');
  const prefixed = /^[=+\-@]/.test(escaped) ? `'${escaped}` : escaped;
  return needsQuote ? `"${prefixed}"` : prefixed;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => safeCsv(r[h])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function registrarExport(recurso: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("observabilidade_registrar_execucao", {
    p_acao: "EXPORT_CSV",
    p_detalhes: { recurso },
  });
}

export function SegurancaQueriesTabs() {
  const { roles } = useSession();
  const canView = roles.includes("super_admin") || roles.includes("compliance");

  const inv = useQuery({
    queryKey: ["obs", "sec-inventory"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("security_functions_inventory");
      if (error) throw error;
      return (data ?? []) as InvRow[];
    },
    enabled: canView,
    staleTime: 60_000,
  });

  const slow = useQuery({
    queryKey: ["obs", "slow-queries"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("database_slow_queries", { p_limit: 20, p_min_calls: 5 });
      if (error) throw error;
      return (data ?? []) as SlowRow[];
    },
    enabled: canView,
    staleTime: 60_000,
  });

  const invRows = inv.data ?? [];
  const total = invRows.length;
  const semSp = invRows.filter((r) => r.security_definer && !r.search_path_configurado).length;
  const expPub = invRows.filter((r) => r.execute_public && r.security_definer).length;
  const expAnon = invRows.filter((r) => r.execute_anon).length;
  const okCount = invRows.filter((r) => r.status === "OK").length;

  // Fase B — KPIs de hardening (categoria + risco)
  const catCount = (c: string) => invRows.filter((r) => r.categoria === c).length;
  const authOnly = invRows.filter((r) => r.execute_authenticated && !r.execute_anon && !r.execute_public).length;
  const svcOnly = invRows.filter((r) => r.execute_service_role && !r.execute_authenticated).length;
  const riskAlto = invRows.filter((r) => r.risk_level === "ALTO").length;
  const riskMedio = invRows.filter((r) => r.risk_level === "MEDIO").length;
  const riskBaixo = invRows.filter((r) => r.risk_level === "BAIXO").length;

  const exportSeguranca = async () => {
    downloadCsv("mk9-seguranca-funcoes.csv", invRows as unknown as Record<string, unknown>[]);
    await registrarExport("security_functions_inventory").catch(() => undefined);
    toast.success("CSV exportado e registrado em auditoria");
  };

  return (
    <>
      <TabsContent value="seguranca" className="space-y-4 mt-4">
        {!canView ? (
          <p className="text-sm text-muted-foreground">Acesso restrito a Super Admin e Compliance.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ScoreCard label="Funções analisadas" value={total} icon={ShieldCheck} tone="neutral" />
              <ScoreCard label="Sem search_path" value={semSp} tone={semSp === 0 ? "ok" : "critico"} icon={ShieldAlert} />
              <ScoreCard label="Expostas ao public" value={expPub} tone={expPub === 0 ? "ok" : "critico"} icon={ShieldAlert} />
              <ScoreCard label="Executáveis por anon" value={expAnon} tone={expAnon === 0 ? "ok" : "critico"} icon={ShieldAlert} />
              <ScoreCard label="Status OK" value={okCount} tone="ok" icon={ShieldCheck} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <ScoreCard label="Auth + Service" value={authOnly} tone="ok" />
              <ScoreCard label="Service_role only" value={svcOnly} tone="ok" />
              <ScoreCard label="Triggers" value={catCount("TRIGGER")} tone="neutral" />
              <ScoreCard label="CRON only" value={catCount("CRON_ONLY")} tone="neutral" />
              <ScoreCard label="Admin RPC" value={catCount("ADMIN_RPC")} tone="neutral" />
              <ScoreCard label="Risco Alto" value={riskAlto} tone={riskAlto === 0 ? "ok" : "critico"} />
              <ScoreCard label="Risco Médio" value={riskMedio} tone={riskMedio === 0 ? "ok" : "atencao"} />
              <ScoreCard label="Risco Baixo" value={riskBaixo} tone="ok" />
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportSeguranca} disabled={invRows.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Inventário de funções (somente leitura)</CardTitle>
              </CardHeader>
              <CardContent>
                {inv.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando…</p>
                ) : (
                  <div className="overflow-x-auto max-h-[560px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Função</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Grant</TableHead>
                          <TableHead>Risco</TableHead>
                          <TableHead>public</TableHead>
                          <TableHead>anon</TableHead>
                          <TableHead>auth</TableHead>
                          <TableHead>service</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invRows.map((r) => {
                          const st = STATUS_STYLE[r.status] ?? { color: "bg-muted", label: r.status };
                          const riskColor =
                            r.risk_level === "ALTO" ? "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400" :
                            r.risk_level === "MEDIO" ? "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" :
                            "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
                          return (
                            <TableRow key={r.signature}>
                              <TableCell className="font-mono text-xs">{r.signature}</TableCell>
                              <TableCell className="text-xs">{r.categoria ?? "—"}</TableCell>
                              <TableCell className="text-xs">{r.grant_status ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-xs", riskColor)}>{r.risk_level ?? "—"}</Badge>
                              </TableCell>
                              <TableCell>{r.execute_public ? "✓" : "—"}</TableCell>
                              <TableCell>{r.execute_anon ? "✓" : "—"}</TableCell>
                              <TableCell>{r.execute_authenticated ? "✓" : "—"}</TableCell>
                              <TableCell>{r.execute_service_role ? "✓" : "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-xs", st.color)}>{st.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              Fase B da Etapa 29 concluída — nenhuma função administrativa continua executável por <code>anon</code> ou <code>public</code>. Matriz completa em <code>docs/security-permissions-matrix.md</code>.
            </p>
          </>
        )}
      </TabsContent>

      <TabsContent value="queries" className="space-y-4 mt-4">
        {!canView ? (
          <p className="text-sm text-muted-foreground">Acesso restrito a Super Admin e Compliance.</p>
        ) : (
          <>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                As métricas refletem comportamento histórico do banco e não representam, isoladamente, um problema funcional.
                O texto exibido é um fingerprint sanitizado — literais e identificadores são substituídos por <code>?</code>.
              </AlertDescription>
            </Alert>

            {slow.data && slow.data.length > 0 && slow.data[0].disponivel === "NAO_DISPONIVEL" ? (
              <p className="text-sm text-muted-foreground">
                Extensão <code>pg_stat_statements</code> indisponível neste ambiente.
              </p>
            ) : (
              <SlowKpis rows={slow.data ?? []} />
            )}

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Consultas mais custosas</CardTitle></CardHeader>
              <CardContent>
                {slow.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando…</p>
                ) : (slow.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem dados disponíveis.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[560px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Fingerprint</TableHead>
                          <TableHead>Chamadas</TableHead>
                          <TableHead>Médio (ms)</TableHead>
                          <TableHead>Máx (ms)</TableHead>
                          <TableHead>Total (ms)</TableHead>
                          <TableHead>Linhas</TableHead>
                          <TableHead>Cache</TableHead>
                          <TableHead>Disco</TableHead>
                          <TableHead>Temp</TableHead>
                          <TableHead>Classe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(slow.data ?? []).map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-[11px] max-w-[420px] truncate" title={r.query_fingerprint ?? ""}>{r.query_fingerprint}</TableCell>
                            <TableCell>{r.calls}</TableCell>
                            <TableCell>{r.mean_exec_time_ms?.toFixed(1)}</TableCell>
                            <TableCell>{r.max_exec_time_ms?.toFixed(1)}</TableCell>
                            <TableCell>{r.total_exec_time_ms?.toFixed(0)}</TableCell>
                            <TableCell>{r.rows_}</TableCell>
                            <TableCell>{r.shared_blks_hit}</TableCell>
                            <TableCell>{r.shared_blks_read}</TableCell>
                            <TableCell>{r.temp_blks_written}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-xs", CLASSIF_STYLE[r.classificacao] ?? "")}>{r.classificacao}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>
    </>
  );
}

function SlowKpis({ rows }: { rows: SlowRow[] }) {
  const analisadas = rows.length;
  const mediaMs = analisadas ? rows.reduce((a, r) => a + (r.mean_exec_time_ms ?? 0), 0) / analisadas : 0;
  const maiorMedio = rows.reduce((a, r) => Math.max(a, r.mean_exec_time_ms ?? 0), 0);
  const maiorMax = rows.reduce((a, r) => Math.max(a, r.max_exec_time_ms ?? 0), 0);
  const totalCalls = rows.reduce((a, r) => a + Number(r.calls ?? 0), 0);
  const disco = rows.reduce((a, r) => a + Number(r.shared_blks_read ?? 0), 0);
  const temp = rows.reduce((a, r) => a + Number(r.temp_blks_written ?? 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <ScoreCard label="Analisadas" value={analisadas} tone="neutral" />
      <ScoreCard label="Tempo médio (ms)" value={mediaMs.toFixed(1)} tone={mediaMs > 100 ? "atencao" : "ok"} />
      <ScoreCard label="Maior médio (ms)" value={maiorMedio.toFixed(1)} tone={maiorMedio > 250 ? "critico" : "neutral"} />
      <ScoreCard label="Maior máx (ms)" value={maiorMax.toFixed(0)} tone={maiorMax > 1000 ? "critico" : "neutral"} />
      <ScoreCard label="Total chamadas" value={totalCalls} tone="neutral" />
      <ScoreCard label="Leituras de disco" value={disco} tone={disco > 1_000_000 ? "atencao" : "neutral"} />
      <ScoreCard label="Uso de temp" value={temp} tone={temp > 0 ? "atencao" : "ok"} />
    </div>
  );
}

function ScoreCard({
  label, value, tone, icon: Icon,
}: {
  label: string;
  value: number | string;
  tone: "ok" | "atencao" | "critico" | "neutral";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const color =
    tone === "ok" ? "text-emerald-600" :
    tone === "atencao" ? "text-amber-600" :
    tone === "critico" ? "text-red-600" : "text-foreground";
  return (
    <div className="p-3 border rounded-lg">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null} {label}
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
    </div>
  );
}
