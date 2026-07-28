import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionTone = "neutro" | "atencao" | "positivo";

const TONE: Record<SectionTone, { icon: string; rule: string }> = {
  neutro: { icon: "bg-primary/10 text-primary", rule: "bg-primary/20" },
  atencao: { icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400", rule: "bg-amber-500/30" },
  positivo: { icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", rule: "bg-emerald-500/30" },
};

/**
 * Cabeçalho de bloco executivo. Puramente apresentacional.
 */
export function SectionHeader({
  id,
  title,
  question,
  description,
  icon: Icon,
  tone = "neutro",
  action,
}: {
  id?: string;
  title: string;
  question?: string;
  description?: string;
  icon?: LucideIcon;
  tone?: SectionTone;
  action?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={cn("mt-0.5 rounded-lg p-2", t.icon)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 id={id} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            {question && (
              <span className="text-xs text-muted-foreground">{question}</span>
            )}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}
