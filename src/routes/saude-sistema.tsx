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
      </div>
    </AppShell>
  );
}

