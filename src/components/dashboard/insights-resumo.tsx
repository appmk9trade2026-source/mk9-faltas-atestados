import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { buildInsights, type InsightsInput } from "./insights-automaticos";

const TOM: Record<string, { chip: string; dot: string; texto: string }> = {
  critico: { chip: "border-destructive/30 bg-destructive/5", dot: "bg-destructive", texto: "Crítico" },
  atencao: { chip: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-500", texto: "Atenção" },
  positivo: { chip: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-500", texto: "Positivo" },
  neutro: { chip: "border-border bg-muted/40", dot: "bg-sky-500", texto: "Informativo" },
};

/**
 * Resumo executivo dos insights — até 3 destaques, logo abaixo dos KPIs.
 * Consome exatamente a mesma função `buildInsights` do bloco completo.
 * Nenhuma lógica duplicada, nenhuma consulta nova.
 */
export function InsightsResumo({ input, loading }: { input: InsightsInput; loading: boolean }) {
  const destaques = useMemo(() => buildInsights(input).slice(0, 3), [input]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (destaques.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Não há informações suficientes para gerar destaques neste período.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="Destaques rápidos do período">
      {destaques.map((i) => {
        const t = TOM[i.tom] ?? TOM.neutro;
        return (
          <li
            key={i.id}
            className={cn(
              "flex animate-in fade-in items-start gap-2.5 rounded-xl border px-3.5 py-3 duration-200",
              t.chip,
            )}
          >
            <span className="mt-1 flex items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t.texto}
              </span>
              <span className="block text-xs leading-relaxed text-foreground">{i.texto}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
