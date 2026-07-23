import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RankItem = {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  badge?: string;
  badgeCls?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  href: any;
};

/**
 * RankingWidget — componente compartilhado de ranking usado nas telas
 * de Inteligência (Dashboard Executivo, Ranking de Supervisores, Inteligência Analítica).
 * Mantém a mesma UI para consistência visual do Design System MK9.
 */
export function RankingWidget({
  title,
  subtitle,
  icon: Icon,
  items,
  emptyText,
  action,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  items: RankItem[];
  emptyText: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-[11px]">{subtitle}</CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
        ) : (
          <ol className="space-y-1">
            {items.map((it, i) => (
              <li key={it.id}>
                <Link
                  {...it.href}
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60"
                >
                  <span className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold tabular-nums",
                    i === 0 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : i === 1 ? "bg-slate-400/20 text-slate-500"
                      : i === 2 ? "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium leading-tight group-hover:text-primary">{it.title}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground">{it.subtitle}</div>
                  </div>
                  {it.badge && (
                    <Badge variant="outline" className={cn("text-[9.5px] px-1.5 py-0", it.badgeCls)}>{it.badge}</Badge>
                  )}
                  <span className="text-xs font-semibold tabular-nums">{it.value}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
