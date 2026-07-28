import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MK9_BRAND } from "@/lib/mk9-palette";


export type PorDiaPonto = { dia: string; total: number; pendentes: number; lancadas: number };

type SerieKey = "total" | "pendentes" | "lancadas";

const SERIES: Array<{ key: SerieKey; label: string; color: string; hint: string }> = [
  { key: "total", label: "Ausências", color: MK9_BRAND.primary, hint: "Total de ocorrências registradas no dia" },
  { key: "pendentes", label: "Pendências", color: "#f59e0b", hint: "Ocorrências ainda pendentes de lançamento" },
  { key: "lancadas", label: "Lançamentos concluídos", color: "#10b981", hint: "Ocorrências já lançadas" },
];

function labelDia(dia: string) {
  try {
    return format(parseISO(dia), "dd/MM", { locale: ptBR });
  } catch {
    return dia;
  }
}

/**
 * BLOCO 2 — Tendências da operação.
 * Um único gráfico principal multi-série, alimentado por `por_dia` (dados já carregados).
 * Nenhuma consulta nova.
 */
export function TendenciasChart({
  porDia,
  loading,
}: {
  porDia: PorDiaPonto[];
  loading: boolean;
}) {
  const [ativas, setAtivas] = useState<Record<SerieKey, boolean>>({
    total: true,
    pendentes: true,
    lancadas: true,
  });
  const [hover, setHover] = useState<SerieKey | null>(null);

  const dados = useMemo(
    () => porDia.map((p) => ({ ...p, label: labelDia(p.dia) })),
    [porDia],
  );

  function toggle(k: SerieKey) {
    setAtivas((s) => {
      const next = { ...s, [k]: !s[k] };
      if (!next.total && !next.pendentes && !next.lancadas) return s; // sempre 1 série visível
      return next;
    });
  }


  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm">Evolução no período</CardTitle>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Ausências, pendências e lançamentos concluídos ao longo do período selecionado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ligar ou desligar séries do gráfico">
            {SERIES.map((s) => {
              const on = ativas[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  aria-pressed={on}
                  title={s.hint}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-foreground/20 bg-muted text-foreground" : "border-border text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: on ? s.color : "transparent", border: `2px solid ${s.color}` }}
                    aria-hidden
                  />
                  {s.label}
                  <span className="sr-only">{on ? " (série visível)" : " (série oculta)"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : dados.length < 2 ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 text-center">
            <span className="rounded-full bg-muted p-3 text-muted-foreground">
              <LineChartIcon className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">
              Não há dados suficientes para exibir tendência.
            </p>
            <p className="max-w-xs text-xs text-muted-foreground/80">
              Selecione um período maior para acompanhar a evolução da operação.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={dados} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: 12,
                }}
                labelFormatter={(l) => `Dia ${l}`}
                formatter={(v: number, name: string) => [`${v} ocorrência(s)`, name]}
              />
              {SERIES.filter((s) => ativas[s.key]).map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
