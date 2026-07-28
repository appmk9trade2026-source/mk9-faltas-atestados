import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type BarraItem = { nome: string; total: number; cor?: string | null; id?: string | null };

/**
 * Substitui visualmente gráficos de pizza/donut de baixa legibilidade por
 * barras horizontais com valor, percentual e cor semântica.
 * Puramente apresentacional — mesmos dados, mesma ordenação.
 */
export function BarrasDistribuicao({
  itens,
  loading,
  corPadrao = "hsl(var(--primary))",
  onSelect,
  emptyLabel = "Nenhum dado encontrado para os filtros atuais.",
  limit,
}: {
  itens: BarraItem[];
  loading?: boolean;
  corPadrao?: string;
  onSelect?: (item: BarraItem) => void;
  emptyLabel?: string;
  limit?: number;
}) {
  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const lista = (limit ? itens.slice(0, limit) : itens).filter((i) => i.nome);
  if (lista.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const soma = lista.reduce((a, i) => a + i.total, 0) || 1;
  const max = Math.max(...lista.map((i) => i.total), 1);

  return (
    <ul className="space-y-2">
      {lista.map((it, i) => {
        const share = Math.round((it.total / soma) * 100);
        const cor = it.cor ?? corPadrao;
        const Row = onSelect ? "button" : "div";
        return (
          <li key={`${it.nome}-${i}`}>
            <Row
              {...(onSelect
                ? {
                    type: "button" as const,
                    onClick: () => onSelect(it),
                    "aria-label": `${it.nome}: ${it.total} ocorrência(s), ${share}% do total. Filtrar.`,
                  }
                : {})}
              className={cn(
                "w-full rounded-md px-1.5 py-1 text-left transition-colors duration-200",
                onSelect && "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: cor }} aria-hidden />
                  <span className="truncate text-xs font-medium">{it.nome}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums">
                  <span className="font-semibold">{it.total}</span>
                  <span className="ml-1 text-muted-foreground">{share}%</span>
                </span>
              </span>
              <span className="mt-1 block h-2 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(2, (it.total / max) * 100)}%`, backgroundColor: cor }}
                />
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
