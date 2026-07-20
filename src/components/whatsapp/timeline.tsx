import { CheckCircle2, Circle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { fmtDate, sanitizeMetadata, type WaStatus } from "@/lib/whatsapp-format";

export type TimelineEvent = {
  id: string;
  evento: string;
  status_anterior: WaStatus | null;
  status_novo: WaStatus | null;
  codigo: string | null;
  mensagem_resumida: string | null;
  metadata_segura: unknown;
  created_at: string;
};

function eventIcon(evento: string, status: string | null) {
  if (status === "FALHOU_DEFINITIVO") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "FALHOU_TEMPORARIO") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "LIDO" || status === "ENTREGUE") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (evento.startsWith("REENFILEIRADO")) return <RefreshCw className="h-4 w-4 text-sky-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export function WhatsappTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhum evento registrado ainda.
      </div>
    );
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {events.map((ev) => {
        const meta = sanitizeMetadata(ev.metadata_segura);
        const metaKeys = Object.keys(meta);
        return (
          <li key={ev.id} className="relative">
            <span className="absolute -left-[30px] top-1 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
              {eventIcon(ev.evento, ev.status_novo)}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{ev.evento}</span>
              {ev.status_anterior && ev.status_novo ? (
                <span className="text-xs text-muted-foreground">
                  {ev.status_anterior} → {ev.status_novo}
                </span>
              ) : ev.status_novo ? (
                <span className="text-xs text-muted-foreground">{ev.status_novo}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{fmtDate(ev.created_at)}</p>
            {ev.mensagem_resumida ? (
              <p className="mt-1 text-xs">{ev.mensagem_resumida}</p>
            ) : null}
            {ev.codigo ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Código: {ev.codigo}</p>
            ) : null}
            {metaKeys.length ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                  Metadata segura ({metaKeys.length})
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded border bg-muted/50 p-2 text-[11px]">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
