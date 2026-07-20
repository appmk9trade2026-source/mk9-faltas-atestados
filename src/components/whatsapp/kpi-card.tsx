import { type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warn" | "danger" | "info";
  loading?: boolean;
}) {
  const toneRing =
    tone === "success"
      ? "ring-emerald-500/20"
      : tone === "warn"
        ? "ring-amber-500/20"
        : tone === "danger"
          ? "ring-red-500/20"
          : tone === "info"
            ? "ring-sky-500/20"
            : "ring-border";
  const toneIcon =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : tone === "info"
            ? "text-sky-600 dark:text-sky-400"
            : "text-muted-foreground";
  return (
    <Card className={`p-4 ring-1 ${toneRing} bg-card`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {loading ? <Skeleton className="h-7 w-20" /> : value}
          </div>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <div className={`shrink-0 ${toneIcon}`}>{icon}</div> : null}
      </div>
    </Card>
  );
}
