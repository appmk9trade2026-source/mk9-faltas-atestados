import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getWhatsappProviderConfig } from "@/lib/whatsapp-admin.functions";
import { fmtDate } from "@/lib/whatsapp-format";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/configuracao")({
  component: ConfigPage,
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">{value}</div>
    </div>
  );
}

function ConfigPage() {
  const getConfig = useServerFn(getWhatsappProviderConfig);
  const q = useQuery({ queryKey: ["wa-provider-config"], queryFn: () => getConfig() });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Configuração do Provedor</h2>
        <p className="text-sm text-muted-foreground">
          Somente leitura. Alterações são realizadas exclusivamente via banco de dados.
        </p>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !q.data ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Nenhuma configuração de provider encontrada.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant={q.data.enabled ? "default" : "outline"}>
              {q.data.enabled ? "Habilitado" : "Desabilitado"}
            </Badge>
            <Badge variant="outline">{q.data.modo}</Badge>
            <Badge variant="outline">{q.data.provider}</Badge>
          </div>
          <Row label="Instância" value={q.data.instance_name ?? "—"} />
          <Row label="Base URL (label público)" value={q.data.base_url_public_label ?? "—"} />
          <Row label="Timeout (ms)" value={q.data.timeout_ms} />
          <Row label="Máximo de tentativas" value={q.data.max_tentativas} />
          <Row label="Retry base (segundos)" value={q.data.retry_base_segundos} />
          <Row label="Retry máximo (segundos)" value={q.data.retry_max_segundos} />
          <Row label="Batch size" value={q.data.batch_size} />
          <Row label="Webhook habilitado" value={q.data.webhook_enabled ? "Sim" : "Não"} />
          <Row label="Atualizado em" value={fmtDate(q.data.updated_at)} />
        </Card>
      )}

      <Card className="border-dashed p-4 text-xs text-muted-foreground">
        Credenciais (API key, secret) nunca são exibidas neste painel. Elas ficam apenas em variáveis de ambiente do servidor.
      </Card>
    </div>
  );
}
