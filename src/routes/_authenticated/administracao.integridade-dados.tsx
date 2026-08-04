import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  Search,
  RefreshCcw,
  AlertTriangle,
  AlertOctagon,
  Info,
  ArrowUpRight,
  CheckCircle2,
  Building2,
  FolderKanban,
  Loader2,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { friendlyRbacError } from "@/lib/rbac/errors";

export const Route = createFileRoute(
  "/_authenticated/administracao/integridade-dados",
)({
  head: () => ({
    meta: [
      { title: "Integridade de Dados · CRM MK9" },
      { name: "description", content: "Painel administrativo de integridade e diagnóstico de inconsistências de dados." },
      { property: "og:title", content: "Integridade de Dados · CRM MK9" },
      { property: "og:description", content: "Diagnóstico de inconsistências de dados operacionais no CRM MK9." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegridadePage,
});

type Tipo =
  | "supervisor_sem_coordenador"
  | "colaborador_sem_supervisor"
  | "supervisor_email_sem_uuid"
  | "supervisor_sem_matricula"
  | "usuario_sem_empresa"
  | "usuario_sem_projeto"
  | "matricula_duplicada"
  | "vinculo_orfao";

type Criticidade = "critica" | "alta" | "media" | "baixa";

type Row = {
  registro_id: string;
  tipo: Tipo;
  criticidade: Criticidade;
  entidade: "usuario" | "colaborador";
  nome: string;
  email: string | null;
  matricula: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  descricao: string;
  causa: string;
  acao_recomendada: string;
  detectado_em: string;
  total_geral: number;
};

type Resumo = Record<Tipo, number> & { gerado_em: string };

const TIPO_META: Record<Tipo, { label: string; criticidade: Criticidade; acao: "coordenacao" | "pendencias" | "editar_usuario" | "editar_colaborador" }> = {
  supervisor_sem_coordenador: { label: "Supervisores sem Coordenador", criticidade: "alta", acao: "coordenacao" },
  colaborador_sem_supervisor: { label: "Colaboradores sem Supervisor", criticidade: "media", acao: "editar_colaborador" },
  supervisor_email_sem_uuid: { label: "E-mail sem UUID resolvido", criticidade: "critica", acao: "pendencias" },
  supervisor_sem_matricula: { label: "Supervisores sem matrícula", criticidade: "media", acao: "editar_usuario" },
  usuario_sem_empresa: { label: "Usuários sem empresa", criticidade: "baixa", acao: "editar_usuario" },
  usuario_sem_projeto: { label: "Usuários sem projeto", criticidade: "baixa", acao: "editar_usuario" },
  matricula_duplicada: { label: "Matrículas duplicadas", criticidade: "alta", acao: "editar_usuario" },
  vinculo_orfao: { label: "Vínculos órfãos ou inválidos", criticidade: "critica", acao: "pendencias" },
};

const CRIT_STYLE: Record<Criticidade, { badge: string; ring: string; icon: React.ReactNode; label: string }> = {
  critica: { badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30", ring: "ring-rose-500/20", icon: <AlertOctagon className="h-4 w-4" />, label: "Crítica" },
  alta: { badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30", ring: "ring-orange-500/20", icon: <AlertTriangle className="h-4 w-4" />, label: "Alta" },
  media: { badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", ring: "ring-amber-500/20", icon: <AlertTriangle className="h-4 w-4" />, label: "Média" },
  baixa: { badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30", ring: "ring-sky-500/20", icon: <Info className="h-4 w-4" />, label: "Baixa" },
};

function IntegridadePage() {
  const { primaryRole: role, loading: sessionLoading } = useSession();
  const scope = useSessionScope();
  const navigate = useNavigate();

  const [tipo, setTipo] = React.useState<"__all__" | Tipo>("__all__");
  const [criticidade, setCriticidade] = React.useState<"__all__" | Criticidade>("__all__");
  const [empresaId, setEmpresaId] = React.useState<string>("__all__");
  const [projetoId, setProjetoId] = React.useState<string>("__all__");
  const [busca, setBusca] = React.useState("");
  const [debouncedBusca, setDebouncedBusca] = React.useState("");
  const [pagina, setPagina] = React.useState(0);
  const pageSize = 50;

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedBusca(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const permitido = role === "super_admin" || role === "rh" || role === "compliance";
  const enabled = !sessionLoading && permitido && scope.ready;

  const resumo = useQuery({
    queryKey: ["integridade-resumo", ...scope.keyParts],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_integridade_resumo" as never);
      if (error) throw error;
      return data as Resumo;
    },
  });

  const empresas = useQuery({
    queryKey: ["empresas-min-integridade", ...scope.keyParts],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as Array<{ id: string; nome: string }>;
    },
  });

  const projetos = useQuery({
    queryKey: ["projetos-min-integridade", empresaId, ...scope.keyParts],
    enabled,
    queryFn: async () => {
      let q = supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome");
      if (empresaId !== "__all__") q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Array<{ id: string; nome: string; empresa_id: string }>;
    },
  });

  const lista = useQuery({
    queryKey: ["integridade-listar", tipo, criticidade, empresaId, projetoId, debouncedBusca, pagina, ...scope.keyParts],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_integridade_listar" as never, {
        _tipo: tipo === "__all__" ? null : tipo,
        _criticidade: criticidade === "__all__" ? null : criticidade,
        _empresa_id: empresaId === "__all__" ? null : empresaId,
        _projeto_id: projetoId === "__all__" ? null : projetoId,
        _busca: debouncedBusca || null,
        _limit: pageSize,
        _offset: pagina * pageSize,
      } as never);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const total = lista.data?.[0]?.total_geral ?? 0;

  const filtrosAtivos =
    tipo !== "__all__" ||
    criticidade !== "__all__" ||
    empresaId !== "__all__" ||
    projetoId !== "__all__" ||
    debouncedBusca.length > 0;

  function abrirAcao(row: Row) {
    const meta = TIPO_META[row.tipo];
    switch (meta.acao) {
      case "coordenacao":
        navigate({ to: "/administracao/coordenacao" });
        break;
      case "pendencias":
        navigate({ to: "/administracao/pendencias-supervisor" });
        break;
      case "editar_usuario":
        navigate({ to: "/usuarios" });
        break;
      case "editar_colaborador":
        navigate({ to: "/colaboradores" });
        break;
    }
  }

  if (!sessionLoading && !permitido) {
    return (
      <AppShell title="Integridade de Dados">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Apenas Super Admin e RH podem acessar esta área.
        </Card>
      </AppShell>
    );
  }

  const geradoEm = resumo.data?.gerado_em ? new Date(resumo.data.gerado_em) : null;

  return (
    <AppShell title="Integridade de Dados" breadcrumb={["Administração", "Integridade de Dados"]}>
      <div className="flex flex-col gap-6">
        {/* Cabeçalho */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">Painel de Integridade de Dados</h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Diagnóstico administrativo de inconsistências operacionais. Nenhum vínculo é corrigido automaticamente —
              toda ação abre a tela apropriada para revisão manual.
            </p>
            <p className="text-xs text-muted-foreground">
              {resumo.isFetching && !resumo.data ? "Verificando…" : geradoEm ? `Última verificação: ${geradoEm.toLocaleString("pt-BR")}` : "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => { resumo.refetch(); lista.refetch(); }}
              disabled={resumo.isFetching || lista.isFetching}
            >
              {resumo.isFetching || lista.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Atualizar diagnóstico
            </Button>
          </div>
        </div>

        {/* Cards de indicadores */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(TIPO_META) as Tipo[]).map((k) => {
            const meta = TIPO_META[k];
            const crit = CRIT_STYLE[meta.criticidade];
            const valor = resumo.data?.[k] ?? 0;
            const carregando = resumo.isLoading;
            const zerado = !carregando && valor === 0;
            return (
              <Card
                key={k}
                className={`group relative overflow-hidden border p-4 transition hover:shadow-md ${zerado ? "opacity-70" : `ring-1 ${crit.ring}`}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </div>
                    <div className="mt-1 text-3xl font-semibold tabular-nums">
                      {carregando ? <Skeleton className="h-8 w-14" /> : valor.toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <Badge variant="outline" className={`gap-1 ${crit.badge}`}>
                    {crit.icon}
                    {crit.label}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {zerado ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sem ocorrências
                    </span>
                  ) : <span className="text-xs text-muted-foreground">Requer análise</span>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 transition group-hover:opacity-100"
                    onClick={() => { setTipo(k); setPagina(0); }}
                  >
                    Ver detalhes <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Filtros */}
        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
                  placeholder="Nome, e-mail, matrícula, empresa ou projeto"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Tipo</label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v as typeof tipo); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {(Object.keys(TIPO_META) as Tipo[]).map((k) => (
                    <SelectItem key={k} value={k}>{TIPO_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Criticidade</label>
              <Select value={criticidade} onValueChange={(v) => { setCriticidade(v as typeof criticidade); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Empresa</label>
              <Select value={empresaId} onValueChange={(v) => { setEmpresaId(v); setProjetoId("__all__"); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {empresas.data?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Projeto</label>
              <Select value={projetoId} onValueChange={(v) => { setProjetoId(v); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {projetos.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {filtrosAtivos && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Filtros aplicados</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTipo("__all__"); setCriticidade("__all__");
                  setEmpresaId("__all__"); setProjetoId("__all__");
                  setBusca(""); setPagina(0);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </Card>

        {/* Tabela */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b p-3 text-xs text-muted-foreground">
            <span>{lista.isLoading ? "Carregando…" : `${total.toLocaleString("pt-BR")} inconsistência(s)`}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => Math.max(0, p - 1))}>Anterior</Button>
              <span>Página {pagina + 1}</span>
              <Button size="sm" variant="ghost" disabled={(pagina + 1) * pageSize >= total} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registro</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Criticidade</TableHead>
                  <TableHead>Empresa / Projeto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                )}
                {lista.isError && !lista.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-rose-600">
                      {friendlyRbacError(lista.error).title}
                      <div className="mt-2">
                        <Button size="sm" variant="outline" onClick={() => lista.refetch()}>Tentar novamente</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!lista.isLoading && !lista.isError && (lista.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                      {filtrosAtivos ? "Nenhum resultado para os filtros aplicados." : "Nenhuma inconsistência detectada."}
                    </TableCell>
                  </TableRow>
                )}
                {(lista.data ?? []).map((row) => {
                  const meta = TIPO_META[row.tipo];
                  const crit = CRIT_STYLE[row.criticidade];
                  return (
                    <TableRow key={`${row.tipo}-${row.registro_id}`}>
                      <TableCell>
                        <div className="font-medium">{row.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.email ?? "—"}
                          {row.matricula ? <span className="ml-2 font-mono">· {row.matricula}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{meta.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${crit.badge}`}>{crit.icon}{crit.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.empresa_nome || row.projeto_nome ? (
                          <>
                            <div className="flex items-center gap-1"><Building2 className="h-3 w-3" />{row.empresa_nome ?? "—"}</div>
                            <div className="flex items-center gap-1 text-muted-foreground"><FolderKanban className="h-3 w-3" />{row.projeto_nome ?? "—"}</div>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[420px] text-xs">
                        <div>{row.descricao}</div>
                        <div className="text-muted-foreground">{row.acao_recomendada}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => abrirAcao(row)}>
                          Resolver <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
