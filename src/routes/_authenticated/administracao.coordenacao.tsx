import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Trophy,
  Building2,
  FolderKanban,
  Search,
  ChevronDown,
  ChevronRight,
  Link2,
  Link2Off,
  RefreshCcw,
  ShieldAlert,
  Loader2,
  History,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useSession, type AppRole } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/administracao/coordenacao")({
  head: () => ({
    meta: [
      { title: "Gestão de Coordenação · CRM MK9" },
      {
        name: "description",
        content:
          "Administração dos vínculos entre Coordenadores e Supervisores da estrutura operacional.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoordenacaoPage,
});

const ROLES_PERMITIDOS: AppRole[] = ["super_admin", "rh"];

// ---------- Tipos ---------------------------------------------------------

type Dashboard = {
  total_coordenadores: number;
  total_supervisores: number;
  supervisores_vinculados: number;
  supervisores_sem_coordenador: number;
  colaboradores_cobertos: number;
  ultima_alteracao: string | null;
};

type EmpresaMini = { id: string; nome: string };
type ProjetoMini = { id: string; nome: string };

type CoordenadorRow = {
  coordenador_id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  supervisores_count: number;
  colaboradores_count: number;
  empresas: EmpresaMini[];
  projetos: ProjetoMini[];
  ultima_alteracao: string | null;
};

type SupervisorDoCoord = {
  supervisor_id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  colaboradores_count: number;
  empresas: EmpresaMini[];
  projetos: ProjetoMini[];
};

type SupervisorRow = {
  supervisor_id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  coordenador_id: string | null;
  coordenador_nome: string | null;
  coordenador_email: string | null;
  colaboradores_count: number;
  empresa_principal_id: string | null;
  empresa_principal_nome: string | null;
  projeto_principal_id: string | null;
  projeto_principal_nome: string | null;
  matricula: string | null;
  created_at: string | null;
  total_registros: number;
};

type CoordCombo = { id: string; nome: string | null; email: string | null; ativo: boolean };

type VinculoFilter = "todos" | "com" | "sem";

// ---------- Utilitários ---------------------------------------------------

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function initials(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "??";
  const parts = n.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "??";
}

// ---------- Página --------------------------------------------------------

function CoordenacaoPage() {
  const { roles, loading } = useSession();
  const scope = useSessionScope();
  const autorizado = roles.some((r) => ROLES_PERMITIDOS.includes(r));

  if (loading || !scope.ready) {
    return (
      <AppShell title="Gestão de Coordenação">
        <div className="space-y-4 p-6">
          <Skeleton className="h-9 w-72" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!autorizado) {
    return (
      <AppShell title="Gestão de Coordenação">
        <div className="p-6">
          <Card className="mx-auto max-w-lg p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground">
              A Gestão de Coordenação é exclusiva para Super Admin e RH.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Gestão de Coordenação" breadcrumb={["Administração", "Gestão de Coordenação"]}>
      <CoordenacaoContent scopeKey={scope.keyParts.join(":")} />
    </AppShell>
  );
}

// ---------- Conteúdo interno ---------------------------------------------

function CoordenacaoContent({ scopeKey }: { scopeKey: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"visao" | "supervisores" | "pendentes">("visao");
  const [vincularState, setVincularState] = React.useState<{
    open: boolean;
    supervisor: SupervisorRow | null;
    modo: "vincular" | "trocar" | "remover";
  }>({ open: false, supervisor: null, modo: "vincular" });

  // Dashboard
  const dashQ = useQuery({
    queryKey: ["coordenacao", "dashboard", scopeKey],
    queryFn: async (): Promise<Dashboard> => {
      const { data, error } = await supabase.rpc("coordenacao_dashboard");
      if (error) throw error;
      return data as unknown as Dashboard;
    },
  });

  const invalidateAll = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["coordenacao"] });
  }, [qc]);

  const openVincular = (sup: SupervisorRow) => {
    const modo: "vincular" | "trocar" = sup.coordenador_id ? "trocar" : "vincular";
    setVincularState({ open: true, supervisor: sup, modo });
  };
  const openRemover = (sup: SupervisorRow) => {
    setVincularState({ open: true, supervisor: sup, modo: "remover" });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestão de Coordenação</h1>
          <p className="text-sm text-muted-foreground">
            Administre os vínculos entre Coordenadores e Supervisores da operação.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={invalidateAll}
          className="gap-1.5"
          aria-label="Atualizar"
        >
          <RefreshCcw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <KpiGrid data={dashQ.data} loading={dashQ.isLoading} error={dashQ.isError} />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="visao">Coordenadores</TabsTrigger>
          <TabsTrigger value="supervisores">Supervisores</TabsTrigger>
          <TabsTrigger value="pendentes" className="gap-1.5">
            Pendentes
            {typeof dashQ.data?.supervisores_sem_coordenador === "number" &&
              dashQ.data.supervisores_sem_coordenador > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {dashQ.data.supervisores_sem_coordenador}
                </Badge>
              )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          <CoordenadoresTable scopeKey={scopeKey} />
        </TabsContent>

        <TabsContent value="supervisores" className="space-y-4">
          <SupervisoresPanel
            scopeKey={scopeKey}
            defaultFilter="todos"
            onVincular={openVincular}
            onRemover={openRemover}
          />
        </TabsContent>

        <TabsContent value="pendentes" className="space-y-4">
          <SupervisoresPanel
            scopeKey={scopeKey}
            defaultFilter="sem"
            lockFilter
            onVincular={openVincular}
            onRemover={openRemover}
          />
        </TabsContent>
      </Tabs>

      <VincularDialog
        state={vincularState}
        onClose={() => setVincularState((s) => ({ ...s, open: false }))}
        onSuccess={invalidateAll}
      />
    </div>
  );
}

// ---------- KPIs ----------------------------------------------------------

function KpiGrid({
  data,
  loading,
  error,
}: {
  data: Dashboard | undefined;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Não foi possível carregar os indicadores.
      </Card>
    );
  }
  const items = [
    { label: "Coordenadores", value: data.total_coordenadores, icon: Trophy, tone: "primary" as const },
    { label: "Supervisores", value: data.total_supervisores, icon: Users, tone: "muted" as const },
    { label: "Vinculados", value: data.supervisores_vinculados, icon: UserCheck, tone: "success" as const },
    { label: "Sem Coordenador", value: data.supervisores_sem_coordenador, icon: UserX, tone: "warning" as const },
    { label: "Colaboradores cobertos", value: data.colaboradores_cobertos, icon: Building2, tone: "muted" as const },
    {
      label: "Última alteração",
      value: fmtDateTime(data.ultima_alteracao),
      icon: History,
      tone: "muted" as const,
      isText: true,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        const toneMap: Record<string, string> = {
          primary: "bg-primary/10 text-primary",
          success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          muted: "bg-muted text-muted-foreground",
        };
        return (
          <Card key={it.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {it.label}
                </div>
                <div
                  className={cn(
                    "mt-1 truncate font-semibold",
                    it.isText ? "text-sm" : "text-2xl",
                  )}
                  title={typeof it.value === "string" ? it.value : undefined}
                >
                  {it.value}
                </div>
              </div>
              <div className={cn("rounded-md p-2", toneMap[it.tone])}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Tabela de Coordenadores --------------------------------------

function CoordenadoresTable({ scopeKey }: { scopeKey: string }) {
  const [busca, setBusca] = React.useState("");
  const [expandidos, setExpandidos] = React.useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["coordenacao", "coordenadores", scopeKey],
    queryFn: async (): Promise<CoordenadorRow[]> => {
      const { data, error } = await supabase.rpc("coordenacao_listar_coordenadores");
      if (error) throw error;
      return (data ?? []) as unknown as CoordenadorRow[];
    },
  });

  const rows = React.useMemo(() => {
    const list = q.data ?? [];
    const t = busca.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (c) =>
        (c.nome ?? "").toLowerCase().includes(t) ||
        (c.email ?? "").toLowerCase().includes(t),
    );
  }, [q.data, busca]);

  const toggle = (id: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail"
            className="pl-8"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {q.isLoading ? "Carregando..." : `${rows.length} coordenador(es)`}
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <RpcErrorState
          title="Não foi possível carregar os Coordenadores."
          rpc="coordenacao_listar_coordenadores"
          error={q.error}
          params={{ _busca: busca.trim() || null }}
          onRetry={() => q.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Nenhum Coordenador encontrado"
          description="Ainda não há usuários com o papel Coordenador ativo, ou nenhum corresponde à busca."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Coordenador</TableHead>
                  <TableHead className="text-center">Supervisores</TableHead>
                  <TableHead className="text-center">Colaboradores</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead>Projetos</TableHead>
                  <TableHead>Última alteração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const isOpen = expandidos.has(c.coordenador_id);
                  return (
                    <React.Fragment key={c.coordenador_id}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(c.coordenador_id)}>
                        <TableCell>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initials(c.nome)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{c.nome ?? "—"}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {c.email ?? "—"}
                              </div>
                            </div>
                            {!c.ativo && (
                              <Badge variant="outline" className="ml-1">
                                Inativo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {c.supervisores_count}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {c.colaboradores_count}
                        </TableCell>
                        <TableCell>
                          <BadgeList items={c.empresas.map((e) => e.nome)} max={2} />
                        </TableCell>
                        <TableCell>
                          <BadgeList items={c.projetos.map((p) => p.nome)} max={2} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDateTime(c.ultima_alteracao)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <ExpandSupervisores coordenadorId={c.coordenador_id} scopeKey={scopeKey} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-3 p-3 md:hidden">
            {rows.map((c) => {
              const isOpen = expandidos.has(c.coordenador_id);
              return (
                <Card key={c.coordenador_id} className="p-3">
                  <button
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => toggle(c.coordenador_id)}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(c.nome)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.nome ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.email ?? "—"}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <MiniStat label="Supervisores" value={c.supervisores_count} />
                    <MiniStat label="Colaboradores" value={c.colaboradores_count} />
                  </div>
                  {isOpen && (
                    <div className="mt-3">
                      <ExpandSupervisores coordenadorId={c.coordenador_id} scopeKey={scopeKey} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function ExpandSupervisores({
  coordenadorId,
  scopeKey,
}: {
  coordenadorId: string;
  scopeKey: string;
}) {
  const q = useQuery({
    queryKey: ["coordenacao", "coordenador-supervisores", scopeKey, coordenadorId],
    queryFn: async (): Promise<SupervisorDoCoord[]> => {
      const { data, error } = await supabase.rpc("coordenacao_supervisores_por_coordenador", {
        _coord_id: coordenadorId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as SupervisorDoCoord[];
    },
  });

  if (q.isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <RpcErrorState
        title="Não foi possível carregar os Supervisores."
        rpc="coordenacao_supervisores_por_coordenador"
        error={q.error}
        params={{ _coord_id: coordenadorId }}
        onRetry={() => q.refetch()}
      />
    );
  }
  if ((q.data ?? []).length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Este Coordenador ainda não possui Supervisores vinculados.
      </div>
    );
  }
  return (
    <div className="p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supervisor</TableHead>
            <TableHead className="text-center">Colaboradores</TableHead>
            <TableHead>Empresas</TableHead>
            <TableHead>Projetos</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(q.data ?? []).map((s) => (
            <TableRow key={s.supervisor_id}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.nome ?? "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.email ?? "—"}</div>
                </div>
              </TableCell>
              <TableCell className="text-center">{s.colaboradores_count}</TableCell>
              <TableCell>
                <BadgeList items={s.empresas.map((e) => e.nome)} max={2} />
              </TableCell>
              <TableCell>
                <BadgeList items={s.projetos.map((p) => p.nome)} max={2} />
              </TableCell>
              <TableCell>
                <Badge variant={s.ativo ? "secondary" : "outline"}>
                  {s.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Painel de Supervisores ---------------------------------------

function SupervisoresPanel({
  scopeKey,
  defaultFilter,
  lockFilter,
  onVincular,
  onRemover,
}: {
  scopeKey: string;
  defaultFilter: VinculoFilter;
  lockFilter?: boolean;
  onVincular: (s: SupervisorRow) => void;
  onRemover: (s: SupervisorRow) => void;
}) {
  const PAGE_SIZE = 25;
  const [vinculo, setVinculo] = React.useState<VinculoFilter>(defaultFilter);
  const [coordenadorId, setCoordenadorId] = React.useState<string>("");
  const [busca, setBusca] = React.useState("");
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    setPage(0);
  }, [vinculo, coordenadorId, busca]);

  const coordsQ = useQuery({
    queryKey: ["coordenacao", "combo-coordenadores", scopeKey],
    queryFn: async (): Promise<CoordCombo[]> => {
      const { data, error } = await supabase.rpc("coordenacao_listar_coordenadores_combo");
      if (error) throw error;
      return (data ?? []) as unknown as CoordCombo[];
    },
  });

  const q = useQuery({
    queryKey: [
      "coordenacao",
      "supervisores",
      scopeKey,
      vinculo,
      coordenadorId || null,
      busca.trim(),
      page,
    ],
    queryFn: async (): Promise<SupervisorRow[]> => {
      const { data, error } = await supabase.rpc("coordenacao_listar_supervisores", {
        _vinculo: vinculo,
        _empresa_id: undefined,
        _projeto_id: undefined,
        _coordenador_id: coordenadorId || undefined,
        _busca: busca.trim() || undefined,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as unknown as SupervisorRow[];
    },
  });

  const total = q.data?.[0]?.total_registros ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou matrícula"
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <Select
            value={vinculo}
            onValueChange={(v) => setVinculo(v as VinculoFilter)}
            disabled={lockFilter}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Supervisores</SelectItem>
              <SelectItem value="com">Com Coordenador</SelectItem>
              <SelectItem value="sem">Sem Coordenador</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={coordenadorId || "__all__"}
            onValueChange={(v) => setCoordenadorId(v === "__all__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Coordenador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Qualquer Coordenador</SelectItem>
              {(coordsQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome ?? c.email ?? c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center justify-end text-xs text-muted-foreground">
            {q.isLoading ? "Carregando..." : `${total} Supervisor(es)`}
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <RpcErrorState
          title="Não foi possível carregar os Supervisores."
          rpc="coordenacao_listar_supervisores"
          error={q.error}
          params={{
            _vinculo: vinculo,
            _coordenador_id: coordenadorId || null,
            _busca: busca.trim() || null,
            _limit: PAGE_SIZE,
            _offset: page * PAGE_SIZE,
          }}
          onRetry={() => q.refetch()}
        />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState
          icon={vinculo === "sem" ? UserCheck : Users}
          title={
            vinculo === "sem"
              ? "Nenhum Supervisor pendente"
              : "Nenhum Supervisor encontrado"
          }
          description={
            vinculo === "sem"
              ? "Todos os Supervisores ativos já possuem Coordenador atribuído."
              : "Ajuste os filtros ou a busca para encontrar registros."
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Projeto principal</TableHead>
                  <TableHead>Coordenador</TableHead>
                  <TableHead className="text-center">Colab.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((s) => (
                  <SupervisorRowUI
                    key={s.supervisor_id}
                    s={s}
                    onVincular={onVincular}
                    onRemover={onRemover}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-3 p-3 md:hidden">
            {(q.data ?? []).map((s) => (
              <SupervisorCardMobile
                key={s.supervisor_id}
                s={s}
                onVincular={onVincular}
                onRemover={onRemover}
              />
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t p-3 text-sm">
              <div className="text-muted-foreground">
                Página {page + 1} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function SupervisorRowUI({
  s,
  onVincular,
  onRemover,
}: {
  s: SupervisorRow;
  onVincular: (s: SupervisorRow) => void;
  onRemover: (s: SupervisorRow) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <div className="truncate font-medium">{s.nome ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{s.email ?? "—"}</div>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{s.matricula ?? "—"}</TableCell>
      <TableCell>
        <span className="text-sm">{s.empresa_principal_nome ?? "—"}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm">{s.projeto_principal_nome ?? "—"}</span>
      </TableCell>
      <TableCell>
        {s.coordenador_id ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{s.coordenador_nome ?? "—"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {s.coordenador_email ?? ""}
            </div>
          </div>
        ) : (
          <Badge variant="outline" className="gap-1">
            <UserX className="h-3 w-3" />
            Sem Coordenador
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-center">{s.colaboradores_count}</TableCell>
      <TableCell>
        <Badge variant={s.ativo ? "secondary" : "outline"}>
          {s.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => onVincular(s)}>
                  {s.coordenador_id ? (
                    <>
                      <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Trocar
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-1.5 h-3.5 w-3.5" /> Vincular
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {s.coordenador_id ? "Trocar o Coordenador" : "Definir um Coordenador"}
              </TooltipContent>
            </Tooltip>
            {s.coordenador_id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemover(s)}
                  >
                    <Link2Off className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remover vínculo</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SupervisorCardMobile({
  s,
  onVincular,
  onRemover,
}: {
  s: SupervisorRow;
  onVincular: (s: SupervisorRow) => void;
  onRemover: (s: SupervisorRow) => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{s.nome ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{s.email ?? "—"}</div>
          {s.matricula && (
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              Matr. {s.matricula}
            </div>
          )}
        </div>
        <Badge variant={s.ativo ? "secondary" : "outline"}>
          {s.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MiniStat label="Empresa" value={s.empresa_principal_nome ?? "—"} isText />
        <MiniStat label="Projeto" value={s.projeto_principal_nome ?? "—"} isText />
        <MiniStat label="Colab." value={s.colaboradores_count} />
        <MiniStat
          label="Coordenador"
          value={s.coordenador_nome ?? "Sem Coordenador"}
          isText
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => onVincular(s)}>
          {s.coordenador_id ? (
            <>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Trocar
            </>
          ) : (
            <>
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Vincular
            </>
          )}
        </Button>
        {s.coordenador_id && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onRemover(s)}
          >
            <Link2Off className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------- Dialog de vincular/trocar/remover ----------------------------

function VincularDialog({
  state,
  onClose,
  onSuccess,
}: {
  state: { open: boolean; supervisor: SupervisorRow | null; modo: "vincular" | "trocar" | "remover" };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { open, supervisor, modo } = state;
  const scope = useSessionScope();
  const [novoCoord, setNovoCoord] = React.useState<string>("");
  const [observacoes, setObservacoes] = React.useState<string>("");
  const [confirmando, setConfirmando] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNovoCoord("");
      setObservacoes("");
      setConfirmando(false);
    }
  }, [open, supervisor?.supervisor_id, modo]);

  const coordsQ = useQuery({
    queryKey: ["coordenacao", "combo-coordenadores", scope.keyParts.join(":")],
    queryFn: async (): Promise<CoordCombo[]> => {
      const { data, error } = await supabase.rpc("coordenacao_listar_coordenadores_combo");
      if (error) throw error;
      return (data ?? []) as unknown as CoordCombo[];
    },
    enabled: open && modo !== "remover",
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!supervisor) throw new Error("Supervisor ausente");
      const target = modo === "remover" ? null : novoCoord || null;
      if (modo !== "remover" && !target) throw new Error("Selecione um Coordenador");
      const { data, error } = await supabase.rpc("coordenacao_definir_vinculo", {
        _supervisor_id: supervisor.supervisor_id,
        _novo_coord_id: target as unknown as string,
        _observacoes: (observacoes.trim() || undefined) as unknown as string,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(
        modo === "remover"
          ? "Vínculo removido com sucesso."
          : modo === "trocar"
            ? "Coordenador alterado com sucesso."
            : "Supervisor vinculado com sucesso.",
      );
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("FORBIDDEN")) {
        toast.error("Você não tem permissão para alterar este vínculo.");
      } else if (msg.includes("COORDENACAO_ALVO_INVALIDO")) {
        toast.error("O usuário selecionado não possui o papel Coordenador.");
      } else if (msg.includes("COORDENACAO_SUPERVISOR_INVALIDO")) {
        toast.error("Este usuário não possui mais o papel Supervisor.");
      } else {
        toast.error("Não foi possível concluir a operação.", { description: msg });
      }
    },
  });

  if (!supervisor) return null;

  const coordAtualNome =
    supervisor.coordenador_nome ?? (supervisor.coordenador_id ? "—" : "Sem Coordenador");
  const coordEscolhido =
    modo === "remover"
      ? null
      : (coordsQ.data ?? []).find((c) => c.id === novoCoord) ?? null;

  const podeConfirmar =
    modo === "remover" ? true : Boolean(novoCoord && novoCoord !== supervisor.coordenador_id);

  const titulo =
    modo === "remover"
      ? "Remover Coordenador"
      : modo === "trocar"
        ? "Trocar Coordenador"
        : "Vincular Coordenador";

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {modo === "remover" ? (
              <Link2Off className="h-5 w-5 text-destructive" />
            ) : (
              <UserPlus className="h-5 w-5 text-primary" />
            )}
            {titulo}
          </DialogTitle>
          <DialogDescription>
            Supervisor <strong>{supervisor.nome ?? supervisor.email ?? "—"}</strong>
            {supervisor.colaboradores_count > 0 && (
              <>
                {" "}
                — {supervisor.colaboradores_count} colaborador(es) impactado(s).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo do supervisor */}
          <Card className="bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <MiniStat label="Empresa" value={supervisor.empresa_principal_nome ?? "—"} isText />
              <MiniStat label="Projeto" value={supervisor.projeto_principal_nome ?? "—"} isText />
              <MiniStat label="Colaboradores" value={supervisor.colaboradores_count} />
              <MiniStat label="Coord. atual" value={coordAtualNome} isText />
            </div>
          </Card>

          {modo !== "remover" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Novo Coordenador</label>
              {coordsQ.isLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (coordsQ.data ?? []).length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Nenhum usuário com papel Coordenador foi encontrado. Cadastre um Coordenador em
                  Usuários antes de criar o vínculo.
                </div>
              ) : (
                <Select value={novoCoord} onValueChange={setNovoCoord}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o Coordenador" />
                  </SelectTrigger>
                  <SelectContent>
                    {(coordsQ.data ?? [])
                      .filter((c) => c.id !== supervisor.coordenador_id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome ?? c.email ?? c.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Observação (opcional)</label>
            <Input
              placeholder="Motivo da alteração (fica registrado na auditoria)"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              maxLength={240}
            />
          </div>

          {/* Resumo da alteração */}
          {modo !== "remover" && coordEscolhido && (
            <Card className="border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <UserCheck className="h-4 w-4 text-primary" />
                Resumo da alteração
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <MiniStat label="De" value={coordAtualNome} isText />
                <MiniStat
                  label="Para"
                  value={coordEscolhido.nome ?? coordEscolhido.email ?? "—"}
                  isText
                />
              </div>
            </Card>
          )}

          {modo === "remover" && (
            <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm">
              O Supervisor permanecerá ativo e nenhum Colaborador será alterado. Somente o vínculo
              com o Coordenador será removido.
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Cancelar
          </Button>
          {!confirmando ? (
            <Button
              variant={modo === "remover" ? "destructive" : "default"}
              disabled={!podeConfirmar || mut.isPending}
              onClick={() => setConfirmando(true)}
            >
              Continuar
            </Button>
          ) : (
            <Button
              variant={modo === "remover" ? "destructive" : "default"}
              disabled={mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {modo === "remover" ? "Confirmar remoção" : "Confirmar alteração"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Auxiliares ----------------------------------------------------

function BadgeList({ items, max = 3 }: { items: string[]; max?: number }) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (items.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((i, idx) => (
        <Badge key={`${i}-${idx}`} variant="outline" className="max-w-[160px] truncate">
          {i}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          +{rest}
        </Badge>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  isText,
}: {
  label: string;
  value: string | number;
  isText?: boolean;
}) {
  return (
    <div className="rounded-md bg-background/60 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 truncate font-medium", isText ? "text-xs" : "text-sm")}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

// Keep imports referenced (lucide FolderKanban is used in future filters; guard tree-shake noise)
void FolderKanban;
