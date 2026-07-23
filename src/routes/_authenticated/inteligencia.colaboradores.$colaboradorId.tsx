// Fase 5 — Perfil Analítico do Colaborador.
// Reutiliza as RPCs SECURITY INVOKER existentes:
//   • calcular_score_colaborador (score/composição oficial do indivíduo)
//   • calcular_score_colaboradores_lote (comparativos proporcionais)
// Todas as leituras respeitam RLS. URL fora do escopo → NOT_FOUND.
// Nenhum recálculo de score no cliente.

import * as React from "react";
import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter as FilterIcon,
  Gauge,
  Link2,
  RefreshCw,
  Repeat2,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users2,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────
type Nivel = "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA";

type Breakdown = {
  faltas?: number;
  atestados?: number;
  declaracoes?: number;
  suspensoes?: number;
  acidente_trabalho?: number;
  acidente_trajeto?: number;
  outros?: number;
  dias_perdidos?: number;
  reincidencia_bonus?: number;
  janela_dias?: number;
};

type ScoreRow = {
  colaborador_id: string;
  nome_completo?: string;
  matricula?: string;
  empresa_id?: string;
  projeto_id?: string;
  supervisor_usuario_id?: string | null;
  score: number;
  nivel: Nivel;
  total_ocorrencias: number;
  total_dias_perdidos: number;
  ultima_ocorrencia: string | null;
  breakdown: Breakdown;
};

type Config = {
  peso_falta: number;
  peso_atestado: number;
  peso_declaracao: number;
  peso_suspensao: number;
  peso_acidente_trabalho: number;
  peso_acidente_trajeto: number;
  peso_outros: number;
  peso_dia_perdido: number;
  peso_reincidencia: number;
  janela_dias: number;
  limiar_atencao: number;
  limiar_alta: number;
  limiar_critica: number;
};

type ColaboradorRow = {
  id: string;
  nome_completo: string;
  matricula: string;
  cargo: string | null;
  ativo: boolean;
  empresa_id: string;
  projeto_id: string;
  supervisor_usuario_id: string | null;
  supervisor_nome: string | null;
  data_admissao: string | null;
};

type Ausencia = {
  id: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  dias: number | null;
  quantidade_dias_calculada: number | null;
  status: string | null;
  tipo_ausencia_nome: string | null;
  tipo_ausencia_codigo: string | null;
  motivo: string | null;
  registrado_por: string | null;
  registrado_em: string | null;
  lancado_em: string | null;
};

