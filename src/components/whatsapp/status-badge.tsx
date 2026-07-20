import { Badge } from "@/components/ui/badge";
import { WA_STATUS_LABEL, statusTone, type WaStatus } from "@/lib/whatsapp-format";

const TONE_CLASS: Record<ReturnType<typeof statusTone>, string> = {
  success:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 hover:bg-red-500/20",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/20",
  muted:
    "bg-muted text-muted-foreground border-border hover:bg-muted",
};

export function WhatsappStatusBadge({ status }: { status: WaStatus | string | null | undefined }) {
  const tone = statusTone(status);
  const label = (status && WA_STATUS_LABEL[status as WaStatus]) || String(status ?? "—");
  return (
    <Badge variant="outline" className={`font-medium ${TONE_CLASS[tone]}`}>
      {label}
    </Badge>
  );
}

export function HealthDot({ tone }: { tone: "success" | "warn" | "danger" | "muted" }) {
  const cls =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "danger"
          ? "bg-red-500"
          : "bg-muted-foreground/50";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />;
}
