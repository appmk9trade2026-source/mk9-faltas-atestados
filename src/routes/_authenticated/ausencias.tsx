import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { alterarStatusAusencia, processarAusenciaInterno, deleteAusencia } from "@/lib/ausencias.functions";

import { friendlyRbacError } from "@/lib/rbac/errors";
import {
  identidadeBuscaTexto,
  labelMatriculaColaborador,
  labelNomeColaborador,
  resolveAusenciaIdentidade,
} from "@/lib/ausencia-identidade";
import {
  Activity,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  History as HistoryIcon,
  Info,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  RefreshCcw,
  Trash2,
  AlertTriangle,
  Ban,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { RetificarAusenciaDialog } from "@/components/ausencias/retificar-ausencia-dialog";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { SupervisorEmptyState } from "@/components/supervisor-empty-state";
import {
  BUCKET_ATESTADOS,
  TIPO_AUSENCIA,
  TIPO_LABEL,
  getSignedAtestadoUrl,
  type StatusAusencia,
  type StatusProcessamento,
  type TipoAusencia,
} from "@/lib/ausencias";


export const Route = createFileRoute("/_authenticated/ausencias")({
  head: () => ({ meta: [{ title: "Ausências · CRM MK9" }] }),
  component: AusenciasPage,
});

type Empresa = { id: string; nome: string; ativo: boolean };
type Projeto = { id: string; nome: string; ativo: boolean; empresa_id: string };

type Ausencia = {
  id: string;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string;
  protocolo: string | null;
  tipo: TipoAusencia;
  motivo: string | null;
  data_inicio: string;
  data_fim: string;
  dias: number;
  possui_anexo: boolean;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  arquivo_mime: string | null;
  arquivo_tamanho: number | null;
  status: StatusAusencia;
  observacoes: string | null;
  registrado_por: string | null;
  registrado_em: string;
  lancado_por: string | null;
  lancado_em: string | null;
  created_at: string;
  updated_at: string;
  status_processamento: StatusProcessamento;
  processado_por: string | null;
  processado_em: string | null;
  observacao_processamento: string | null;
  retificada?: boolean | null;
  retificada_em?: string | null;
  retificacoes_count?: number | null;
  tipo_ausencia_id?: string | null;
  tipo_ausencia_nome?: string | null;
  opcao_periodo_id?: string | null;
  opcao_periodo_nome?: string | null;
  cid?: string | null;


  empresa?: { nome: string } | null;
  projeto?: { nome: string } | null;
  colaborador?: { nome_completo: string; matricula: string; cargo: string | null } | null;
  origem_registro?: string | null;
  manual_nome?: string | null;
  manual_matricula?: string | null;
  manual_cargo?: string | null;
  manual_telefone?: string | null;
  manual_email?: string | null;
  manual_whatsapp?: string | null;
  manual_supervisor_nome?: string | null;
  manual_supervisor_telefone?: string | null;
  manual_supervisor_email?: string | null;
  registrador?: { nome: string | null; email: string | null } | null;
  lancador?: { nome: string | null; email: string | null } | null;
  excluida_em?: string | null;
  excluidora_nome_snapshot?: string | null;
  excluidora_papel_snapshot?: string | null;
  motivo_exclusao_categoria?: string | null;
  motivo_exclusao_detalhe?: string | null;
  status_documental?: "ATIVO" | "EXCLUIDO" | "CONTESTADO" | "CANCELADO" | "RETIFICADO" | null;
  autor_nome_snapshot?: string | null;
  operacao_origem?: string | null;
  processamento_iniciado_em?: string | null;
  responsavel_processamento_nome?: string | null;
};

const PAGE_SIZE = 10;

function formatBRDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}
function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}
function formatSize(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function StatusBadge({ status }: { status: StatusAusencia | "SUBSTITUIDA" | "CANCELADO" }) {
  if (status === "PENDENTE")
    return (
      <Badge
        variant="secondary"
        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      >
        Pendente
      </Badge>
    );
  if (status === "SUBSTITUIDA")
    return (
      <Badge
        variant="secondary"
        className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
      >
        Substituída
      </Badge>
    );
  if (status === "CANCELADO")
    return (
      <Badge
        variant="secondary"
        className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      >
        Cancelado
      </Badge>
    );
  return (
    <Badge
      variant="secondary"
      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    >
      Lançado
    </Badge>
  );
}

function ProcessamentoBadge({ status }: { status: StatusProcessamento }) {
  switch (status) {
    case "AGUARDANDO":
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
          Aguardando
        </Badge>
      );
    case "EM_PROCESSAMENTO":
      return (
        <Badge variant="outline" className="border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
          Em processamento
        </Badge>
      );
    case "PROCESSADO":
      return (
        <Badge variant="outline" className="border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          Processado
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}


function AusenciasPage() {
  const { roles } = useSession();
  const scope = useSessionScope();
  const podeCadastrar =
    roles.includes("super_admin") || roles.includes("rh") || roles.includes("supervisor") || roles.includes("coordenador");
  const podeLancar = roles.includes("super_admin") || roles.includes("rh") || roles.includes("coordenador");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string>("all");
  const [projetoFiltro, setProjetoFiltro] = useState<string>("all");
  const [tipoFiltro, setTipoFiltro] = useState<string>("all");
  const [statusFiltro, setStatusFiltro] = useState<string>("all");
  const [processamentoFiltro, setProcessamentoFiltro] = useState<string>("all");

  const [periodoIni, setPeriodoIni] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [docStatusFiltro, setDocStatusFiltro] = useState<string>("ATIVO");
  const [sortBy, setSortBy] = useState<"data_inicio" | "created_at" | "colaborador">("data_inicio");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [viewing, setViewing] = useState<Ausencia | null>(null);
  const [confirmLancar, setConfirmLancar] = useState<Ausencia | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<Ausencia | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [retificando, setRetificando] = useState<Ausencia | null>(null);

  const [excluirCategoria, setExcluirCategoria] = useState("");
  const [excluirMotivo, setExcluirMotivo] = useState("");
  const [excluirConfirmado, setExcluirConfirmado] = useState(false);
  const podeIgnorarPrazo = roles.includes("super_admin") || roles.includes("rh");
  const podeRetificar =
    podeIgnorarPrazo || roles.includes("supervisor") || roles.includes("coordenador");
  const podeVerCid =
    roles.includes("super_admin") || roles.includes("rh") || roles.includes("compliance");
  const podeProcessarInterno =
    roles.includes("super_admin") || roles.includes("rh") || roles.includes("compliance");


  const empresasQ = useQuery({
    queryKey: ["empresas", "todas", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });
  const projetosQ = useQuery({
    queryKey: ["projetos", "todos-para-filtro", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, ativo, empresa_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });

  const ausenciasQ = useQuery({
    queryKey: ["ausencias", ...scope.keyParts],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(
          "*, empresa:empresas(nome), projeto:projetos(nome), colaborador:colaboradores(nome_completo, matricula, cargo)",
        );
      if (error) throw error;
      const rows = (data ?? []) as unknown as Ausencia[];

      const ids = Array.from(
        new Set(
          rows
            .flatMap((r) => [r.registrado_por, r.lancado_por])
            .filter((x): x is string => !!x),
        ),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome, email")
          .in("id", ids);
        const map = new Map((profs ?? []).map((p) => [p.id, p]));
        for (const r of rows) {
          r.registrador = r.registrado_por ? (map.get(r.registrado_por) ?? null) : null;
          r.lancador = r.lancado_por ? (map.get(r.lancado_por) ?? null) : null;
        }
      }
      return rows;
    },
  });

  const empresas = empresasQ.data ?? [];
  const projetos = projetosQ.data ?? [];
  const projetosFiltro = useMemo(
    () => (empresaFiltro === "all" ? projetos : projetos.filter((p) => p.empresa_id === empresaFiltro)),
    [projetos, empresaFiltro],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = ausenciasQ.data ?? [];
    if (q)
      list = list.filter((a) => {
        const hay =
          identidadeBuscaTexto(a) +
          " " +
          (a.empresa?.nome ?? "").toLowerCase() +
          " " +
          (a.projeto?.nome ?? "").toLowerCase() +
          " " +
          (a.motivo ?? "").toLowerCase();
        return hay.includes(q);
      });
    if (empresaFiltro !== "all") list = list.filter((a) => a.empresa_id === empresaFiltro);
    if (projetoFiltro !== "all") list = list.filter((a) => a.projeto_id === projetoFiltro);
    if (tipoFiltro !== "all") list = list.filter((a) => a.tipo === tipoFiltro);
    if (statusFiltro !== "all") list = list.filter((a) => a.status === statusFiltro);
    if (processamentoFiltro !== "all") list = list.filter((a) => a.status_processamento === processamentoFiltro);
    if (docStatusFiltro === "ATIVO") list = list.filter((a) => (a.status_documental ?? "ATIVO") === "ATIVO");
    if (docStatusFiltro === "EXCLUIDO") list = list.filter((a) => a.status_documental === "EXCLUIDO");

    if (periodoIni) list = list.filter((a) => a.data_fim >= periodoIni);
    if (periodoFim) list = list.filter((a) => a.data_inicio <= periodoFim);

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "colaborador")
        return (
          (resolveAusenciaIdentidade(a).nome ?? "").localeCompare(
            resolveAusenciaIdentidade(b).nome ?? "",
            "pt-BR",
          ) * dir
        );
      if (sortBy === "created_at")
        return (
          (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
        );
      return (
        (new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime()) * dir
      );
    });
    return list;
  }, [
    ausenciasQ.data,
    search,
    empresaFiltro,
    projetoFiltro,
    tipoFiltro,
    statusFiltro,
    periodoIni,
    periodoFim,
    sortBy,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const alterarStatusFn = useServerFn(alterarStatusAusencia);
  const lancarMut = useMutation({
    mutationFn: async (row: Ausencia) => {
      await alterarStatusFn({ data: { id: row.id, status: "LANCADO" } });
    },
    onSuccess: () => {
      toast.success("Lançamento concluído e WhatsApp enfileirado para o colaborador.");
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
      setConfirmLancar(null);
    },
    onError: (err: unknown) => {
      const friendly = friendlyRbacError(err);
      toast.error(friendly.title, {
        description: friendly.description ?? (friendly.correlationId ? `ref: ${friendly.correlationId.slice(0, 8)}` : undefined),
      });
      setConfirmLancar(null);
    },
  });
  
  const processarInternoFn = useServerFn(processarAusenciaInterno);
  const processarMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusProcessamento }) => {
      await processarInternoFn({ data: { ausencia_id: id, novo_status: status } });
    },
    onSuccess: (_, variables) => {
      const msg = variables.status === "EM_PROCESSAMENTO" ? "Processamento iniciado." : "Processamento concluído.";
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
    },
    onError: (err: unknown) => {
      const friendly = friendlyRbacError(err);
      toast.error(friendly.title, { description: friendly.description });
    },
  });

  const deleteAusenciaFn = useServerFn(deleteAusencia);
  const excluirMut = useMutation({
    mutationFn: async (row: Ausencia) => {
      await deleteAusenciaFn({ 
        data: { 
          id: row.id, 
          categoria_motivo: excluirCategoria, 
          motivo: excluirMotivo 
        } 
      });
    },
    onSuccess: () => {
      toast.success("Lançamento excluído com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
      setConfirmExcluir(null);
      setExcluirCategoria("");
      setExcluirMotivo("");
      setExcluirConfirmado(false);
    },
    onError: (err: unknown) => {
      const friendly = friendlyRbacError(err);
      toast.error(friendly.title, { description: friendly.description });
    },
  });


  async function baixarAnexo(row: Ausencia) {
    if (!row.arquivo_url) return;
    try {
      setDownloading(row.id);
      const url = await getSignedAtestadoUrl(row.arquivo_url, 120);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Não foi possível baixar o anexo.", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloading(null);
    }
  }

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  return (
    <AppShell title="Ausências" breadcrumb={["Operações", "Ausências"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Registros de faltas, atestados, declarações e demais ausências. Nenhum
          registro é excluído — todo histórico é preservado.
        </p>
        {podeCadastrar && (
          <Button asChild className="sm:w-auto">
            <Link to="/nova-ausencia">
              <Plus className="mr-2 h-4 w-4" /> Nova ausência
            </Link>
          </Button>
        )}
      </div>

      {scope.isSupervisorOnly &&
        !ausenciasQ.isLoading &&
        (ausenciasQ.data?.length ?? 0) === 0 && (
          <SupervisorEmptyState
            title="Você ainda não possui ausências para acompanhar"
            description="Nenhum colaborador está vinculado ao seu usuário. Solicite ao RH ou Super Admin a atribuição administrativa para começar a lançar ausências."
          />
        )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Colaborador, matrícula, empresa..."
                className="pl-8"
              />
            </div>
            <Select
              value={empresaFiltro}
              onValueChange={(v) => {
                setEmpresaFiltro(v);
                setProjetoFiltro("all");
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projetoFiltro} onValueChange={(v) => { setProjetoFiltro(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {projetosFiltro.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Select value={tipoFiltro} onValueChange={(v) => { setTipoFiltro(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TIPO_AUSENCIA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="LANCADO">Lançado</SelectItem>
                  <SelectItem value="SUBSTITUIDA">Substituída</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>

                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Select value={processamentoFiltro} onValueChange={(v) => { setProcessamentoFiltro(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Status de Processamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Processamentos</SelectItem>
                <SelectItem value="AGUARDANDO">Aguardando</SelectItem>
                <SelectItem value="EM_PROCESSAMENTO">Em processamento</SelectItem>
                <SelectItem value="PROCESSADO">Processado</SelectItem>
              </SelectContent>
            </Select>

            {(roles.includes("super_admin") || roles.includes("rh")) && (
              <Select value={docStatusFiltro} onValueChange={(v) => { setDocStatusFiltro(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Status Documental" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (Ativos e Excluídos)</SelectItem>
                  <SelectItem value="ATIVO">Ativos</SelectItem>
                  <SelectItem value="EXCLUIDO">Excluídos</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>




          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs text-muted-foreground">Período:</label>
            <Input
              type="date"
              value={periodoIni}
              onChange={(e) => { setPeriodoIni(e.target.value); setPage(1); }}
              className="sm:w-44"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={periodoFim}
              onChange={(e) => { setPeriodoFim(e.target.value); setPage(1); }}
              className="sm:w-44"
            />
            {(periodoIni || periodoFim) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setPeriodoIni(""); setPeriodoFim(""); }}
              >
                Limpar período
              </Button>
            )}
            <div className="sm:ml-auto text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">
                  <button
                    onClick={() => toggleSort("colaborador")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Colaborador <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">Empresa</TableHead>
                <TableHead className="hidden lg:table-cell">Projeto</TableHead>
                <TableHead className="hidden xl:table-cell">Protocolo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("data_inicio")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Período <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="text-center">Dias</TableHead>
                <TableHead className="w-[120px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        Status RH <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>Representa o lançamento da ausência pelo Supervisor/RH.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="w-[140px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        Processamento <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>Representa o andamento administrativo interno.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>

                <TableHead className="text-center">Anexo</TableHead>
                <TableHead className="hidden xl:table-cell">Registrado por</TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    onClick={() => toggleSort("created_at")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Cadastro <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="w-[70px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ausenciasQ.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={11}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {ausenciasQ.isError && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-sm text-destructive">
                    Erro ao carregar: {(ausenciasQ.error as Error)?.message}
                  </TableCell>
                </TableRow>
              )}

              {!ausenciasQ.isLoading && !ausenciasQ.isError && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <HistoryIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Nenhuma ausência encontrada</p>
                      <p className="text-xs text-muted-foreground">
                        Ajuste os filtros ou registre uma nova ausência.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span
                        className={
                          resolveAusenciaIdentidade(row).indisponivel
                            ? "font-medium text-destructive"
                            : "font-medium"
                        }
                      >
                        {labelNomeColaborador(row)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Mat. {labelMatriculaColaborador(row)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {row.empresa?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {row.projeto?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-xs">
                    {row.protocolo ? (
                      <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 tracking-wider text-blue-700 dark:text-blue-300">
                        {row.protocolo}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline">{TIPO_LABEL[row.tipo]}</Badge>
                      {row.status_documental === "EXCLUIDO" && (
                        <Badge
                          variant="destructive"
                          className="bg-red-500/10 text-red-700 border-red-500/30"
                        >
                          EXCLUÍDO
                        </Badge>
                      )}
                      {row.retificada && (
                        <Badge
                          variant="secondary"
                          className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        >
                          Retificada
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm">
                    {formatBRDate(row.data_inicio)} — {formatBRDate(row.data_fim)}
                  </TableCell>
                  <TableCell className="text-center">{row.dias}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <ProcessamentoBadge status={row.status_processamento} />
                  </TableCell>

                  <TableCell className="text-center">
                    {row.possui_anexo ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => baixarAnexo(row)}
                        disabled={downloading === row.id}
                        aria-label="Baixar anexo"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                    {row.registrador?.nome ?? row.registrador?.email ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Ações</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewing(row)}>
                          <Eye className="mr-2 h-4 w-4" /> Visualizar
                        </DropdownMenuItem>

                        {podeProcessarInterno && row.status_processamento === "AGUARDANDO" && (
                          <DropdownMenuItem onClick={() => processarMut.mutate({ id: row.id, status: "EM_PROCESSAMENTO" })}>
                            <RefreshCcw className="mr-2 h-4 w-4" /> Iniciar processamento
                          </DropdownMenuItem>
                        )}

                        {podeProcessarInterno && row.status_processamento === "EM_PROCESSAMENTO" && (
                          <DropdownMenuItem onClick={() => processarMut.mutate({ id: row.id, status: "PROCESSADO" })}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Concluir processamento
                          </DropdownMenuItem>
                        )}

                        {podeCadastrar && row.status === "PENDENTE" && (
                          <DropdownMenuItem asChild>
                            <Link to="/nova-ausencia" search={{ id: row.id }}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {row.possui_anexo && (
                          <DropdownMenuItem onClick={() => baixarAnexo(row)}>
                            <Download className="mr-2 h-4 w-4" /> Baixar anexo
                          </DropdownMenuItem>
                        )}
                        {podeRetificar && row.status === "PENDENTE" && (
                          <DropdownMenuItem onClick={() => setRetificando(row)}>
                            <RefreshCcw className="mr-2 h-4 w-4" /> Retificar ausência
                          </DropdownMenuItem>
                        )}
                        {podeLancar && row.status === "PENDENTE" && (
                          <DropdownMenuItem onClick={() => setConfirmLancar(row)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como lançado
                          </DropdownMenuItem>
                        )}
                        {(roles.includes("super_admin") || roles.includes("rh")) && row.status_documental !== "EXCLUIDO" && (
                          <>
                            <div className="my-1 h-px bg-muted" />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              onClick={() => {
                                setConfirmExcluir(row);
                                setExcluirCategoria("");
                                setExcluirMotivo("");
                                setExcluirConfirmado(false);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir lançamento
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t p-3">
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{labelNomeColaborador(viewing) !== "—" ? labelNomeColaborador(viewing) : "Ausência"}</DialogTitle>
            <DialogDescription>Detalhes do registro</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Colaborador
                </h4>
                <dl className="grid grid-cols-3 gap-2">
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="col-span-2">{labelNomeColaborador(viewing)}</dd>
                  <dt className="text-muted-foreground">Matrícula</dt>
                  <dd className="col-span-2 font-mono">{labelMatriculaColaborador(viewing)}</dd>
                  <dt className="text-muted-foreground">Cargo</dt>
                  <dd className="col-span-2">{resolveAusenciaIdentidade(viewing).cargo ?? "—"}</dd>
                  <dt className="text-muted-foreground">Empresa</dt>
                  <dd className="col-span-2">{viewing.empresa?.nome ?? "—"}</dd>
                  <dt className="text-muted-foreground">Projeto</dt>
                  <dd className="col-span-2">{viewing.projeto?.nome ?? "—"}</dd>
                </dl>
              </section>

              {viewing.status_documental === "EXCLUIDO" && (
                <section className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                    <Trash2 className="h-3 w-3" /> Exclusão Administrativa
                  </h4>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <dt className="text-muted-foreground font-medium">Status:</dt>
                    <dd className="col-span-2"><Badge variant="destructive" className="h-5 text-[10px] py-0">EXCLUÍDO</Badge></dd>
                    
                    <dt className="text-muted-foreground font-medium">Excluído por:</dt>
                    <dd className="col-span-2">{viewing.excluidora_nome_snapshot ?? "—"}</dd>
                    
                    <dt className="text-muted-foreground font-medium">Papel:</dt>
                    <dd className="col-span-2 uppercase">{viewing.excluidora_papel_snapshot ?? "—"}</dd>
                    
                    <dt className="text-muted-foreground font-medium">Data:</dt>
                    <dd className="col-span-2">{formatDateTime(viewing.excluida_em)}</dd>
                    
                    <dt className="text-muted-foreground font-medium">Categoria:</dt>
                    <dd className="col-span-2">{viewing.motivo_exclusao_categoria ?? "—"}</dd>
                    
                    <dt className="text-muted-foreground font-medium">Motivo:</dt>
                    <dd className="col-span-2 italic text-muted-foreground">{viewing.motivo_exclusao_detalhe ?? "—"}</dd>
                  </dl>
                </section>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ausência
                </h4>
                <dl className="grid grid-cols-3 gap-2">
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="col-span-2">{TIPO_LABEL[viewing.tipo]}</dd>
                  <dt className="text-muted-foreground">Período</dt>
                  <dd className="col-span-2">
                    {formatBRDate(viewing.data_inicio)} — {formatBRDate(viewing.data_fim)} ·{" "}
                    <span className="text-muted-foreground">{viewing.dias} dia(s)</span>
                  </dd>
                  <dt className="text-muted-foreground">Status RH</dt>
                  <dd className="col-span-2">
                    <StatusBadge status={viewing.status} />
                  </dd>
                  <dt className="text-muted-foreground">Processamento</dt>
                  <dd className="col-span-2">
                    <ProcessamentoBadge status={viewing.status_processamento} />
                  </dd>
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd className="col-span-2 whitespace-pre-wrap">{viewing.motivo ?? "—"}</dd>
                  <dt className="text-muted-foreground">Observações</dt>
                  <dd className="col-span-2 whitespace-pre-wrap">{viewing.observacoes ?? "—"}</dd>
                  {viewing.status_processamento !== "AGUARDANDO" && (
                    <>
                      <dt className="text-muted-foreground">Proc. Iniciado</dt>
                      <dd className="col-span-2">{formatDateTime(viewing.processado_em || (viewing as any).processamento_iniciado_em)}</dd>
                      <dt className="text-muted-foreground">Responsável</dt>
                      <dd className="col-span-2">{viewing.processado_por || (viewing as any).responsavel_processamento_nome || "—"}</dd>
                    </>
                  )}
                  {viewing.status_processamento === "PROCESSADO" && (
                    <>
                      <dt className="text-muted-foreground">Proc. Concluído</dt>
                      <dd className="col-span-2">{formatDateTime((viewing as any).processamento_concluido_em)}</dd>
                    </>
                  )}
                </dl>
              </section>
              
              <section className="rounded-lg border bg-slate-50/50 dark:bg-slate-900/20 p-4">
                <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <HistoryIcon className="h-3.5 w-3.5" /> Histórico Administrativo
                </h4>
                <div className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-muted">
                  {/* Registro Inicial */}
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-1 h-5 w-5 rounded-full border-2 border-background bg-emerald-100 flex items-center justify-center">
                      <Plus className="h-2.5 w-2.5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Registro da Ausência</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateTime(viewing.registrado_em)} • {viewing.registrador?.nome || viewing.autor_nome_snapshot || "Sistema"} ({viewing.operacao_origem || "WEB"})
                      </p>
                    </div>
                  </div>

                  {/* Lançamento RH */}
                  {viewing.lancado_em && (
                    <div className="relative pl-8">
                      <div className="absolute left-0 top-1 h-5 w-5 rounded-full border-2 border-background bg-blue-100 flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">Lançamento RH</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(viewing.lancado_em)} • {viewing.lancador?.nome || "RH/Admin"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Processamento */}
                  {(viewing.processamento_iniciado_em || viewing.processado_em) && (
                    <div className="relative pl-8">
                      <div className="absolute left-0 top-1 h-5 w-5 rounded-full border-2 border-background bg-amber-100 flex items-center justify-center">
                        <Activity className="h-2.5 w-2.5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">Processamento Central</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(viewing.processamento_iniciado_em || viewing.processado_em)} • {viewing.responsavel_processamento_nome || viewing.processado_por || "Central"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Exclusão */}
                  {viewing.status_documental === "EXCLUIDO" && (
                    <div className="relative pl-8">
                      <div className="absolute left-0 top-1 h-5 w-5 rounded-full border-2 border-background bg-red-100 flex items-center justify-center">
                        <Trash2 className="h-2.5 w-2.5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-red-700">Exclusão Efetivada</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(viewing.excluida_em)} • {viewing.excluidora_nome_snapshot} ({viewing.excluidora_papel_snapshot})
                        </p>
                        <p className="text-[10px] mt-0.5 italic">Motivo: {viewing.motivo_exclusao_categoria}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {viewing.status_documental !== "EXCLUIDO" && (
              <section>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" /> Métricas de Processamento
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Status Atual</p>
                    <ProcessamentoBadge status={viewing.status_processamento} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Responsável</p>
                    <p className="text-sm font-semibold">{viewing.processado_por || viewing.responsavel_processamento_nome || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Iniciado em</p>
                    <p className="text-sm">{formatDateTime(viewing.processado_em || viewing.processamento_iniciado_em)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Tempo aguardando</p>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {Math.max(0, Math.floor((new Date().getTime() - new Date(viewing.registrado_em).getTime()) / (1000 * 60 * 60 * 24)))} dias
                    </p>
                  </div>
                </div>
              </section>
              )}

              <section>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <HistoryIcon className="h-3.5 w-3.5" /> Timeline de Eventos
                </h4>
                <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-muted">
                  <div className="relative">
                    <div className="absolute -left-[23px] top-1.5 h-4 w-4 rounded-full border-2 border-background bg-slate-200 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Registrou ausência</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateTime(viewing.registrado_em)} • {viewing.registrador?.nome || "Supervisor"}
                      </p>
                    </div>
                  </div>

                  {viewing.lancado_em && (
                    <div className="relative">
                      <div className="absolute -left-[23px] top-1.5 h-4 w-4 rounded-full border-2 border-background bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Status RH: LANÇADO</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(viewing.lancado_em)} • {viewing.lancador?.nome || "RH"}
                        </p>
                      </div>
                    </div>
                  )}

                  {viewing.status_processamento !== "AGUARDANDO" && (
                    <div className="relative">
                      <div className="absolute -left-[23px] top-1.5 h-4 w-4 rounded-full border-2 border-background bg-blue-100 flex items-center justify-center">
                        <RefreshCcw className="h-2.5 w-2.5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Processamento Iniciado</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(viewing.processado_em || (viewing as any).processamento_iniciado_em)} • {viewing.processado_por || (viewing as any).responsavel_processamento_nome || "Administrativo"}
                        </p>
                      </div>
                    </div>
                  )}

                  {viewing.status_processamento === "PROCESSADO" && (
                    <div className="relative">
                      <div className="absolute -left-[23px] top-1.5 h-4 w-4 rounded-full border-2 border-background bg-emerald-500 flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Processamento Concluído</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime((viewing as any).processamento_concluido_em)} • {viewing.processado_por || (viewing as any).responsavel_processamento_nome || "Administrativo"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Registro Original
                </h4>
                <dl className="grid grid-cols-3 gap-2">
                  <dt className="text-muted-foreground">Registrado por</dt>
                  <dd className="col-span-2">
                    {viewing.registrador?.nome ?? viewing.registrador?.email ?? "—"}
                  </dd>
                  <dt className="text-muted-foreground">Registrado em</dt>
                  <dd className="col-span-2">{formatDateTime(viewing.registrado_em)}</dd>
                  <dt className="text-muted-foreground">Lançado por</dt>
                  <dd className="col-span-2">
                    {viewing.lancador?.nome ?? viewing.lancador?.email ?? "—"}
                  </dd>
                  <dt className="text-muted-foreground">Lançado em</dt>
                  <dd className="col-span-2">{formatDateTime(viewing.lancado_em)}</dd>
                  {viewing.status === "SUBSTITUIDA" && (
                    <>
                      <dt className="text-blue-600 font-semibold">Substituída em</dt>
                      <dd className="col-span-2 text-blue-600 font-semibold">
                        {formatDateTime(viewing.retificada_em || (viewing as any).substituida_em)}
                      </dd>
                      <dt className="text-muted-foreground">Motivo Subst.</dt>
                      <dd className="col-span-2 italic">
                        {(viewing as any).motivo_substituicao ?? "Conflito de período."}
                      </dd>
                    </>
                  )}
                </dl>
              </section>

              {viewing.status_documental === "EXCLUIDO" && (
                <section className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/40">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-red-700 dark:text-red-400 uppercase tracking-tight">
                        REGISTRO EXCLUÍDO
                      </h4>
                      <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed">
                        Este lançamento permanece preservado para auditoria, porém não possui efeitos operacionais.
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-red-200 pt-4 dark:border-red-900/30">
                    <div>
                      <h5 className="text-[10px] font-bold uppercase text-red-800 dark:text-red-400 mb-2">Impacto da Exclusão</h5>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[10px] text-red-600 dark:text-red-300">
                          <Ban className="h-3 w-3" /> Removido do Dashboard & KPIs
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-red-600 dark:text-red-300">
                          <Ban className="h-3 w-3" /> Removido do BI Executivo
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-red-600 dark:text-red-300">
                          <Ban className="h-3 w-3" /> Suspenso da Central de Proc.
                        </div>
                      </div>
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold uppercase text-red-800 dark:text-red-400 mb-2">Preservação Forense</h5>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> Mantido em Auditoria
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> Central de Investigações
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" /> Histórico Administrativo
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Anexo
                </h4>
                {viewing.possui_anexo ? (
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {viewing.arquivo_nome ?? "arquivo"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {viewing.arquivo_mime ?? BUCKET_ATESTADOS} ·{" "}
                        {formatSize(viewing.arquivo_tamanho)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => baixarAnexo(viewing)}
                      disabled={downloading === viewing.id}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Baixar
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem anexo.</p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmLancar} onOpenChange={(o) => !o && setConfirmLancar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como lançado?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será marcado como <strong>LANCADO</strong> e a data/autor do
              lançamento serão gravados. O histórico é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lancarMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmLancar) lancarMut.mutate(confirmLancar);
              }}
              disabled={lancarMut.isPending}
            >
              {lancarMut.isPending ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RetificarAusenciaDialog
        ausencia={retificando as never}
        open={!!retificando}
        onOpenChange={(o) => !o && setRetificando(null)}
        podeIgnorarPrazo={podeIgnorarPrazo}
        podeVerCid={podeVerCid}
        nomeColaborador={retificando ? labelNomeColaborador(retificando) : "—"}
      />

      <AlertDialog open={!!confirmExcluir} onOpenChange={(o) => !o && setConfirmExcluir(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Excluir lançamento?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Este lançamento será retirado dos fluxos operacionais e dos indicadores, 
                mas continuará preservado no histórico de auditoria.
              </p>
              
              {confirmExcluir && (
                <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1 text-foreground">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Colaborador:</span>
                    <span className="font-medium">{labelNomeColaborador(confirmExcluir)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Matrícula:</span>
                    <span className="font-mono">{labelMatriculaColaborador(confirmExcluir)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Empresa/Proj:</span>
                    <span>{confirmExcluir.empresa?.nome} / {confirmExcluir.projeto?.nome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Protocolo:</span>
                    <span className="font-mono">{confirmExcluir.protocolo || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo/Período:</span>
                    <span>{TIPO_LABEL[confirmExcluir.tipo]} ({formatBRDate(confirmExcluir.data_inicio)})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status RH/Proc:</span>
                    <span>{confirmExcluir.status} / {confirmExcluir.status_processamento}</span>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria do motivo</label>
              <Select value={excluirCategoria} onValueChange={setExcluirCategoria}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Colaborador incorreto">Colaborador incorreto</SelectItem>
                  <SelectItem value="Matrícula incorreta">Matrícula incorreta</SelectItem>
                  <SelectItem value="Tipo incorreto">Tipo incorreto</SelectItem>
                  <SelectItem value="Período incorreto">Período incorreto</SelectItem>
                  <SelectItem value="Registro duplicado">Registro duplicado</SelectItem>
                  <SelectItem value="Teste indevido">Teste indevido</SelectItem>
                  <SelectItem value="Lançamento sem fundamento">Lançamento sem fundamento</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Motivo detalhado {excluirCategoria === "Outro" && <span className="text-destructive">*</span>}
              </label>
              <Input 
                value={excluirMotivo}
                onChange={(e) => setExcluirMotivo(e.target.value)}
                placeholder="Descreva a razão da exclusão..."
              />
            </div>

            <div className="flex items-center space-x-2 rounded-md border p-3">
              <input 
                type="checkbox" 
                id="confirm_exc"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                checked={excluirConfirmado}
                onChange={(e) => setExcluirConfirmado(e.target.checked)}
              />
              <label htmlFor="confirm_exc" className="text-xs text-muted-foreground cursor-pointer leading-tight">
                Confirmo que esta exclusão é definitiva para fins operacionais e que os dados 
                de autoria serão registrados para auditoria.
              </label>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setExcluirCategoria("");
              setExcluirMotivo("");
              setExcluirConfirmado(false);
            }}>
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={
                !excluirCategoria || 
                (excluirCategoria === "Outro" && !excluirMotivo.trim()) || 
                !excluirMotivo.trim() ||
                !excluirConfirmado ||
                excluirMut.isPending
              }
              onClick={() => confirmExcluir && excluirMut.mutate(confirmExcluir)}
            >
              {excluirMut.isPending ? "Excluindo..." : "Excluir lançamento"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

