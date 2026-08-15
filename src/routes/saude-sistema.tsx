import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { getSystemHealth, listHealthIncidents, type IncidentRow, triggerNotificationWorker } from "@/lib/health.functions";
import { getNotificationConfig, updateNotificationConfig, listNotificationRecipients, validateNotificationGoLive } from "@/lib/health-config.functions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Bell, Settings2, Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { RefreshCw, Search, History, Copy, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/saude-sistema")({
  component: SaudeSistemaPage,
});

function SaudeSistemaPage() {
  const [searchTraceId, setSearchTraceId] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");
  const [filterPeriod, setFilterPeriod] = useState<string>("24h");
  const [selectedIncident, setSelectedIncident] = useState<IncidentRow | null>(null);
  const queryClient = useQueryClient();
  
  const configQ = useQuery({
    queryKey: ["notification-config"],
    queryFn: () => getNotificationConfig({}),
  });

  const recipientsQ = useQuery({
    queryKey: ["notification-recipients"],
    queryFn: () => listNotificationRecipients({}),
  });

  const validateQ = useQuery({
    queryKey: ["validate-go-live"],
    queryFn: () => validateNotificationGoLive({}),
    enabled: !!configQ.data,
  });

  const updateConfigM = useMutation({
    mutationFn: (vars: { environment: any; kill_switch_enabled: boolean }) => updateNotificationConfig(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-config"] });
      queryClient.invalidateQueries({ queryKey: ["validate-go-live"] });
      toast.success("Configuração atualizada.");
    },
    onError: (err: any) => toast.error("Falha ao atualizar: " + err.message),
  });

  const triggerWorkerM = useMutation({
    mutationFn: (vars: { dryRun: boolean }) => triggerNotificationWorker(vars),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["health-incidents"] });
      toast.success(res.processed > 0 ? `Processado ${res.processed} item(s).` : "Nenhum item pendente.");
    },
    onError: (err: any) => toast.error("Falha ao disparar: " + err.message),
  });
  
  const healthQ = useQuery({
    queryKey: ["health-consolidated"],
    queryFn: () => getSystemHealth({}),
    refetchInterval: 60000,
  });

  const incidentsQ = useQuery({
    queryKey: ["health-incidents", { filterStatus, filterSeverity, filterPeriod, searchTraceId }],
    queryFn: () => listHealthIncidents({ 
      data: { 
        status: filterStatus as any,
        severity: filterSeverity as any,
        period: filterPeriod as any,
        traceId: searchTraceId || undefined
      } 
    }),
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HEALTHY": return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
      case "DEGRADED": return "bg-amber-500/15 text-amber-700 border-amber-500/30";
      case "CRITICAL": return "bg-red-500/15 text-red-700 border-red-500/30";
      default: return "bg-slate-500/15 text-slate-700 border-slate-500/30";
    }
  };

  return (
    <AppShell title="Saúde do Sistema" breadcrumb={["Administração", "Saúde do Sistema"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Saúde do Sistema</h1>
            <p className="text-sm text-muted-foreground">Monitoramento técnico dos módulos críticos e incidentes operacionais.</p>
          </div>
          <Button variant="outline" onClick={() => { healthQ.refetch(); incidentsQ.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>

        {healthQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="col-span-1 md:col-span-4">
              <CardHeader><CardTitle>STATUS GERAL</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-6">
                <Badge className={cn("text-lg px-4 py-1", getStatusColor(healthQ.data?.overall_status ?? "UNKNOWN"))}>
                  {healthQ.data?.overall_status === "HEALTHY" ? "✓ Saudável" : 
                   healthQ.data?.overall_status === "DEGRADED" ? "⚠ Degradado" : 
                   healthQ.data?.overall_status === "CRITICAL" ? "✕ Crítico" : "Indeterminado"}
                </Badge>
                <div>
                  <p className="text-sm text-muted-foreground">Última checagem</p>
                  <p className="font-medium">{healthQ.data ? format(new Date(healthQ.data.checked_at), "dd/MM/yyyy HH:mm:ss") : "—"}</p>
                </div>
              </CardContent>
            </Card>
            
            {Object.entries((healthQ.data?.modules ?? {}) as Record<string, any>).map(([name, mod]) => (
              <Card key={name}>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{name}</CardTitle></CardHeader>
                <CardContent>
                  <Badge variant="outline" className={getStatusColor(mod.status)}>{mod.status}</Badge>
                  <p className="text-xs mt-2 text-muted-foreground">Incidentes abertos: {mod.open_incidents}</p>
                  <p className="text-xs text-muted-foreground">Erros recentes: {mod.errors_recent}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Notificações P0 (Etapa 8)</CardTitle>
                  <p className="text-xs text-muted-foreground">Governança, Kill Switch e Controle de Ambiente.</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={validateQ.data?.status === "READY" ? "success" : "danger" as any} className="flex gap-1 items-center">
                    {validateQ.data?.status === "READY" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {validateQ.data?.status === "READY" ? "READY" : "BLOCKED"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Kill Switch Global</Label>
                        <p className="text-xs text-muted-foreground">Bloqueia todos os envios externos se desativado.</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant={configQ.data?.kill_switch_enabled ? "destructive" : "outline"}
                            size="sm"
                            disabled={updateConfigM.isPending}
                          >
                            {configQ.data?.kill_switch_enabled ? "DESATIVAR" : "ATIVAR"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Alterar Kill Switch?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {configQ.data?.kill_switch_enabled 
                                ? "Você está prestes a DESATIVAR o envio de notificações críticas. Novos alertas P0 não serão enviados para canais externos."
                                : "Você está prestes a ATIVAR o envio de notificações reais. Certifique-se de que os destinatários estão corretos."
                              }
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => updateConfigM.mutate({ 
                          environment: configQ.data?.environment, 
                          kill_switch_enabled: !!configQ.data?.kill_switch_enabled 
                        })}>
                              Confirmar Alteração
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Ambiente de Notificação</Label>
                      <Select 
                        value={configQ.data?.environment} 
                        onValueChange={(val: any) => {
                          if (val === 'PRODUCTION') {
                            toast.info("A ativação de PRODUCTION exige destinatários verificados.");
                          }
                          updateConfigM.mutate({ 
                            environment: val, 
                            kill_switch_enabled: configQ.data?.kill_switch_enabled 
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DISABLED">DISABLED (Nenhum envio)</SelectItem>
                          <SelectItem value="SANDBOX">SANDBOX (Somente testes)</SelectItem>
                          <SelectItem value="PRODUCTION">PRODUCTION (Real)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-3 border rounded-lg bg-blue-50/50 text-blue-800 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        <ShieldCheck className="h-4 w-4" /> Go-Live Status
                      </div>
                      {validateQ.data?.reasons?.length ? (
                        <ul className="text-xs space-y-1 ml-4 list-disc">
                          {validateQ.data.reasons.map((r: string) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs">Infraestrutura pronta para operação controlada.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => triggerWorkerM.mutate({ dryRun: true })}
                        disabled={triggerWorkerM.isPending}
                      >
                        <Eye className="h-3.5 w-3.5 mr-2" /> DRY RUN
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => {
                          const preview = `[TESTE DE SISTEMA]\nCRM MK9 — ALERTA P0\n\nMódulo: Nova Ausência\nStatus: Crítico\nIncidente: TEST-8822\nTrace: ${Math.random().toString(36).slice(2, 10)}\n\nAcesse Saúde do Sistema para diagnóstico.`;
                          toast.info("Mensagem Sanitizada:", {
                            description: preview,
                            duration: 6000,
                          });
                        }}
                      >
                        <Bell className="h-3.5 w-3.5 mr-2" /> PREVIEW
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Destinatários Técnicos</CardTitle>
                  <p className="text-xs text-muted-foreground">Apenas números verificados são elegíveis para PRODUCTION.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => toast.warning("Funcionalidade de adição via Painel em desenvolvimento.")}>+ Adicionar</Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Env</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipientsQ.data?.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-medium">{r.label}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.destination.replace(/.(?=.{4})/g, "*")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{r.environment}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {r.active && r.verified_at ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                            )}
                            <span className="text-[10px]">{r.active ? "Ativo" : "Inativo"}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!recipientsQ.data?.length && (
                      <TableRow><TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">Nenhum destinatário cadastrado.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">Auditoria de Segurança</CardTitle>
                <p className="text-xs text-muted-foreground">Fail-Closed e Proteção de PII.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 border rounded-lg bg-emerald-50/50 text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <ShieldCheck className="h-4 w-4" /> PII Guardrail
                  </div>
                  <p className="text-[10px]">Todas as notificações externas excluem Nome, CPF, Matrícula e CID.</p>
                </div>
                <div className="p-3 border rounded-lg bg-emerald-50/50 text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <ShieldCheck className="h-4 w-4" /> Fail-Closed Active
                  </div>
                  <p className="text-[10px]">O sistema bloqueia envios automaticamente se houver ambiguidade na configuração.</p>
                </div>
                <div className="p-3 border rounded-lg bg-slate-50 text-slate-600 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm text-slate-800">
                    <Settings2 className="h-4 w-4" /> Outbox Worker
                  </div>
                  <p className="text-[10px]">Status: Homologado Etapa 7</p>
                  <p className="text-[10px]">Idempotência: SHA-256 (Ativa)</p>
                  <p className="text-[10px]">Locking: Concorrente (Ativo)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Incidentes Técnicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os status</SelectItem>
                  <SelectItem value="OPEN">Abertos</SelectItem>
                  <SelectItem value="MONITORING">Em monitoramento</SelectItem>
                  <SelectItem value="RESOLVED">Resolvidos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as severidades</SelectItem>
                  <SelectItem value="P0">P0 - Crítico</SelectItem>
                  <SelectItem value="P1">P1 - Alta</SelectItem>
                  <SelectItem value="P2">P2 - Média</SelectItem>
                  <SelectItem value="P3">P3 - Baixa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="24h">Últimas 24h</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar Trace ID" 
                  className="pl-8" 
                  value={searchTraceId} 
                  onChange={(e) => setSearchTraceId(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Status Incidente</TableHead>
                    <TableHead>Alerta Operacional</TableHead>
                    <TableHead className="text-right">Ocorrências</TableHead>
                    <TableHead>Último Evento</TableHead>

                    <TableHead>Sample Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidentsQ.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Carregando incidentes...</TableCell></TableRow>
                  ) : !incidentsQ.data?.incidents.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum incidente encontrado no período selecionado.</TableCell></TableRow>
                  ) : (
                    incidentsQ.data.incidents.map((incident: IncidentRow) => (
                      <TableRow 
                        key={incident.id} 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedIncident(incident)}
                      >
                        <TableCell className="font-medium">{incident.module}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            incident.severity === "P0" ? "bg-red-500 text-white" :
                            incident.severity === "P1" ? "bg-orange-500 text-white" :
                            "bg-slate-200 text-slate-700"
                          )}>
                            {incident.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            incident.status === "OPEN" ? "border-red-500 text-red-600" :
                            incident.status === "MONITORING" ? "border-amber-500 text-amber-600" :
                            "border-emerald-500 text-emerald-600"
                          )}>
                            {incident.status}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className={cn(
                            incident.alert_status === "READY" ? "bg-red-500 text-white" :
                            incident.alert_status === "ESCALATED" ? "bg-orange-600 text-white" :
                            incident.alert_status === "SUPPRESSED" ? "bg-slate-100 text-slate-500" :
                            incident.alert_status === "PENDING" ? "bg-blue-50 text-blue-600 border-blue-200" :
                            "bg-slate-50 text-slate-400"
                          )}>
                            {incident.alert_status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{incident.occurrence_count}</TableCell>

                        <TableCell className="text-xs">{format(new Date(incident.last_seen_at), "dd/MM HH:mm")}</TableCell>
                        <TableCell className="text-xs font-mono">{incident.sample_trace_id?.slice(0, 8)}...</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selectedIncident} onOpenChange={(o) => !o && setSelectedIncident(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes do Incidente</SheetTitle>
            <SheetDescription>Análise técnica detalhada da ocorrência agregada.</SheetDescription>
          </SheetHeader>
          
          {selectedIncident && (
            <div className="space-y-6 py-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <DetailField label="Módulo" value={selectedIncident.module} />
                <DetailField label="Operação" value={selectedIncident.operation} />
                <DetailField label="Severidade" value={selectedIncident.severity} />
                <DetailField label="Status" value={selectedIncident.status} />
                <DetailField label="Ocorrências" value={selectedIncident.occurrence_count.toString()} />
                <DetailField label="Alerta Status" value={selectedIncident.alert_status || "—"} />
                <DetailField label="Alerta Motivo" value={selectedIncident.alert_reason || "—"} />

                <DetailField label="Usuários Afetados" value={selectedIncident.affected_users_count.toString()} />
                <DetailField label="Primeiro Evento" value={format(new Date(selectedIncident.first_seen_at), "dd/MM/yyyy HH:mm:ss")} />
                <DetailField label="Último Evento" value={format(new Date(selectedIncident.last_seen_at), "dd/MM/yyyy HH:mm:ss")} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sample Trace ID</Label>
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md border">
                  <code className="text-xs flex-1 truncate font-mono">{selectedIncident.sample_trace_id}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                    navigator.clipboard.writeText(selectedIncident.sample_trace_id || "");
                    toast.success("Trace ID copiado.");
                  }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Histórico Agregado</h3>
                </div>
                <div className="border-l-2 border-primary/20 ml-2 pl-4 space-y-4">
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <p className="text-xs font-medium">{format(new Date(selectedIncident.first_seen_at), "HH:mm")}</p>
                    <p className="text-xs text-muted-foreground">Primeira ocorrência detectada</p>
                  </div>
                  {selectedIncident.occurrence_count > 1 && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-background" />
                      <p className="text-xs font-medium">Intervalo</p>
                      <p className="text-xs text-muted-foreground">{selectedIncident.occurrence_count - 1} novas ocorrências agregadas via fingerprint</p>
                    </div>
                  )}
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-background" />
                    <p className="text-xs font-medium">{format(new Date(selectedIncident.last_seen_at), "HH:mm")}</p>
                    <p className="text-xs text-muted-foreground">Último evento registrado. Status: {selectedIncident.status}</p>
                  </div>
                </div>
              </div>

              {selectedIncident.notifications && selectedIncident.notifications.length > 0 && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center gap-2 text-primary">
                    <History className="h-4 w-4" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider">Notificações Operacionais</h3>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-[10px] h-8">Canal</TableHead>
                          <TableHead className="text-[10px] h-8">Status</TableHead>
                          <TableHead className="text-[10px] h-8">Tentativas</TableHead>
                          <TableHead className="text-[10px] h-8">Última</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedIncident.notifications.map((n) => (
                          <TableRow key={n.id} className="h-10">
                            <TableCell className="text-[11px] py-1">{n.channel}</TableCell>
                            <TableCell className="text-[11px] py-1">
                              <Badge variant="outline" className={cn(
                                "text-[9px] px-1 h-4",
                                n.status === "SENT" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                n.status === "FAILED" ? "bg-red-50 text-red-700 border-red-200" :
                                n.status === "RETRY" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                n.status === "PROCESSING" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                "bg-slate-50 text-slate-500 border-slate-200"
                              )}>
                                {n.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] py-1 text-center">{n.attempt_count}</TableCell>
                            <TableCell className="text-[11px] py-1 whitespace-nowrap">
                              {n.last_attempt_at ? format(new Date(n.last_attempt_at), "HH:mm") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {selectedIncident.notifications.some(n => n.status === "RETRY") && (
                    <p className="text-[10px] text-amber-600 italic">
                      * Algumas notificações estão aguardando retry com backoff exponencial.
                    </p>
                  )}
                </div>
              )}


              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" size="sm" onClick={() => {
                   // Integrar com busca administrativa de Etapa 3
                   toast.info("Abrindo auditoria para este Trace...");
                   setTimeout(() => {
                      // Simular navegação para auditoria com filtro de trace
                      const url = `/auditoria?traceId=${selectedIncident.sample_trace_id}`;
                      window.open(url, '_blank');
                   }, 500);
                }}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Ver Trace
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("block font-medium", className)}>{children}</span>;
}


