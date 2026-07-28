import { useMemo } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Lightbulb, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type InsightsInput = {
  kpis?: { total: number; pendentes: number; lancadas: number; faltas: number; colaboradores_ativos: number };
  prev?: { total: number; pendentes: number; lancadas: number; faltas: number; colaboradores_ativos: number };
  top_projetos?: Array<{ nome: string; total: number }>;
  top_empresas?: Array<{ nome: string; total: number }>;
  top_supervisores?: Array<{ nome: string; total: number }>;
  heatmap?: Array<{ dow: number; total: number }>;
};

type Insight = {
  id: string;
  texto: string;
  tom: "critico" | "atencao" | "positivo" | "neutro";
  icon: LucideIcon;
  peso: number;
};

const DOW = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const pct = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(v))}%`;

/** Regras determinísticas — sem IA, sem consultas novas. */
export function buildInsights(input: InsightsInput): Insight[] {
  const { kpis, prev } = input;
  if (!kpis) return [];
  const out: Insight[] = [];

  const variacao = (c: number, p: number) => (p > 0 ? ((c - p) / p) * 100 : null);

  const vTotal = prev ? variacao(kpis.total, prev.total) : null;
  if (vTotal !== null && Math.abs(vTotal) >= 5) {
    out.push({
      id: "total",
      texto: `As ausências ${vTotal > 0 ? "cresceram" : "recuaram"} ${pct(vTotal)} em relação ao período anterior.`,
      tom: vTotal > 0 ? "critico" : "positivo",
      icon: vTotal > 0 ? ArrowUpRight : ArrowDownRight,
      peso: 100 + Math.abs(vTotal),
    });
  }

  const vPend = prev ? variacao(kpis.pendentes, prev.pendentes) : null;
  if (vPend !== null && Math.abs(vPend) >= 10) {
    out.push({
      id: "pend",
      texto: `As pendências de lançamento ${vPend > 0 ? "aumentaram" : "diminuíram"} ${pct(vPend)} no período.`,
      tom: vPend > 0 ? "atencao" : "positivo",
      icon: vPend > 0 ? AlertTriangle : ArrowDownRight,
      peso: 90 + Math.abs(vPend) / 2,
    });
  }

  const projetos = input.top_projetos ?? [];
  const somaProj = projetos.reduce((a, p) => a + p.total, 0);
  if (projetos.length > 0 && somaProj > 0) {
    const top = projetos[0];
    const share = (top.total / somaProj) * 100;
    if (share >= 25) {
      out.push({
        id: "projeto",
        texto: `O projeto ${top.nome} concentra ${pct(share)} das ocorrências do período.`,
        tom: share >= 50 ? "critico" : "atencao",
        icon: Target,
        peso: 80 + share / 2,
      });
    }
  }

  const empresas = input.top_empresas ?? [];
  const somaEmp = empresas.reduce((a, e) => a + e.total, 0);
  if (empresas.length > 1 && somaEmp > 0) {
    const top = empresas[0];
    const share = (top.total / somaEmp) * 100;
    if (share >= 30) {
      out.push({
        id: "empresa",
        texto: `A empresa ${top.nome} responde por ${pct(share)} das ocorrências registradas.`,
        tom: "atencao",
        icon: Target,
        peso: 70 + share / 3,
      });
    }
  }

  const sups = (input.top_supervisores ?? []).filter((s) => s.nome && s.nome !== "(Sem supervisor)");
  const somaSup = sups.reduce((a, s) => a + s.total, 0);
  if (sups.length > 1 && somaSup > 0) {
    const top = sups[0];
    const share = (top.total / somaSup) * 100;
    if (share >= 25) {
      out.push({
        id: "supervisor",
        texto: `O supervisor ${top.nome} concentra ${pct(share)} das ocorrências — priorize o acompanhamento da equipe.`,
        tom: "atencao",
        icon: AlertTriangle,
        peso: 60 + share / 3,
      });
    }
  }

  const heat = input.heatmap ?? [];
  const somaHeat = heat.reduce((a, h) => a + h.total, 0);
  if (heat.length > 1 && somaHeat > 0) {
    const top = [...heat].sort((a, b) => b.total - a.total)[0];
    const share = (top.total / somaHeat) * 100;
    if (share >= 30) {
      out.push({
        id: "dow",
        texto: `${DOW[top.dow] ?? "Um dia da semana"} concentra ${pct(share)} das ocorrências — avalie escala e cobertura.`,
        tom: "neutro",
        icon: Lightbulb,
        peso: 40 + share / 4,
      });
    }
  }

  if (kpis.total > 0 && kpis.pendentes === 0) {
    out.push({
      id: "zero-pend",
      texto: "Todas as ocorrências do período já foram lançadas — nenhuma pendência em aberto.",
      tom: "positivo",
      icon: ArrowDownRight,
      peso: 50,
    });
  }

  return out.sort((a, b) => b.peso - a.peso).slice(0, 4);
}

const TOM: Record<Insight["tom"], string> = {
  critico: "border-destructive/30 bg-destructive/5 text-destructive",
  atencao: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  positivo: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  neutro: "border-border bg-muted/40 text-foreground",
};

/** BLOCO 6 — Insights automáticos (regras determinísticas, sem IA). */
export function InsightsAutomaticos({ input, loading }: { input: InsightsInput; loading: boolean }) {
  const insights = useMemo(() => buildInsights(input), [input]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Lightbulb className="h-4 w-4" aria-hidden />
          Nenhum insight disponível para o período.
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {insights.map((i) => (
        <li key={i.id}>
          <div className={cn("flex h-full items-start gap-3 rounded-xl border p-4", TOM[i.tom])}>
            <i.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="text-sm leading-relaxed text-foreground">{i.texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
