import { Medal, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type RankRow = { nome: string; total: number; id?: string };
export type RankTone = "neutro" | "atencao" | "critico";

const TONE: Record<RankTone, { bar: string; badge: string; card: string; title: string }> = {
  neutro: { bar: "bg-primary", badge: "bg-primary/10 text-primary", card: "", title: "" },
  atencao: {
    bar: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    card: "border-amber-500/30",
    title: "text-amber-700 dark:text-amber-400",
  },
  critico: {
    bar: "bg-destructive",
    badge: "bg-destructive/10 text-destructive",
    card: "border-destructive/30",
    title: "text-destructive",
  },
};

export function iniciais(nome?: string | null) {
  const limpo = (nome ?? "").trim();
  if (!limpo) return "--";
  const parts = limpo.split(/\s+/).filter((p) => p.length > 1);
  if (parts.length === 0) return limpo.slice(0, 2).toUpperCase() || "--";

  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Ranking legível: medalhas para o Top 3, iniciais, barra de progresso discreta.
 * Não altera ordenação nem cálculo — recebe as linhas exatamente como vêm da RPC.
 */
export function RankList({
  rows,
  tone = "neutro",
  loading,
  limit = 8,
  emptyLabel = "Nenhum dado encontrado para os filtros atuais.",
  onSelect,
  unidade = "ocorrência(s)",
}: {
  rows: RankRow[];
  tone?: RankTone;
  loading?: boolean;
  limit?: number;
  emptyLabel?: string;
  onSelect?: (row: RankRow) => void;
  unidade?: string;
}) {
  const t = TONE[tone];

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const visiveis = rows.slice(0, limit);
  if (visiveis.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const soma = rows.reduce((a, r) => a + r.total, 0) || 1;
  const max = Math.max(...visiveis.map((r) => r.total), 1);

  return (
    <ol className="space-y-1">
      {visiveis.map((r, i) => {
        const share = Math.round((r.total / soma) * 100);
        const width = Math.max(2, (r.total / max) * 100);
        const primeiro = i === 0;
        const Row = onSelect ? "button" : "div";
        return (
          <li key={`${r.nome}-${i}`}>
            <Row
              {...(onSelect
                ? {
                    type: "button" as const,
                    onClick: () => onSelect(r),
                    "aria-label": `${r.nome}: ${r.total} ${unidade} (${share}% do total). Filtrar por este item.`,
                  }
                : {})}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-200",
                "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                primeiro && "bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  i < 3 ? t.badge : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : i < 3 ? <Medal className="h-3.5 w-3.5" /> : i + 1}
              </span>

              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-[10px] font-semibold text-muted-foreground"
                aria-hidden
              >
                {iniciais(r.nome)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", primeiro && "font-semibold")}>{r.nome}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {r.total}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">({share}%)</span>
                  </span>
                </span>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full transition-all duration-300", t.bar, !primeiro && "opacity-70")}
                    style={{ width: `${width}%` }}
                  />
                </span>
              </span>
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

/** Card padrão de ranking com cabeçalho semântico. */
export function RankListCard({
  title,
  description,
  tone = "neutro",
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  tone?: RankTone;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <Card className={cn("flex h-full flex-col transition-shadow duration-200 hover:shadow-sm", t.card, className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {Icon && (
            <span className={cn("mt-0.5 rounded-md p-1", t.badge)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <CardTitle className={cn("text-sm", t.title)}>{title}</CardTitle>
            {description && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-1">{children}</CardContent>
    </Card>
  );
}
