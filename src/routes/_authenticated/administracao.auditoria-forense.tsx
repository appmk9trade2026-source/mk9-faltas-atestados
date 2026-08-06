import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  RefreshCcw,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  FileText,
  Clock,
  Fingerprint,
  Activity,
  History,
  FileWarning,
  Loader2,
  Download,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/administracao/auditoria-forense")({
  head: () => ({
    meta: [
      { title: "Auditoria Forense · CRM MK9" },
      { name: "description", content: "Monitoramento de integridade forense e cadeia de custódia de dados." },
    ],
  }),
  component: AuditoriaForensePage,
});

function AuditoriaForensePage() {
  const { roles } = useSession();
  const queryClient = useQueryClient();
  const permitido = roles.includes("super_admin") || roles.includes("compliance");

  const integridadeQuery = useQuery({
    queryKey: ["auditoria-forense-integridade"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("diagnosticar_integridade_ausencias");
      if (error) throw error;
      const res = Array.isArray(data) ? data[0] : data;
      return res as {
        total_registros: number;
        total_sem_hash: number;
        total_hash_invalido: number;
        total_cadeia_quebrada: number;
        total_sem_autoria: number;
      };
    },
  });

  const eventosQuery = useQuery({
    queryKey: ["auditoria-forense-eventos"],
    enabled: permitido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(`
          id,
          colaborador_nome_snapshot,
          tipo,
          data_inicio,
          criado_em,
          criado_por_nome_snapshot,
          operacao_origem,
          operacao_ip,
          operacao_user_agent,
          hash_integridade,
          hash_anterior
        `)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const verificarMutation = useMutation({
    mutationFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return integridadeQuery.refetch();
    },
    onSuccess: () => {
      toast.success("Verificação de integridade concluída com sucesso.");
    },
  });

  if (!permitido) {
    return (
      <AppShell title="Auditoria Forense">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Apenas Super Admin e Compliance podem acessar esta área.
        </Card>
      </AppShell>
    );
  }

  const stats = integridadeQuery.data;
  const totalAuditados = stats?.total_registros ?? 0;
  const semHash = stats?.total_sem_hash ?? 0;
  const hashInvalido = stats?.total_hash_invalido ?? 0;
  const cadeiaQuebrada = stats?.total_cadeia_quebrada ?? 0;
  const semAutoria = stats?.total_sem_autoria ?? 0;
  const hashesValidos = totalAuditados - semHash - hashInvalido;
  const integridadeGeral = totalAuditados > 0 ? ((hashesValidos / totalAuditados) * 100).toFixed(1) : "100";

  return (
    <AppShell title="Auditoria Forense" breadcrumb={["Administração", "Auditoria Forense"]}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Integridade do Sistema</h1>
            <p className="text-muted-foreground">Monitoramento forense e cadeia de custódia de dados.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => toast.info("Funcionalidade de exportação em desenvolvimento.")}>
              <Download className="mr-2 h-4 w-4" /> Exportar Relatório
            </Button>
            <Button onClick={() => verificarMutation.mutate()} disabled={verificarMutation.isPending}>
              {verificarMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Executar Verificação
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Registros Auditados</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAuditados}</div>
              <p className="text-xs text-muted-foreground">Total de ausências processadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hashes Válidos</CardTitle>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hashesValidos}</div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <p className="text-xs text-emerald-500 font-medium">Assinatura digital íntegra</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Anomalias Detectadas</CardTitle>
              <AlertOctagon className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{semHash + hashInvalido + cadeiaQuebrada}</div>
              <p className="text-xs text-muted-foreground">Requer análise imediata</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Integridade Geral</CardTitle>
              <Activity className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{integridadeGeral}%</div>
              <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                <div 
                  className="bg-primary h-1.5 rounded-full" 
                  style={{ width: `${integridadeGeral}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="diagnostico" className="space-y-4">
          <TabsList>
            <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
            <TabsTrigger value="eventos">Eventos Forenses</TabsTrigger>
            <TabsTrigger value="anomalias">Anomalias</TabsTrigger>
          </TabsList>
          
          <TabsContent value="diagnostico" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Status da Cadeia</CardTitle>
                  <CardDescription>Resumo técnico da infraestrutura de auditoria.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Algoritmo de Hash</span>
                    <Badge variant="outline">SHA-256</Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Serialização</span>
                    <Badge variant="outline">RFC 8785 (Canonical)</Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Cadeias Quebradas</span>
                    <span className={cn("text-sm font-medium", cadeiaQuebrada > 0 ? "text-rose-600" : "text-emerald-600")}>
                      {cadeiaQuebrada} detectadas
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Último Evento</span>
                    <span className="text-sm">{eventosQuery.data?.[0]?.criado_em ? format(new Date(eventosQuery.data[0].criado_em), "dd/MM/yyyy HH:mm") : "—"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Último Hash Gerado</CardTitle>
                  <CardDescription>Assinatura digital do registro mais recente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-muted rounded-md font-mono text-[10px] break-all leading-relaxed">
                    {eventosQuery.data?.[0]?.hash_integridade || "Nenhum hash disponível"}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Fingerprint className="h-3 w-3" />
                    ID: {eventosQuery.data?.[0]?.id || "—"}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="eventos">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Dispositivo/Navegador</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventosQuery.isLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                    ) : eventosQuery.data?.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum evento auditado.</TableCell></TableRow>
                    ) : (
                      eventosQuery.data?.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="text-xs">
                            {format(new Date(ev.criado_em), "dd/MM HH:mm:ss")}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{ev.criado_por_nome_snapshot || "Sistema"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{ev.operacao_origem || "WEB"}</Badge></TableCell>
                          <TableCell className="text-[10px] font-mono">{ev.operacao_ip || "—"}</TableCell>
                          <TableCell className="text-[10px] max-w-[200px] truncate" title={ev.operacao_user_agent || ""}>
                            {ev.operacao_user_agent || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toast.info("Detalhes do hash anterior/atual em desenvolvimento.")}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="anomalias">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileWarning className="h-5 w-5 text-rose-500" />
                  Inconsistências Detectadas
                </CardTitle>
                <CardDescription>Registros que falharam na validação criptográfica ou de autoria.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {semHash > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-400">{semHash} Ausências sem Hash</h4>
                        <p className="text-xs text-rose-600/80">Registros criados antes da implementação forense ou com erro de processamento.</p>
                      </div>
                    </div>
                  )}
                  {hashInvalido > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                      <AlertOctagon className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-400">{hashInvalido} Hashes Inválidos</h4>
                        <p className="text-xs text-rose-600/80">Divergência entre o conteúdo do registro e a assinatura digital (Possível manipulação manual).</p>
                      </div>
                    </div>
                  )}
                  {cadeiaQuebrada > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                      <History className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-400">{cadeiaQuebrada} Cadeias Quebradas</h4>
                        <p className="text-xs text-rose-600/80">O hash_anterior não corresponde ao hash_integridade do registro precedente.</p>
                      </div>
                    </div>
                  )}
                  {semAutoria > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">{semAutoria} Registros sem Autoria</h4>
                        <p className="text-xs text-amber-600/80">Ausências registradas sem identificação clara do autor no snapshot.</p>
                      </div>
                    </div>
                  )}
                  {!semHash && !hashInvalido && !cadeiaQuebrada && !semAutoria && (
                    <div className="text-center py-12">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500/50" />
                      <h3 className="mt-4 text-lg font-medium">Sistema Íntegro</h3>
                      <p className="text-sm text-muted-foreground">Nenhuma anomalia forense detectada na base de dados.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
