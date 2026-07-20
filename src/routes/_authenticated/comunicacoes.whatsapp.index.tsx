import { WhatsappRouteError, WhatsappRouteLoading, WhatsappRouteNotFound } from "@/components/whatsapp/route-boundaries";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCheck, Clock, Eye, MessageSquare, RefreshCw, Send, XOctagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/whatsapp/kpi-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { fmtSeconds, avgSeconds } from "@/lib/whatsapp-format";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/")({
  component: DashboardPage,
  errorComponent: ({ error, reset }) => <WhatsappRouteError error={error} reset={reset} />,
  notFoundComponent: () => <WhatsappRouteNotFound />,
  pendingComponent: () => <WhatsappRouteLoading />,
});

type Row = {
  status: string;
  created_at: string;
  enviado_em: string | null;
  confirmado_em: string | null;
  processado_em: string | null;
  template_codigo: string | null;
};

function daysAgoISO(d: number) {
  return new Date(Date.now() - d * 86400_000).toISOString();
}

function DashboardPage() {
  const [days, setDays] = useState<number>(7);
  const [templateFilter, setTemplateFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const q = useQuery({
    queryKey: ["wa-admin-kpis", days, templateFilter],
    refetchInterval: autoRefresh ? 30_000 : false,
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_outbox")
        .select("status, created_at, enviado_em, confirmado_em, processado_em, template_codigo")
        .gte("created_at", daysAgoISO(days))
        .limit(10000);
      if (templateFilter.trim()) {
        query = query.ilike("template_codigo", `%${templateFilter.trim()}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const kpis = useMemo(() => {
    const rows = q.data ?? [];
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const pend = count("PENDENTE");
    const proc = count("PROCESSANDO");
    const enviado = count("ENVIADO");
    const entregue = count("ENTREGUE");
    const lido = count("LIDO");
    const ft = count("FALHOU_TEMPORARIO");
    const fd = count("FALHOU_DEFINITIVO");
    const canc = count("CANCELADO");

    const totalTerm = enviado + entregue + lido + fd + canc;
    const deliveredOrRead = entregue + lido;
    const taxaEntrega = totalTerm ? (deliveredOrRead / totalTerm) * 100 : null;
    const taxaLeitura = totalTerm ? (lido / totalTerm) * 100 : null;

    const secondsBetween = (a: string | null, b: string | null): number | null => {
      if (!a || !b) return null;
      return (new Date(b).getTime() - new Date(a).getTime()) / 1000;
    };
    const tMed = (mapper: (r: Row) => number | null) =>
      avgSeconds(rows.map((r) => ({ seconds: mapper(r) })));

    return {
      pend,
      proc,
      enviado,
      entregue,
      lido,
      ft,
      fd,
      canc,
      taxaEntrega,
      taxaLeitura,
      tempoEnvio: tMed((r) => secondsBetween(r.created_at, r.enviado_em)),
      tempoEntrega: tMed((r) => secondsBetween(r.enviado_em, r.confirmado_em)),
      tempoLeitura: tMed((r) => secondsBetween(r.enviado_em, r.confirmado_em)),
    };
  }, [q.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dashboard operacional</h2>
          <p className="text-sm text-muted-foreground">
            Visão consolidada da mensageria dos últimos {days} dias.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Período (dias)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
              className="w-24"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Template contém</Label>
            <Input
              placeholder="ATESTADO..."
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch id="auto" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="auto" className="text-xs">
              Auto-refresh 30s
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pendentes" value={kpis.pend} tone="warn" icon={<Clock className="h-5 w-5" />} loading={q.isLoading} />
        <KpiCard label="Processando" value={kpis.proc} tone="info" icon={<Activity className="h-5 w-5" />} loading={q.isLoading} />
        <KpiCard label="Enviadas" value={kpis.enviado} tone="info" icon={<Send className="h-5 w-5" />} loading={q.isLoading} />
        <KpiCard label="Entregues" value={kpis.entregue} tone="success" icon={<CheckCheck className="h-5 w-5" />} loading={q.isLoading} />
        <KpiCard label="Lidas" value={kpis.lido} tone="success" icon={<Eye className="h-5 w-5" />} loading={q.isLoading} />
        <KpiCard label="Falhas temporárias" value={kpis.ft} tone="warn" loading={q.isLoading} />
        <KpiCard label="Falhas definitivas" value={kpis.fd} tone="danger" icon={<XOctagon className="h-5 w-5" />} loading={q.isLoading} />
        <KpiCard label="Canceladas" value={kpis.canc} loading={q.isLoading} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Taxa de entrega"
          value={kpis.taxaEntrega == null ? "—" : `${kpis.taxaEntrega.toFixed(1)}%`}
          tone="success"
          loading={q.isLoading}
        />
        <KpiCard
          label="Taxa de leitura"
          value={kpis.taxaLeitura == null ? "—" : `${kpis.taxaLeitura.toFixed(1)}%`}
          tone="info"
          icon={<MessageSquare className="h-5 w-5" />}
          loading={q.isLoading}
        />
        <KpiCard label="Tempo médio até envio" value={fmtSeconds(kpis.tempoEnvio)} loading={q.isLoading} />
        <KpiCard label="Tempo médio até entrega" value={fmtSeconds(kpis.tempoEntrega)} loading={q.isLoading} />
      </div>

      {q.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Erro ao carregar KPIs: {(q.error as Error).message}
        </div>
      ) : null}
    </div>
  );
}

// Keep useEffect import used (auto-refresh could be extended later).
useEffect;
