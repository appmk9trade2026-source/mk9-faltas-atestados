import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useServerFn } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthDot } from "@/components/whatsapp/status-badge";
import { fmtDate, fmtDuration } from "@/lib/whatsapp-format";
import { getWhatsappHealth } from "@/lib/whatsapp-admin.functions";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/health")({
  component: HealthPage,
});

function HealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const getHealth = useServerFn(getWhatsappHealth);
  const q = useQuery({
    queryKey: ["wa-health"],
    queryFn: () => getHealth(),
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const h = q.data;
  const workerTone: "success" | "warn" | "danger" | "muted" = !h
    ? "muted"
    : h.worker.ok
      ? "success"
      : (h.worker.age_minutes ?? 999) < 15
        ? "warn"
        : "danger";
  const providerTone: "success" | "danger" | "muted" = !h
    ? "muted"
    : h.provider.enabled
      ? "success"
      : "danger";
  const stuckTone: "success" | "warn" | "danger" =
    !h || h.queue.stuck_over_10min === 0 ? "success" : h.queue.stuck_over_10min < 5 ? "warn" : "danger";
  const dlqTone: "success" | "warn" | "danger" =
    !h || h.queue.dead_letter_last_24h === 0 ? "success" : h.queue.dead_letter_last_24h < 10 ? "warn" : "danger";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Health Check</h2>
          <p className="text-sm text-muted-foreground">
            Indicadores calculados a partir do banco — nenhuma consulta é feita à Evolution API.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="ah" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="ah" className="text-xs">Auto-refresh 30s</Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {q.isLoading || !h ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-2"><HealthDot tone={workerTone} /><span className="text-sm font-medium">Worker</span></div>
            <p className="mt-2 text-xs text-muted-foreground">
              Última execução: <span className="text-foreground">{fmtDate(h.worker.last_started_at)}</span>
              {h.worker.age_minutes != null ? ` · há ${h.worker.age_minutes} min` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Status: <span className="text-foreground">{h.worker.last_status ?? "—"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Duração média (20 últimas): <span className="text-foreground">{fmtDuration(h.worker.avg_duration_ms)}</span>
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><HealthDot tone={providerTone} /><span className="text-sm font-medium">Provider</span></div>
            <p className="mt-2 text-xs text-muted-foreground">Provedor: <span className="text-foreground">{h.provider.provider}</span></p>
            <p className="text-xs text-muted-foreground">Habilitado: <span className="text-foreground">{h.provider.enabled ? "Sim" : "Não"}</span></p>
            <p className="text-xs text-muted-foreground">Modo: <span className="text-foreground">{h.provider.modo}</span></p>
            <p className="text-xs text-muted-foreground">Webhook: <span className="text-foreground">{h.provider.webhook_enabled ? "Ativo" : "Inativo"}</span></p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><HealthDot tone={stuckTone} /><span className="text-sm font-medium">Mensagens travadas</span></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{h.queue.stuck_over_10min}</p>
            <p className="text-xs text-muted-foreground">em <code>PROCESSANDO</code> há mais de 10 min</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><HealthDot tone={dlqTone} /><span className="text-sm font-medium">Dead Letter (24h)</span></div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{h.queue.dead_letter_last_24h}</p>
            <p className="text-xs text-muted-foreground">mensagens em <code>FALHOU_DEFINITIVO</code> nas últimas 24h</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2"><HealthDot tone="success" /><span className="text-sm font-medium">Fonte dos dados</span></div>
            <p className="mt-2 text-xs text-muted-foreground">
              Todos os indicadores acima vêm de <code>whatsapp_outbox</code>,
              <code> whatsapp_worker_execucoes</code> e <code>whatsapp_provider_config</code>.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
