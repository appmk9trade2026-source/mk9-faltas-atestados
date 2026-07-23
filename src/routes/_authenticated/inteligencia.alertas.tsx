// Fase 6 — Central de Alertas Inteligentes.
// Reutiliza infra existente:
//  • RPCs SECURITY INVOKER: inteligencia_detectar_alertas, inteligencia_alerta_*.
//  • RLS filtra automaticamente por escopo (supervisor → própria equipe).
//  • Nenhum score é recalculado no cliente.
//  • Notificações internas = registros lidos/não-lidos via inteligencia_alerta_leituras.

import * as React from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CheckCheck,
  CheckCircle2,
  Filter as FilterIcon,
  MessageSquare,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  UserCog,
  Users2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────
type Criticidade = "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA";
type Status = "NOVO" | "EM_ANALISE" | "RESOLVIDO" | "IGNORADO";
type Escopo = "COLABORADOR" | "SUPERVISOR" | "PROJETO" | "EMPRESA";
type Tipo =
  | "COLAB_CRITICIDADE" | "COLAB_REINCIDENCIA" | "COLAB_DIAS_PERDIDOS" | "COLAB_CRESCIMENTO_SCORE"
  | "SUPERVISOR_EQUIPE_CRITICA" | "SUPERVISOR_CRESCIMENTO"
  | "PROJETO_CONCENTRACAO" | "PROJETO_ACIDENTES" | "EMPRESA_CONCENTRACAO";

type Alerta = {
  id: string;
  tipo: Tipo;
  escopo: Escopo;
  criticidade: Criticidade;
  status: Status;
  titulo: string;
  descricao: string;
  dados: Record<string, unknown>;
  colaborador_id: string | null;
  supervisor_usuario_id: string | null;
  projeto_id: string | null;
  empresa_id: string | null;
  responsavel_id: string | null;
  assumido_em: string | null;
  resolvido_em: string | null;
  resolvido_por: string | null;
  motivo_resolucao: string | null;
  detectado_em: string;
  updated_at: string;
};

type Evento = {
  id: string;
  alerta_id: string;
  tipo: "CRIADO" | "COMENTARIO" | "STATUS_ALTERADO" | "ATRIBUIDO" | "LIDO";
  usuario_id: string | null;
  comentario: string | null;
  dados: Record<string, unknown>;
  created_at: string;
};

