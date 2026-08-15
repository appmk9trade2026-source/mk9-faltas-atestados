import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { getSystemHealth, listHealthIncidents } from "@/lib/health.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/saude-sistema")({
  component: SaudeSistemaPage,
});

function SaudeSistemaPage() {
  const [traceId, setTraceId] = useState("");
  
  const healthQ = useQuery({
    queryKey: ["health-consolidated"],
    queryFn: () => getSystemHealth({}),
    refetchInterval: 60000,
  });

  const incidentsQ = useQuery({
    queryKey: ["health-incidents", { traceId }],
    queryFn: () => listHealthIncidents({ data: { traceId: traceId || undefined } }),
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

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