// ─── Constantes ───────────────────────────────────────────────────────
const NIVEL_META: Record<Nivel, { label: string; dot: string; badge: string; ring: string }> = {
  BAIXA:   { label: "Baixa",    dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", ring: "ring-emerald-500/30" },
  ATENCAO: { label: "Atenção",  dot: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",         ring: "ring-amber-500/30" },
  ALTA:    { label: "Alta",     dot: "bg-orange-500",  badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",     ring: "ring-orange-500/30" },
  CRITICA: { label: "Crítica",  dot: "bg-destructive", badge: "bg-destructive/10 text-destructive border-destructive/40",                       ring: "ring-destructive/40" },
};

const PESO_LABEL: Record<string, string> = {
  faltas: "Faltas injustificadas",
  atestados: "Atestados médicos",
  declaracoes: "Declarações",
  suspensoes: "Suspensões",
  acidente_trabalho: "Acidentes de trabalho",
  acidente_trajeto: "Acidentes de trajeto",
  outros: "Outros",
  dias_perdidos: "Dias perdidos",
  reincidencia_bonus: "Bônus de reincidência",
};

const PESO_MAP: Record<string, keyof Config> = {
  faltas: "peso_falta",
  atestados: "peso_atestado",
  declaracoes: "peso_declaracao",
  suspensoes: "peso_suspensao",
  acidente_trabalho: "peso_acidente_trabalho",
  acidente_trajeto: "peso_acidente_trajeto",
  outros: "peso_outros",
  dias_perdidos: "peso_dia_perdido",
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Route ────────────────────────────────────────────────────────────
const searchSchema = z.object({
  janela: fallback(z.string(), "").default(""),        // dias — sincroniza com ranking
  evo: fallback(z.enum(["3", "6", "12", "24"]), "12").default("12"),
  tipo: fallback(z.string(), "").default(""),          // filtro timeline
  categoria: fallback(z.string(), "").default(""),
  situacao: fallback(z.string(), "").default(""),
  // filtros preservados do ranking (drill-down back)
  empresa: fallback(z.string(), "").default(""),
  projeto: fallback(z.string(), "").default(""),
  supervisor: fallback(z.string(), "").default(""),
  nivel: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "score").default("score"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
});

export const Route = createFileRoute("/_authenticated/inteligencia/colaboradores/$colaboradorId")({
  head: () => ({
    meta: [
      { title: "Perfil analítico · Inteligência · CRM MK9" },
      { name: "description", content: "Perfil analítico individual do colaborador com composição de score, evolução, timeline e comparativos." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: PerfilColaboradorPage,
  errorComponent: PerfilError,
  notFoundComponent: PerfilNotFound,
});

// ─── Helpers ──────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1]}/${String(y).slice(2)}`;
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function niceNumber(n: number, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d) : "0";
}
function breakdownKey(tipo: string, codigo: string | null): keyof Breakdown | null {
  const c = (codigo ?? tipo ?? "").toUpperCase();
  if (c === "FALTA") return "faltas";
  if (c === "ATESTADO") return "atestados";
  if (c === "DECLARACAO") return "declaracoes";
  if (c === "SUSPENSAO") return "suspensoes";
  if (c === "ACIDENTE_TRABALHO") return "acidente_trabalho";
  if (c === "ACIDENTE_TRAJETO") return "acidente_trajeto";
  return "outros";
}

// ─── Página ───────────────────────────────────────────────────────────
function PerfilColaboradorPage() {
  const { colaboradorId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { loading } = useSession();
  const scope = useSessionScope();

  const setSearch = React.useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) => {
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
    },
    [navigate],
  );

  const janelaEvo = Number(search.evo);

  // ── Config (limiares/pesos oficiais) ────────────────────────────────
  const cfgQuery = useQuery({
    queryKey: ["inteligencia", "config"],
    enabled: scope.ready,
    queryFn: async (): Promise<Config> => {
      const { data, error } = await supabase.from("absenteismo_config").select("*").limit(1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Configuração não encontrada");
      return data as Config;
    },
    staleTime: 5 * 60_000,
  });

  // ── Colaborador (RLS: bloqueia acesso fora do escopo) ───────────────
  const colabQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "colab", ...scope.keyParts, colaboradorId],
    enabled: scope.ready,
    queryFn: async (): Promise<ColaboradorRow> => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select("id, nome_completo, matricula, cargo, ativo, empresa_id, projeto_id, supervisor_usuario_id, supervisor_nome, data_admissao")
        .eq("id", colaboradorId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as ColaboradorRow;
    },
    retry: false,
  });

  const empresaId = colabQuery.data?.empresa_id ?? null;
  const projetoId = colabQuery.data?.projeto_id ?? null;

  // ── Score oficial (RPC) ─────────────────────────────────────────────
  const janelaParam = search.janela ? Number(search.janela) : undefined;
  const scoreQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "score", ...scope.keyParts, colaboradorId, janelaParam ?? "cfg"],
    enabled: scope.ready && !!colabQuery.data,
    queryFn: async (): Promise<ScoreRow> => {
      const { data, error } = await supabase.rpc("calcular_score_colaborador", {
        _colaborador_id: colaboradorId,
        _janela_dias: janelaParam,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : (data as unknown);
      if (!row) {
        return {
          colaborador_id: colaboradorId,
          score: 0, nivel: "BAIXA",
          total_ocorrencias: 0, total_dias_perdidos: 0,
          ultima_ocorrencia: null,
          breakdown: {},
        };
      }
      return row as ScoreRow;
    },
    staleTime: 60_000,
  });

  // ── Score do período anterior (para variação) ───────────────────────
  const janelaCorrente = janelaParam ?? cfgQuery.data?.janela_dias ?? 90;
  const scoreAnteriorQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "score-prev", ...scope.keyParts, colaboradorId, janelaCorrente],
    enabled: scope.ready && !!colabQuery.data && !!cfgQuery.data,
    queryFn: async (): Promise<ScoreRow | null> => {
      // Aproximação: score da janela dobrada − score atual. Como não temos janela deslocada
      // via RPC, tratamos a variação como delta contra 0 quando não há histórico configurável.
      // Preservamos a semântica: sinal de tendência.
      const { data, error } = await supabase.rpc("calcular_score_colaborador", {
        _colaborador_id: colaboradorId,
        _janela_dias: janelaCorrente * 2,
      });
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : (data as unknown);
      return (row as ScoreRow) ?? null;
    },
    staleTime: 60_000,
  });

  // ── Timeline / histórico completo do colaborador ────────────────────
  const ausenciasQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "ausencias", ...scope.keyParts, colaboradorId],
    enabled: scope.ready && !!colabQuery.data,
    queryFn: async (): Promise<Ausencia[]> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select("id, tipo, data_inicio, data_fim, dias, quantidade_dias_calculada, status, tipo_ausencia_nome, tipo_ausencia_codigo, motivo, registrado_por, registrado_em, lancado_em")
        .eq("colaborador_id", colaboradorId)
        .order("data_inicio", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Ausencia[];
    },
    staleTime: 60_000,
  });

  // ── Lote do projeto para comparativos + prev/next ───────────────────
  const loteProjetoQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "lote-projeto", ...scope.keyParts, projetoId ?? "none", janelaParam ?? null],
    enabled: scope.ready && !!projetoId,
    queryFn: async (): Promise<ScoreRow[]> => {
      const { data, error } = await supabase.rpc("calcular_score_colaboradores_lote", {
        _empresa_id: undefined,
        _projeto_id: projetoId!,
        _janela_dias: janelaParam,
      });
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  const loteEmpresaQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "lote-empresa", ...scope.keyParts, empresaId ?? "none", janelaParam ?? null],
    enabled: scope.ready && !!empresaId,
    queryFn: async (): Promise<ScoreRow[]> => {
      const { data, error } = await supabase.rpc("calcular_score_colaboradores_lote", {
        _empresa_id: empresaId!,
        _projeto_id: undefined,
        _janela_dias: janelaParam,
      });
      if (error) throw error;
      return (data ?? []) as ScoreRow[];
    },
    staleTime: 60_000,
  });

  // ── Nome do supervisor (perfil) ─────────────────────────────────────
  const supervisorQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "supervisor", colabQuery.data?.supervisor_usuario_id ?? null],
    enabled: !!colabQuery.data?.supervisor_usuario_id,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", colabQuery.data!.supervisor_usuario_id!)
        .maybeSingle();
      return (data?.nome as string) ?? null;
    },
    staleTime: 5 * 60_000,
  });

  // ── Nomes empresa/projeto ───────────────────────────────────────────
  const empresaQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "empresa", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, nome").eq("id", empresaId!).maybeSingle();
      return data?.nome ?? null;
    },
    staleTime: 5 * 60_000,
  });
  const projetoQuery = useQuery({
    queryKey: ["inteligencia", "perfil", "projeto", projetoId],
    enabled: !!projetoId,
    queryFn: async () => {
      const { data } = await supabase.from("projetos").select("id, nome").eq("id", projetoId!).maybeSingle();
      return data?.nome ?? null;
    },
    staleTime: 5 * 60_000,
  });

  // ── Derivações ──────────────────────────────────────────────────────
  const score = scoreQuery.data;
  const cfg = cfgQuery.data;
  const ausencias = ausenciasQuery.data ?? [];

  const nivel: Nivel = score?.nivel ?? "BAIXA";
  const meta = NIVEL_META[nivel];

  // Composição do score (fonte: breakdown oficial + pesos vigentes)
  const composicao = React.useMemo(() => {
    if (!score || !cfg) return [] as Array<{ key: string; label: string; qtd: number; peso: number; contrib: number }>;
    const items: Array<{ key: string; label: string; qtd: number; peso: number; contrib: number }> = [];
    Object.keys(PESO_MAP).forEach((k) => {
      const cfgKey = PESO_MAP[k];
      const qtd = Number((score.breakdown as Record<string, number>)?.[k] ?? 0);
      const peso = Number(cfg[cfgKey] ?? 0);
      const contrib = qtd * peso;
      if (qtd > 0) items.push({ key: k, label: PESO_LABEL[k], qtd, peso, contrib });
    });
    const bonus = Number(score.breakdown?.reincidencia_bonus ?? 0);
    if (bonus > 0) items.push({ key: "reincidencia_bonus", label: PESO_LABEL.reincidencia_bonus, qtd: 1, peso: bonus, contrib: bonus });
    return items.sort((a, b) => b.contrib - a.contrib);
  }, [score, cfg]);
  const totalContrib = composicao.reduce((a, c) => a + c.contrib, 0);

  // KPIs individuais (a partir do score oficial + timeline)
  const kpis = React.useMemo(() => {
    const b = score?.breakdown ?? {};
    const total = score?.total_ocorrencias ?? 0;
    const dias = score?.total_dias_perdidos ?? 0;
    const meses = Math.max(1, Math.round(((cfg?.janela_dias ?? 90) / 30)));
    const media = total / meses;

    // Reincidências (aproximação: nº de ocorrências além da 1ª por mês)
    const porMes = new Map<string, number>();
    ausencias.forEach((a) => {
      const k = monthKey(new Date(a.data_inicio));
      porMes.set(k, (porMes.get(k) ?? 0) + 1);
    });
    const reinc = Array.from(porMes.values()).reduce((acc, n) => acc + Math.max(0, n - 1), 0);

    const desde = score?.ultima_ocorrencia
      ? daysBetween(new Date(score.ultima_ocorrencia), new Date())
      : null;

    // Variação: score atual (janela X) vs (2X − X) — apenas sinal.
    const atual = Number(score?.score ?? 0);
    const dobrado = Number(scoreAnteriorQuery.data?.score ?? 0);
    const anterior = Math.max(0, dobrado - atual);
    const varDelta = atual - anterior;
    const varPct = anterior > 0 ? (varDelta / anterior) * 100 : atual > 0 ? 100 : 0;

    return {
      score: atual,
      total,
      faltas: Number(b.faltas ?? 0),
      atestados: Number(b.atestados ?? 0),
      declaracoes: Number(b.declaracoes ?? 0),
      dias,
      reinc,
      media,
      desde,
      varDelta,
      varPct,
    };
  }, [score, cfg, ausencias, scoreAnteriorQuery.data]);

  // Evolução histórica (3/6/12/24 meses) a partir da timeline (sem recalcular score)
  const evolucao = React.useMemo(() => {
    const now = new Date();
    const buckets = new Map<string, { key: string; ocorrencias: number; dias: number }>();
    for (let i = janelaEvo - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = monthKey(d);
      buckets.set(k, { key: k, ocorrencias: 0, dias: 0 });
    }
    ausencias.forEach((a) => {
      const d = new Date(a.data_inicio);
      const diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diffMonths < 0 || diffMonths >= janelaEvo) return;
      const k = monthKey(d);
      const b = buckets.get(k);
      if (!b) return;
      b.ocorrencias += 1;
      b.dias += Number(a.quantidade_dias_calculada ?? a.dias ?? 0);
    });
    return Array.from(buckets.values()).map((b) => ({
      mes: monthLabel(b.key),
      ocorrencias: b.ocorrencias,
      dias: b.dias,
    }));
  }, [ausencias, janelaEvo]);

  // Padrões: dia da semana / mês
  const padraoDiaSemana = React.useMemo(() => {
    const arr = DIAS_SEMANA.map((d, i) => ({ dia: d, idx: i, qtd: 0 }));
    ausencias.forEach((a) => {
      const d = new Date(a.data_inicio);
      arr[d.getDay()].qtd += 1;
    });
    return arr;
  }, [ausencias]);
  const padraoMes = React.useMemo(() => {
    const arr = MESES.map((m, i) => ({ mes: m, idx: i, qtd: 0 }));
    ausencias.forEach((a) => {
      const d = new Date(a.data_inicio);
      arr[d.getMonth()].qtd += 1;
    });
    return arr;
  }, [ausencias]);

  // Tendência descritiva (compara 1ª e 2ª metade da janela de evolução)
  const tendencia = React.useMemo((): { label: string; icon: React.ComponentType<{ className?: string }>; tone: string } => {
    if (evolucao.length < 2) return { label: "Sem dados suficientes.", icon: Activity, tone: "text-muted-foreground" };
    const meio = Math.floor(evolucao.length / 2);
    const a = evolucao.slice(0, meio).reduce((s, x) => s + x.ocorrencias, 0);
    const b = evolucao.slice(meio).reduce((s, x) => s + x.ocorrencias, 0);
    if (a === 0 && b === 0) return { label: "Sem ocorrências no período.", icon: Activity, tone: "text-muted-foreground" };
    if (b > a * 1.15) return { label: "Tendência de aumento observada no período.", icon: TrendingUp, tone: "text-destructive" };
    if (a > b * 1.15) return { label: "Tendência de redução observada no período.", icon: TrendingDown, tone: "text-emerald-500" };
    return { label: "Estabilidade no período.", icon: Activity, tone: "text-muted-foreground" };
  }, [evolucao]);

  const maiorDiaSemana = React.useMemo(() => {
    const top = [...padraoDiaSemana].sort((x, y) => y.qtd - x.qtd)[0];
    if (!top || top.qtd === 0) return null;
    return `Maior concentração de ocorrências às ${top.dia.toLowerCase()}s-feiras.`.replace("sábs", "sábados").replace("doms", "domingos");
  }, [padraoDiaSemana]);

  // Comparativos proporcionais (score/ocorr por colaborador/dias)
  const comparativos = React.useMemo(() => {
    const projeto = loteProjetoQuery.data ?? [];
    const empresa = loteEmpresaQuery.data ?? [];
    const team = (loteProjetoQuery.data ?? []).filter(
      (r) => r.supervisor_usuario_id && r.supervisor_usuario_id === colabQuery.data?.supervisor_usuario_id,
    );
    const stat = (rows: ScoreRow[]) => {
      if (rows.length === 0) return { n: 0, score: 0, dias: 0, ocorr: 0 };
      const n = rows.length;
      return {
        n,
        score: rows.reduce((s, r) => s + Number(r.score ?? 0), 0) / n,
        dias: rows.reduce((s, r) => s + Number(r.total_dias_perdidos ?? 0), 0) / n,
        ocorr: rows.reduce((s, r) => s + Number(r.total_ocorrencias ?? 0), 0) / n,
      };
    };
    return {
      projeto: stat(projeto),
      empresa: stat(empresa),
      equipe: stat(team),
    };
  }, [loteProjetoQuery.data, loteEmpresaQuery.data, colabQuery.data?.supervisor_usuario_id]);

  // Prev/Next no ranking do projeto (proxy respeitando escopo)
  const navRank = React.useMemo(() => {
    const arr = loteProjetoQuery.data ?? [];
    if (arr.length === 0) return { prev: null, next: null, idx: -1, total: 0 };
    const ordered = [...arr].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
    const idx = ordered.findIndex((r) => r.colaborador_id === colaboradorId);
    return {
      prev: idx > 0 ? ordered[idx - 1].colaborador_id : null,
      next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1].colaborador_id : null,
      idx,
      total: ordered.length,
    };
  }, [loteProjetoQuery.data, colaboradorId]);

  // Filtros da timeline
  const timeline = React.useMemo(() => {
    return ausencias.filter((a) => {
      if (search.situacao && a.status !== search.situacao) return false;
      if (search.tipo && (a.tipo_ausencia_codigo ?? a.tipo) !== search.tipo) return false;
      if (search.categoria) {
        const key = breakdownKey(a.tipo, a.tipo_ausencia_codigo);
        if (search.categoria === "FALTAS" && key !== "faltas") return false;
        if (search.categoria === "ATESTADOS" && key !== "atestados") return false;
        if (search.categoria === "DECLARACOES" && key !== "declaracoes") return false;
        if (search.categoria === "SUSPENSOES" && key !== "suspensoes") return false;
        if (search.categoria === "ACIDENTES" && key !== "acidente_trabalho" && key !== "acidente_trajeto") return false;
        if (search.categoria === "OUTROS" && key !== "outros") return false;
      }
      return true;
    });
  }, [ausencias, search.tipo, search.categoria, search.situacao]);

  const backSearch = {
    empresa: search.empresa,
    projeto: search.projeto,
    supervisor: search.supervisor,
    nivel: search.nivel,
    tipo: search.tipo,
    categoria: search.categoria,
    janela: search.janela,
    q: search.q,
    sort: search.sort,
    dir: search.dir,
  } as Record<string, string>;

  const isLoading = loading || colabQuery.isLoading || scoreQuery.isLoading || cfgQuery.isLoading;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link do perfil copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Perfil analítico">
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!colabQuery.data) {
    // Também tratado por notFound(); fallback defensivo.
    return <PerfilNotFound />;
  }

  const c = colabQuery.data;
  const supervisorNome = supervisorQuery.data ?? c.supervisor_nome ?? "—";
  const empresaNome = empresaQuery.data ?? "—";
  const projetoNome = projetoQuery.data ?? "—";

  const varPositive = kpis.varDelta > 0;
  const varZero = Math.abs(kpis.varDelta) < 0.05;

  return (
    <AppShell title="Perfil analítico do colaborador">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          {/* Voltar + navegação */}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inteligencia" search={backSearch as never}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao ranking
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={!navRank.prev}
                asChild={!!navRank.prev}
              >
                {navRank.prev ? (
                  <Link
                    to="/inteligencia/colaboradores/$colaboradorId"
                    params={{ colaboradorId: navRank.prev }}
                    search={search as never}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Link>
                ) : <span><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</span>}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {navRank.idx >= 0 ? `${navRank.idx + 1} / ${navRank.total}` : "—"}
              </span>
              <Button variant="outline" size="sm" disabled={!navRank.next} asChild={!!navRank.next}>
                {navRank.next ? (
                  <Link
                    to="/inteligencia/colaboradores/$colaboradorId"
                    params={{ colaboradorId: navRank.next }}
                    search={search as never}
                  >
                    Próximo <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                ) : <span>Próximo <ChevronRight className="h-4 w-4 ml-1" /></span>}
              </Button>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-2" /> Copiar link
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => { void scoreQuery.refetch(); void ausenciasQuery.refetch(); }}
                disabled={scoreQuery.isFetching || ausenciasQuery.isFetching}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", (scoreQuery.isFetching || ausenciasQuery.isFetching) && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </div>

          {/* Cabeçalho analítico */}
          <Card className={cn("border ring-1", meta.ring)}>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-12 w-12 rounded-full grid place-items-center text-lg font-semibold uppercase", meta.badge)}>
                      {c.nome_completo.slice(0, 1)}
                    </div>
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight">{c.nome_completo}</h1>
                      <p className="text-sm text-muted-foreground">
                        Matrícula {c.matricula}{c.cargo ? ` · ${c.cargo}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline" className={cn("gap-1.5 border", meta.badge)}>
                      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className={c.ativo ? "border-emerald-500/30 text-emerald-500" : "border-muted"}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {empresaNome}
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> {projetoNome}
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <UserCog className="h-3 w-3" /> {supervisorNome}
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" /> Janela: {janelaCorrente} dias
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Última: {fmtDate(score?.ultima_ocorrencia ?? null)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Score atual</p>
                  <p className="text-5xl font-semibold tabular-nums leading-none">{niceNumber(kpis.score)}</p>
                  <p className={cn("text-xs mt-2 inline-flex items-center gap-1 tabular-nums",
                    varZero ? "text-muted-foreground" : varPositive ? "text-destructive" : "text-emerald-500")}>
                    {varZero ? <Activity className="h-3 w-3" /> : varPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {varZero ? "estável" : `${varPositive ? "+" : ""}${niceNumber(kpis.varPct)}% vs. período anterior`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPIs individuais */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiTile icon={Gauge} label="Score atual" value={niceNumber(kpis.score)} tooltip="Score oficial vindo da RPC (fonte única)." />
            <KpiTile icon={Users2} label="Ocorrências" value={kpis.total} tooltip="Total de eventos na janela vigente." />
            <KpiTile icon={AlertTriangle} label="Faltas" value={kpis.faltas} />
            <KpiTile icon={Stethoscope} label="Atestados" value={kpis.atestados} />
            <KpiTile icon={CalendarDays} label="Declarações" value={kpis.declaracoes} />
            <KpiTile icon={CalendarClock} label="Dias perdidos" value={kpis.dias} />
            <KpiTile icon={Repeat2} label="Reincidências" value={kpis.reinc} tooltip="Ocorrências além da 1ª no mesmo mês." />
            <KpiTile icon={Activity} label="Média/mês" value={niceNumber(kpis.media, 2)} />
            <KpiTile
              icon={CalendarClock}
              label="Última ocorrência"
              value={kpis.desde == null ? "—" : `${kpis.desde}d`}
              tooltip="Dias desde a última ocorrência registrada."
            />
            <KpiTile
              icon={varPositive ? TrendingUp : TrendingDown}
              label="Variação vs. anterior"
              value={`${varPositive ? "+" : ""}${niceNumber(kpis.varPct)}%`}
              tone={varZero ? undefined : varPositive ? "critical" : "positive"}
            />
          </div>

          {/* Composição do score */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Composição do score</CardTitle>
                  <CardDescription>Fatores oficiais aplicados aos pesos vigentes.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Janela:</span>
                  <Select value={search.janela || "__cfg__"} onValueChange={(v) => setSearch({ janela: v === "__cfg__" ? "" : v })}>
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__cfg__">Padrão da configuração</SelectItem>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                      <SelectItem value="60">Últimos 60 dias</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                      <SelectItem value="180">Últimos 180 dias</SelectItem>
                      <SelectItem value="365">Últimos 365 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {composicao.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sem fatores positivos na janela vigente.
                </p>
              ) : (
                <div className="space-y-2">
                  {composicao.map((c) => {
                    const pct = totalContrib > 0 ? (c.contrib / totalContrib) * 100 : 0;
                    return (
                      <div key={c.key} className="rounded-md border p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{c.label}</span>
                          <span className="tabular-nums font-semibold">+{c.contrib.toFixed(1)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{c.key === "reincidencia_bonus" ? "aplicado" : `${c.qtd} × peso ${c.peso}`}</span>
                          <span className="tabular-nums">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evolução histórica */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Evolução histórica</CardTitle>
                  <CardDescription>Ocorrências e dias perdidos por mês.</CardDescription>
                </div>
                <Select value={search.evo} onValueChange={(v) => setSearch({ evo: v as "3" | "6" | "12" | "24" })}>
                  <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Últimos 3 meses</SelectItem>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                    <SelectItem value="24">Últimos 24 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucao} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gOcorr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gDias" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="ocorrencias" name="Ocorrências" stroke="hsl(var(--primary))" fill="url(#gOcorr)" strokeWidth={2} />
                    <Area type="monotone" dataKey="dias" name="Dias perdidos" stroke="hsl(var(--destructive))" fill="url(#gDias)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Comparativos + Padrões (grid) */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comparativos</CardTitle>
                <CardDescription>Médias proporcionais — sem revelar dados individuais.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <ComparativoRow label="Projeto" self={kpis.score} avg={comparativos.projeto.score} n={comparativos.projeto.n} suffix="score médio" />
                <ComparativoRow label="Empresa" self={kpis.score} avg={comparativos.empresa.score} n={comparativos.empresa.n} suffix="score médio" />
                <ComparativoRow label="Equipe do supervisor" self={kpis.score} avg={comparativos.equipe.score} n={comparativos.equipe.n} suffix="score médio" />
                <Separator />
                <ComparativoRow label="Dias perdidos / colaborador (projeto)" self={kpis.dias} avg={comparativos.projeto.dias} n={comparativos.projeto.n} suffix="dias" fixed={1} />
                <ComparativoRow label="Ocorrências / colaborador (projeto)" self={kpis.total} avg={comparativos.projeto.ocorr} n={comparativos.projeto.n} suffix="ocorr." fixed={2} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Padrões e tendências</CardTitle>
                <CardDescription>Indicadores descritivos — sem diagnóstico ou causalidade.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="rounded-md border p-3 space-y-1">
                  <div className={cn("inline-flex items-center gap-2 text-sm font-medium", tendencia.tone)}>
                    <tendencia.icon className="h-4 w-4" />
                    {tendencia.label}
                  </div>
                  {maiorDiaSemana && <p className="text-xs text-muted-foreground">{maiorDiaSemana}</p>}
                  {kpis.reinc > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {kpis.reinc} reincidência(s) observada(s) na janela — sinal para acompanhamento administrativo.
                    </p>
                  )}
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={padraoDiaSemana}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="qtd" name="Ocorrências" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={padraoMes}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="qtd" name="Ocorrências" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">Linha do tempo</CardTitle>
                  <CardDescription>{timeline.length} ocorrência(s) — respeitando escopo de acesso.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <FilterIcon className="h-4 w-4 text-muted-foreground" />
                  <Select value={search.categoria || "__all__"} onValueChange={(v) => setSearch({ categoria: v === "__all__" ? "" : v })}>
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas as categorias</SelectItem>
                      <SelectItem value="FALTAS">Faltas</SelectItem>
                      <SelectItem value="ATESTADOS">Atestados</SelectItem>
                      <SelectItem value="DECLARACOES">Declarações</SelectItem>
                      <SelectItem value="SUSPENSOES">Suspensões</SelectItem>
                      <SelectItem value="ACIDENTES">Acidentes</SelectItem>
                      <SelectItem value="OUTROS">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={search.situacao || "__all__"} onValueChange={(v) => setSearch({ situacao: v === "__all__" ? "" : v })}>
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Situação" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas as situações</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="aprovada">Aprovada</SelectItem>
                      <SelectItem value="homologada">Homologada</SelectItem>
                      <SelectItem value="rejeitada">Rejeitada</SelectItem>
                    </SelectContent>
                  </Select>
                  {(search.categoria || search.tipo || search.situacao) && (
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setSearch({ categoria: "", tipo: "", situacao: "" })}>
                      <X className="h-3 w-3 mr-1" /> Limpar
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {ausenciasQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma ocorrência encontrada.</p>
              ) : (
                <ol className="relative border-l pl-6 space-y-4">
                  {timeline.slice(0, 100).map((a) => {
                    const key = breakdownKey(a.tipo, a.tipo_ausencia_codigo);
                    const peso = key && cfg ? Number(cfg[PESO_MAP[key]] ?? 0) : 0;
                    const qtdDias = Number(a.quantidade_dias_calculada ?? a.dias ?? 0);
                    const impacto = peso + qtdDias * Number(cfg?.peso_dia_perdido ?? 0);
                    return (
                      <li key={a.id} className="relative">
                        <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                        <div className="rounded-md border p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{a.tipo_ausencia_nome ?? a.tipo}</span>
                              {a.status && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5">{a.status}</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{fmtDate(a.data_inicio)}{a.data_fim ? ` → ${fmtDate(a.data_fim)}` : ""}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            {qtdDias > 0 && <span>{qtdDias} dia(s)</span>}
                            <span>Lançado em {fmtDateTime(a.lancado_em ?? a.registrado_em)}</span>
                            <span className="tabular-nums">Impacto estimado no score: +{impacto.toFixed(1)}</span>
                          </div>
                          {a.motivo && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{a.motivo}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Rodapé de navegação secundária */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inteligencia/supervisores">
                <Link2 className="h-3 w-3 mr-1" /> Abrir ranking de supervisores
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inteligencia/dashboard">
                <Link2 className="h-3 w-3 mr-1" /> Abrir dashboard executivo
              </Link>
            </Button>
          </div>
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────
function KpiTile({
  icon: Icon,
  label,
  value,
  tone,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "critical" | "positive";
  tooltip?: string;
}) {
  const content = (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn(
              "mt-1.5 text-2xl font-semibold tabular-nums",
              tone === "critical" && "text-destructive",
              tone === "positive" && "text-emerald-500",
            )}>
              {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
            </p>
          </div>
          <div className="rounded-md p-1.5 bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (!tooltip) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{content}</div></TooltipTrigger>
      <TooltipContent side="top"><p className="text-xs max-w-[220px]">{tooltip}</p></TooltipContent>
    </Tooltip>
  );
}

function ComparativoRow({
  label, self, avg, n, suffix, fixed = 1,
}: { label: string; self: number; avg: number; n: number; suffix: string; fixed?: number }) {
  const diff = self - avg;
  const pct = avg > 0 ? (diff / avg) * 100 : self > 0 ? 100 : 0;
  const pior = diff > 0.05;
  const melhor = diff < -0.05;
  const max = Math.max(self, avg, 1);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn(
          "text-xs tabular-nums inline-flex items-center gap-1",
          pior ? "text-destructive" : melhor ? "text-emerald-500" : "text-muted-foreground",
        )}>
          {pior ? <TrendingUp className="h-3 w-3" /> : melhor ? <TrendingDown className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
          {pior ? "+" : ""}{niceNumber(pct, 0)}% vs. média
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <div className="flex justify-between"><span>Colaborador</span><span className="tabular-nums font-medium text-foreground">{niceNumber(self, fixed)} {suffix}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (self / max) * 100)}%` }} /></div>
        </div>
        <div>
          <div className="flex justify-between"><span>Média ({n})</span><span className="tabular-nums font-medium text-foreground">{niceNumber(avg, fixed)} {suffix}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${Math.min(100, (avg / max) * 100)}%` }} /></div>
        </div>
      </div>
    </div>
  );
}

function PerfilNotFound() {
  return (
    <AppShell title="Perfil não disponível">
      <Card className="max-w-lg mx-auto mt-8">
        <CardContent className="pt-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full grid place-items-center bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Colaborador indisponível</h2>
          <p className="text-sm text-muted-foreground">
            O registro não existe ou está fora do seu escopo de acesso.
          </p>
          <Button asChild variant="outline"><Link to="/inteligencia">Voltar ao ranking</Link></Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function PerfilError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell title="Perfil analítico">
      <Card className="max-w-lg mx-auto mt-8">
        <CardContent className="pt-8 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full grid place-items-center bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Erro ao carregar perfil</h2>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button onClick={reset} variant="outline">Tentar novamente</Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
