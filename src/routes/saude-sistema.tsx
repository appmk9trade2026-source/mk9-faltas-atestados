import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { getSystemHealth, listHealthIncidents, type IncidentRow } from "@/lib/health.functions";
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
            
            {Object.entries(healthQ.data?.modules ?? {}).map(([name, mod]) => (
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
                    <TableHead>Status</TableHead>
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
                    incidentsQ.data.incidents.map((incident) => (
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