// ─── Meta / labels ────────────────────────────────────────────────────
const CRIT_META: Record<Criticidade, { label: string; badge: string; dot: string }> = {
  BAIXA:   { label: "Baixa",    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
  ATENCAO: { label: "Atenção",  badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",         dot: "bg-amber-500" },
  ALTA:    { label: "Alta",     badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",     dot: "bg-orange-500" },
  CRITICA: { label: "Crítica",  badge: "bg-destructive/10 text-destructive border-destructive/40",                       dot: "bg-destructive" },
};
const STATUS_META: Record<Status, { label: string; badge: string }> = {
  NOVO:       { label: "Novo",        badge: "bg-primary/10 text-primary border-primary/30" },
  EM_ANALISE: { label: "Em análise",  badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  RESOLVIDO:  { label: "Resolvido",   badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  IGNORADO:   { label: "Ignorado",    badge: "bg-muted text-muted-foreground border-muted-foreground/30" },
};
const TIPO_LABEL: Record<Tipo, string> = {
  COLAB_CRITICIDADE:         "Colaborador em criticidade",
  COLAB_REINCIDENCIA:        "Colaborador reincidente",
  COLAB_DIAS_PERDIDOS:       "Dias perdidos acima do limite",
  COLAB_CRESCIMENTO_SCORE:   "Crescimento de score",
  SUPERVISOR_EQUIPE_CRITICA: "Equipe do supervisor em criticidade",
  SUPERVISOR_CRESCIMENTO:    "Crescimento do absenteísmo da equipe",
  PROJETO_CONCENTRACAO:      "Concentração de criticidade no projeto",
  PROJETO_ACIDENTES:         "Aumento de acidentes",
  EMPRESA_CONCENTRACAO:      "Concentração de ocorrências na empresa",
};
const ESCOPO_ICON: Record<Escopo, React.ComponentType<{ className?: string }>> = {
  COLABORADOR: Users2,
  SUPERVISOR:  UserCog,
  PROJETO:     Trophy,
  EMPRESA:     Building2,
};

// ─── Route ────────────────────────────────────────────────────────────
const searchSchema = z.object({
  crit:     fallback(z.string(), "").default(""),
  status:   fallback(z.string(), "").default(""),
  empresa:  fallback(z.string(), "").default(""),
  projeto:  fallback(z.string(), "").default(""),
  supervisor: fallback(z.string(), "").default(""),
  tipo:     fallback(z.string(), "").default(""),
  periodo:  fallback(z.string(), "30").default("30"),
  q:        fallback(z.string(), "").default(""),
  det:      fallback(z.string(), "").default(""),
  naoLidos: fallback(z.enum(["0","1"]), "0").default("0"),
});

export const Route = createFileRoute("/_authenticated/inteligencia/alertas")({
  head: () => ({
    meta: [
      { title: "Central de Alertas · Inteligência · CRM MK9" },
      { name: "description", content: "Alertas automáticos de absenteísmo detectados a partir da configuração vigente." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: RedirectToInteligencia,
});

function RedirectToInteligencia() {
  return <Navigate to="/inteligencia" search={{ tab: "alertas" }} replace />;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ─── Página ───────────────────────────────────────────────────────────
function AlertasPage() {
  const { loading, roles } = useSession();
  const scope = useSessionScope();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");

  const setSearch = React.useCallback(
    (patch: Partial<z.infer<typeof searchSchema>>) => {
      navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }), replace: true });
    },
    [navigate],
  );

  const periodoDias = Math.max(1, Math.min(365, Number(search.periodo) || 30));
  const sinceIso = new Date(Date.now() - periodoDias * 86400000).toISOString();

  // Alertas
  const alertasQuery = useQuery({
    queryKey: ["inteligencia", "alertas", ...scope.keyParts, periodoDias],
    enabled: scope.ready,
    queryFn: async (): Promise<Alerta[]> => {
      const { data, error } = await supabase
        .from("inteligencia_alertas")
        .select("*")
        .gte("detectado_em", sinceIso)
        .order("detectado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Alerta[];
    },
    staleTime: 30_000,
  });

  // Leituras do usuário
  const leiturasQuery = useQuery({
    queryKey: ["inteligencia", "alertas", "leituras", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("inteligencia_alerta_leituras").select("alerta_id");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.alerta_id as string));
    },
    staleTime: 30_000,
  });

  // Referências
  const empresasQuery = useQuery({
    queryKey: ["inteligencia", "alertas", "ref", "empresas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => (await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
    staleTime: 5 * 60_000,
  });
  const projetosQuery = useQuery({
    queryKey: ["inteligencia", "alertas", "ref", "projetos", ...scope.keyParts, search.empresa || null],
    enabled: scope.ready,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome");
      if (search.empresa) q = q.eq("empresa_id", search.empresa);
      return (await q).data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const supervisoresQuery = useQuery({
    queryKey: ["inteligencia", "alertas", "ref", "sup", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => (await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const empresaMap = React.useMemo(() => new Map((empresasQuery.data ?? []).map((e) => [e.id as string, e.nome as string])), [empresasQuery.data]);
  const projetoMap = React.useMemo(() => new Map((projetosQuery.data ?? []).map((p) => [p.id as string, p.nome as string])), [projetosQuery.data]);
  const supervisorMap = React.useMemo(() => new Map((supervisoresQuery.data ?? []).map((p) => [p.id as string, p.nome as string])), [supervisoresQuery.data]);

  // Filtros
  const filtered = React.useMemo(() => {
    const q = search.q.trim().toLowerCase();
    const lidos = leiturasQuery.data ?? new Set<string>();
    return (alertasQuery.data ?? []).filter((a) => {
      if (search.crit && a.criticidade !== search.crit) return false;
      if (search.status && a.status !== search.status) return false;
      if (search.empresa && a.empresa_id !== search.empresa) return false;
      if (search.projeto && a.projeto_id !== search.projeto) return false;
      if (search.supervisor && a.supervisor_usuario_id !== search.supervisor) return false;
      if (search.tipo && a.tipo !== search.tipo) return false;
      if (search.naoLidos === "1" && lidos.has(a.id)) return false;
      if (q && !`${a.titulo} ${a.descricao}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [alertasQuery.data, leiturasQuery.data, search]);

  // KPIs
  const kpis = React.useMemo(() => {
    const rows = alertasQuery.data ?? [];
    const lidos = leiturasQuery.data ?? new Set<string>();
    return {
      total: rows.length,
      criticos: rows.filter((r) => r.criticidade === "CRITICA").length,
      abertos: rows.filter((r) => r.status === "NOVO" || r.status === "EM_ANALISE").length,
      naoLidos: rows.filter((r) => !lidos.has(r.id)).length,
    };
  }, [alertasQuery.data, leiturasQuery.data]);

  // Selected (drawer)
  const selected = React.useMemo(() => {
    if (!search.det) return null;
    return (alertasQuery.data ?? []).find((a) => a.id === search.det) ?? null;
  }, [alertasQuery.data, search.det]);

  // Mutations
  const detectar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("inteligencia_detectar_alertas");
      if (error) throw error;
      return data as { novos: number; ignorados_duplicados: number };
    },
    onSuccess: (r) => {
      toast.success(`Detecção concluída — ${r.novos} novo(s), ${r.ignorados_duplicados} ignorado(s)`);
      qc.invalidateQueries({ queryKey: ["inteligencia", "alertas"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao executar detecção"),
  });

  const marcarTodosLidos = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("inteligencia_alerta_marcar_todos_lidos");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`${n} alerta(s) marcado(s) como lido`);
      qc.invalidateQueries({ queryKey: ["inteligencia", "alertas", "leituras"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao marcar"),
  });

  const filtrosAtivos =
    !!search.crit || !!search.status || !!search.empresa || !!search.projeto ||
    !!search.supervisor || !!search.tipo || !!search.q || search.naoLidos === "1";

  if (loading) {
    return (
      <AppShell title="Central de Alertas">
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Alertas Inteligentes">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          {/* Cabeçalho + ações */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2"><BellRing className="h-5 w-5 text-primary" /></div>
                <h1 className="text-2xl font-semibold tracking-tight">Central de Alertas</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Detecção automática de situações relevantes de absenteísmo. Todos os alertas respeitam o
                escopo de acesso — supervisores visualizam apenas os alertas da própria equipe.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => marcarTodosLidos.mutate()} disabled={marcarTodosLidos.isPending}>
                <CheckCheck className="h-4 w-4 mr-2" /> Marcar todos lidos
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => { void alertasQuery.refetch(); void leiturasQuery.refetch(); }}
                disabled={alertasQuery.isFetching}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", alertasQuery.isFetching && "animate-spin")} /> Atualizar
              </Button>
              {(isSuperAdmin || roles.includes("rh") || roles.includes("compliance")) && (
                <Button size="sm" onClick={() => detectar.mutate()} disabled={detectar.isPending}>
                  <PlayCircle className={cn("h-4 w-4 mr-2", detectar.isPending && "animate-pulse")} />
                  {detectar.isPending ? "Detectando…" : "Rodar detecção"}
                </Button>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={BellRing}       label="Alertas na janela" value={kpis.total} />
            <Kpi icon={AlertTriangle}  label="Críticos"          value={kpis.criticos} tone="critical" />
            <Kpi icon={Sparkles}       label="Em aberto"         value={kpis.abertos} tone="warn" />
            <Kpi icon={BellRing}       label="Não lidos"         value={kpis.naoLidos} />
          </div>

          {/* Filtros */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Filtros</CardTitle>
                {filtrosAtivos && (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => navigate({
                    search: () => ({ crit: "", status: "", empresa: "", projeto: "", supervisor: "", tipo: "", periodo: search.periodo, q: "", det: "", naoLidos: "0" as const }),
                    replace: true,
                  })}>
                    <X className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="relative lg:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por título ou descrição…" value={search.q}
                    onChange={(e) => setSearch({ q: e.target.value })} className="pl-9" />
                </div>
                <Sel placeholder="Criticidade" value={search.crit} onChange={(v) => setSearch({ crit: v })}
                  options={(["CRITICA","ALTA","ATENCAO","BAIXA"] as Criticidade[]).map((v) => ({ value: v, label: CRIT_META[v].label }))} />
                <Sel placeholder="Status" value={search.status} onChange={(v) => setSearch({ status: v })}
                  options={(["NOVO","EM_ANALISE","RESOLVIDO","IGNORADO"] as Status[]).map((v) => ({ value: v, label: STATUS_META[v].label }))} />
                <Sel placeholder="Empresa" value={search.empresa} onChange={(v) => setSearch({ empresa: v, projeto: "" })}
                  options={(empresasQuery.data ?? []).map((e) => ({ value: e.id as string, label: e.nome as string }))} />
                <Sel placeholder="Projeto" value={search.projeto} onChange={(v) => setSearch({ projeto: v })}
                  options={(projetosQuery.data ?? []).map((p) => ({ value: p.id as string, label: p.nome as string }))} />
                <Sel placeholder="Supervisor" value={search.supervisor} onChange={(v) => setSearch({ supervisor: v })}
                  options={(supervisoresQuery.data ?? []).map((p) => ({ value: p.id as string, label: p.nome as string }))} />
                <Sel placeholder="Tipo" value={search.tipo} onChange={(v) => setSearch({ tipo: v })}
                  options={(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => ({ value: t, label: TIPO_LABEL[t] }))} />
                <Sel placeholder="Período" value={search.periodo} onChange={(v) => setSearch({ periodo: v || "30" })} allowEmpty={false}
                  options={[{value:"7",label:"7 dias"},{value:"30",label:"30 dias"},{value:"60",label:"60 dias"},{value:"90",label:"90 dias"},{value:"180",label:"180 dias"}]} />
                <Sel placeholder="Não lidos" value={search.naoLidos === "1" ? "1" : ""} onChange={(v) => setSearch({ naoLidos: v === "1" ? "1" : "0" })}
                  options={[{ value: "1", label: "Somente não lidos" }]} />
              </div>
            </CardContent>
          </Card>

          {/* Lista */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Alertas</CardTitle>
              <CardDescription>
                {alertasQuery.isLoading ? "Carregando…" : `${filtered.length} de ${(alertasQuery.data ?? []).length}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {alertasQuery.isLoading ? (
                <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mx-auto h-12 w-12 grid place-items-center rounded-full bg-muted mb-3">
                    <BellRing className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Nenhum alerta no momento</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                    {(alertasQuery.data ?? []).length === 0
                      ? "Execute a detecção para atualizar a lista com base na configuração vigente."
                      : "Ajuste ou limpe os filtros aplicados."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((a) => {
                    const lidos = leiturasQuery.data ?? new Set<string>();
                    const naoLido = !lidos.has(a.id);
                    const Icon = ESCOPO_ICON[a.escopo];
                    const critM = CRIT_META[a.criticidade];
                    const stM = STATUS_META[a.status];
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSearch({ det: a.id })}
                          className={cn(
                            "w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/40",
                            naoLido && "border-primary/40 bg-primary/[0.03]",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn("rounded-md p-2 shrink-0", critM.badge)}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{a.titulo}</span>
                                <Badge variant="outline" className={cn("gap-1.5 border", critM.badge)}>
                                  <span className={cn("h-1.5 w-1.5 rounded-full", critM.dot)} />
                                  {critM.label}
                                </Badge>
                                <Badge variant="outline" className={cn("border", stM.badge)}>{stM.label}</Badge>
                                {naoLido && <Badge variant="outline" className="border-primary/40 text-primary">Novo</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.descricao}</p>
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                                <span className="inline-flex items-center gap-1">{TIPO_LABEL[a.tipo]}</span>
                                {a.empresa_id && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{empresaMap.get(a.empresa_id) ?? "—"}</span>}
                                {a.projeto_id && <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />{projetoMap.get(a.projeto_id) ?? "—"}</span>}
                                {a.supervisor_usuario_id && <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" />{supervisorMap.get(a.supervisor_usuario_id) ?? "—"}</span>}
                                <span>· {relTime(a.detectado_em)}</span>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Drawer */}
        <AlertaDrawer
          alerta={selected}
          empresaMap={empresaMap}
          projetoMap={projetoMap}
          supervisorMap={supervisorMap}
          onClose={() => setSearch({ det: "" })}
        />
      </TooltipProvider>
    </AppShell>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────
function AlertaDrawer({
  alerta, empresaMap, projetoMap, supervisorMap, onClose,
}: {
  alerta: Alerta | null;
  empresaMap: Map<string, string>;
  projetoMap: Map<string, string>;
  supervisorMap: Map<string, string>;
  onClose: () => void;
}) {
  const open = !!alerta;
  const qc = useQueryClient();
  const [comentario, setComentario] = React.useState("");
  const [motivo, setMotivo] = React.useState("");

  React.useEffect(() => { setComentario(""); setMotivo(""); }, [alerta?.id]);

  const eventosQuery = useQuery({
    queryKey: ["inteligencia", "alertas", "eventos", alerta?.id],
    enabled: !!alerta,
    queryFn: async (): Promise<Evento[]> => {
      const { data, error } = await supabase
        .from("inteligencia_alerta_eventos")
        .select("*")
        .eq("alerta_id", alerta!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Evento[];
    },
    staleTime: 10_000,
  });

  // Marca como lido ao abrir
  React.useEffect(() => {
    if (!alerta) return;
    void supabase.rpc("inteligencia_alerta_marcar_lido", { _alerta_id: alerta.id }).then(() => {
      qc.invalidateQueries({ queryKey: ["inteligencia", "alertas", "leituras"] });
    });
  }, [alerta, qc]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inteligencia", "alertas"] });
    qc.invalidateQueries({ queryKey: ["inteligencia", "alertas", "eventos", alerta?.id] });
  };

  const setStatus = useMutation({
    mutationFn: async (payload: { status: Status; motivo?: string }) => {
      if (!alerta) return;
      const { error } = await supabase.rpc("inteligencia_alerta_status", {
        _alerta_id: alerta.id, _status: payload.status, _motivo: payload.motivo ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Falha"),
  });

  const comentar = useMutation({
    mutationFn: async () => {
      if (!alerta || !comentario.trim()) return;
      const { error } = await supabase.rpc("inteligencia_alerta_comentar", {
        _alerta_id: alerta.id, _texto: comentario.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => { setComentario(""); toast.success("Comentário registrado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao comentar"),
  });

  if (!alerta) return <Sheet open={false} onOpenChange={(o) => !o && onClose()}><SheetContent /></Sheet>;

  const critM = CRIT_META[alerta.criticidade];
  const stM = STATUS_META[alerta.status];
  const isTerminal = alerta.status === "RESOLVIDO" || alerta.status === "IGNORADO";

  // Drill-down destinos
  const drillLinks: Array<{ label: string; to: string; params?: Record<string, string> }> = [];
  if (alerta.colaborador_id) {
    drillLinks.push({
      label: "Abrir perfil analítico",
      to: "/inteligencia/colaboradores/$colaboradorId",
      params: { colaboradorId: alerta.colaborador_id },
    });
  }
  drillLinks.push({ label: "Ranking de colaboradores", to: "/inteligencia" });
  if (alerta.escopo === "SUPERVISOR" || alerta.supervisor_usuario_id) {
    drillLinks.push({ label: "Ranking de supervisores", to: "/inteligencia/supervisores" });
  }
  drillLinks.push({ label: "Dashboard executivo", to: "/inteligencia/dashboard" });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <SheetTitle className="text-lg leading-snug">{alerta.titulo}</SheetTitle>
              <SheetDescription>{TIPO_LABEL[alerta.tipo]}</SheetDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className={cn("gap-1.5 border", critM.badge)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", critM.dot)} />{critM.label}
              </Badge>
              <Badge variant="outline" className={cn("border", stM.badge)}>{stM.label}</Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm">{alerta.descricao}</p>
            <div className="text-xs text-muted-foreground grid gap-1">
              {alerta.empresa_id && <div>Empresa: <span className="text-foreground font-medium">{empresaMap.get(alerta.empresa_id) ?? "—"}</span></div>}
              {alerta.projeto_id && <div>Projeto: <span className="text-foreground font-medium">{projetoMap.get(alerta.projeto_id) ?? "—"}</span></div>}
              {alerta.supervisor_usuario_id && <div>Supervisor: <span className="text-foreground font-medium">{supervisorMap.get(alerta.supervisor_usuario_id) ?? "—"}</span></div>}
              <div>Detectado em: <span className="text-foreground">{fmtDateTime(alerta.detectado_em)}</span></div>
              {alerta.assumido_em && <div>Em análise desde: <span className="text-foreground">{fmtDateTime(alerta.assumido_em)}</span></div>}
              {alerta.resolvido_em && <div>Resolvido em: <span className="text-foreground">{fmtDateTime(alerta.resolvido_em)}</span></div>}
              {alerta.motivo_resolucao && <div>Motivo: <span className="text-foreground">{alerta.motivo_resolucao}</span></div>}
            </div>
          </div>

          {/* Ações */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Ciclo de vida</h3>
            <div className="flex flex-wrap gap-2">
              {alerta.status === "NOVO" && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ status: "EM_ANALISE" })} disabled={setStatus.isPending}>
                  <PlayCircle className="h-4 w-4 mr-2" /> Assumir análise
                </Button>
              )}
              {!isTerminal && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ status: "RESOLVIDO", motivo: motivo || undefined })} disabled={setStatus.isPending}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Marcar resolvido
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ status: "IGNORADO", motivo: motivo || undefined })} disabled={setStatus.isPending}>
                    <XCircle className="h-4 w-4 mr-2" /> Ignorar
                  </Button>
                </>
              )}
              {isTerminal && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ status: "EM_ANALISE" })} disabled={setStatus.isPending}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Reabrir
                </Button>
              )}
            </div>
            {!isTerminal && (
              <Textarea
                className="mt-3 min-h-20"
                placeholder="Motivo (opcional, aplicado ao resolver / ignorar)…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            )}
          </div>

          <Separator />

          {/* Drill-down */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Drill-down</h3>
            <div className="flex flex-wrap gap-2">
              {drillLinks.map((l) => (
                <Button asChild key={l.label} size="sm" variant="ghost" className="border">
                  {l.params
                    ? <Link to={l.to} params={l.params as never}>{l.label} <ArrowRight className="h-3 w-3 ml-1" /></Link>
                    : <Link to={l.to}>{l.label} <ArrowRight className="h-3 w-3 ml-1" /></Link>}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Comentários / histórico */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Histórico & comentários</h3>
            <div className="space-y-2">
              <Textarea
                className="min-h-20"
                placeholder="Adicionar comentário…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => comentar.mutate()} disabled={comentar.isPending || !comentario.trim()}>
                  Comentar
                </Button>
              </div>
            </div>
            <ol className="mt-4 space-y-3 border-l pl-4">
              {(eventosQuery.data ?? []).map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-primary/60 ring-4 ring-background" />
                  <div className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)} · {labelEvento(e)}</div>
                  {e.comentario && <p className="text-sm mt-0.5">{e.comentario}</p>}
                  {!e.comentario && e.tipo === "STATUS_ALTERADO" && (
                    <p className="text-sm mt-0.5 text-muted-foreground">
                      {String((e.dados as { de?: string })?.de ?? "?")} → <span className="text-foreground font-medium">{String((e.dados as { para?: string })?.para ?? "?")}</span>
                    </p>
                  )}
                </li>
              ))}
              {(eventosQuery.data ?? []).length === 0 && !eventosQuery.isLoading && (
                <li className="text-xs text-muted-foreground">Sem eventos registrados.</li>
              )}
            </ol>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function labelEvento(e: Evento): string {
  switch (e.tipo) {
    case "CRIADO": return "Alerta criado";
    case "COMENTARIO": return "Comentário";
    case "STATUS_ALTERADO": return "Status alterado";
    case "ATRIBUIDO": return "Responsável atribuído";
    case "LIDO": return "Marcado como lido";
    default: return e.tipo;
  }
}

// ─── Subcomponentes ───────────────────────────────────────────────────
function Kpi({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; tone?: "critical" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn(
              "mt-1.5 text-2xl font-semibold tabular-nums",
              tone === "critical" && "text-destructive",
              tone === "warn" && "text-orange-600 dark:text-orange-400",
            )}>{value.toLocaleString("pt-BR")}</p>
          </div>
          <div className={cn(
            "rounded-md p-1.5",
            tone === "critical" ? "bg-destructive/10 text-destructive" :
            tone === "warn"     ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" :
            "bg-muted text-muted-foreground",
          )}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Sel({
  placeholder, value, onChange, options, allowEmpty = true,
}: {
  placeholder: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; allowEmpty?: boolean;
}) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__all__">{placeholder} (todos)</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
