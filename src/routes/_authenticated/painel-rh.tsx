import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  RefreshCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  TIPO_LABEL,
  getSignedAtestadoUrl,
  type StatusAusencia,
  type TipoAusencia,
} from "@/lib/ausencias";
import { fetchCategorias, fetchTiposComCategoria, CATEGORIA_CORES, type Categoria, type TipoComCategoria } from "@/lib/categorias";

export const Route = createFileRoute("/_authenticated/painel-rh")({
  head: () => ({ meta: [{ title: "Painel do RH · CRM MK9" }] }),
  component: PainelRHPage,
});

/* ==================== Tipos ==================== */

type Empresa = { id: string; nome: string };
type Projeto = { id: string; nome: string; empresa_id: string };

type AusenciaRow = {
  id: string;
  status: StatusAusencia;
  tipo: TipoAusencia;
  tipo_ausencia_id: string | null;
  tipo_ausencia_codigo: string | null;
  tipo_ausencia_nome: string | null;
  data_inicio: string;
  data_fim: string;
  dias: number;
  cid: string | null;
  loja_codigo_nome: string | null;
  localidade: string | null;
  motivo: string | null;
  acidente_trabalho_trajeto: boolean | null;
  possui_anexo: boolean;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  registrado_por: string | null;
  registrado_em: string;
  lancado_por: string | null;
  lancado_em: string | null;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string;
  empresa: { nome: string } | null;
  projeto: { nome: string } | null;
  colaborador: {
    nome_completo: string;
    matricula: string;
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
    supervisor_nome: string | null;
    supervisor_telefone: string | null;
    supervisor_email: string | null;
  } | null;
};

type ProfileMini = { id: string; nome: string | null; email: string | null };

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* ==================== Helpers ==================== */

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}
function fmtDT(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}
function todayISO() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function StatusBadge({ status }: { status: StatusAusencia }) {
  if (status === "PENDENTE")
    return (
      <Badge variant="secondary" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
        Pendente
      </Badge>
    );
  return (
    <Badge variant="secondary" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
      Lançado
    </Badge>
  );
}

/* ==================== KPIs ==================== */

async function countBy(filters: Record<string, unknown>) {
  let q = supabase.from("ausencias").select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v as never);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

function useKPIs(auto: boolean) {
  return useQuery({
    queryKey: ["painel-rh", "kpis"],
    refetchInterval: auto ? 60_000 : false,
    queryFn: async () => {
      const today = todayISO();
      const [pendentes, atestado, falta, decl, susp, lancHoje] = await Promise.all([
        countBy({ status: "PENDENTE" }),
        countBy({ status: "PENDENTE", tipo: "ATESTADO" }),
        countBy({ status: "PENDENTE", tipo: "FALTA" }),
        countBy({ status: "PENDENTE", tipo: "DECLARACAO" }),
        countBy({ status: "PENDENTE", tipo: "SUSPENSAO" }),
        (async () => {
          const { count, error } = await supabase
            .from("ausencias")
            .select("id", { count: "exact", head: true })
            .eq("status", "LANCADO")
            .gte("lancado_em", `${today}T00:00:00`)
            .lte("lancado_em", `${today}T23:59:59.999`);
          if (error) throw error;
          return count ?? 0;
        })(),
      ]);
      return { pendentes, atestado, falta, decl, susp, lancHoje };
    },
  });
}

/* ==================== Página ==================== */

function PainelRHPage() {
  const { roles } = useSession();
  const podeEditar = roles.includes("super_admin") || roles.includes("rh");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Auto-refresh toggle
  const [auto, setAuto] = useState(true);

  // Filtros
  const [empresaF, setEmpresaF] = useState("all");
  const [projetoF, setProjetoF] = useState("all");
  const [supervisorF, setSupervisorF] = useState("");
  const [categoriaF, setCategoriaF] = useState("all");
  const [tipoOficialF, setTipoOficialF] = useState("all");
  const [statusF, setStatusF] = useState<"all" | StatusAusencia>("PENDENTE");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Seleção / drawer
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<AusenciaRow | null>(null);
  const [confirmLote, setConfirmLote] = useState(false);
  const [confirmSingle, setConfirmSingle] = useState<AusenciaRow | null>(null);

  // Reset página quando filtros mudam
  useEffect(() => {
    setPage(1);
  }, [empresaF, projetoF, supervisorF, categoriaF, tipoOficialF, statusF, dataIni, dataFim, busca, pageSize]);

  const empresasQ = useQuery({
    queryKey: ["empresas", "todas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });
  const projetosQ = useQuery({
    queryKey: ["projetos", "todos-para-filtro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, empresa_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });
  const empresas = empresasQ.data ?? [];
  const projetos = projetosQ.data ?? [];
  const projetosFiltro = useMemo(
    () => (empresaF === "all" ? projetos : projetos.filter((p) => p.empresa_id === empresaF)),
    [projetos, empresaF],
  );

  const kpisQ = useKPIs(auto);

  const categoriasQ = useQuery<Categoria[]>({
    queryKey: ["categorias-ausencia"],
    queryFn: fetchCategorias,
    staleTime: 10 * 60_000,
  });
  const tiposQ = useQuery<TipoComCategoria[]>({
    queryKey: ["tipos-ausencia-com-categoria"],
    queryFn: fetchTiposComCategoria,
    staleTime: 10 * 60_000,
  });
  const categorias = categoriasQ.data ?? [];
  const tiposAll = tiposQ.data ?? [];
  const tiposFiltro = useMemo(
    () => (categoriaF === "all" ? tiposAll : tiposAll.filter((t) => t.categoria_ausencia_id === categoriaF)),
    [tiposAll, categoriaF],
  );
  const tiposIdsDaCategoria = useMemo(
    () => tiposAll.filter((t) => t.categoria_ausencia_id === categoriaF).map((t) => t.id),
    [tiposAll, categoriaF],
  );

  const listQ = useQuery({
    queryKey: [
      "painel-rh",
      "list",
      { empresaF, projetoF, supervisorF, categoriaF, tipoOficialF, statusF, dataIni, dataFim, busca, page, pageSize },
    ],
    refetchInterval: auto ? 60_000 : false,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const supervisorAtivo = supervisorF.trim();
      const joinKind = supervisorAtivo ? "!inner" : "";
      const selectStr = `id, status, tipo, tipo_ausencia_id, tipo_ausencia_codigo, tipo_ausencia_nome, data_inicio, data_fim, dias, cid, loja_codigo_nome, localidade, motivo, acidente_trabalho_trajeto, possui_anexo, arquivo_url, arquivo_nome, registrado_por, registrado_em, lancado_por, lancado_em, empresa_id, projeto_id, colaborador_id, empresa:empresas(nome), projeto:projetos(nome), colaborador:colaboradores${joinKind}(nome_completo, matricula, email, telefone, whatsapp, supervisor_nome, supervisor_telefone, supervisor_email)`;

      let q = supabase.from("ausencias").select(selectStr, { count: "exact" });

      if (empresaF !== "all") q = q.eq("empresa_id", empresaF);
      if (projetoF !== "all") q = q.eq("projeto_id", projetoF);
      if (tipoOficialF !== "all") {
        q = q.eq("tipo_ausencia_id", tipoOficialF);
      } else if (categoriaF !== "all" && tiposIdsDaCategoria.length) {
        q = q.in("tipo_ausencia_id", tiposIdsDaCategoria);
      }
      if (statusF !== "all") q = q.eq("status", statusF);
      if (dataIni) q = q.gte("data_fim", dataIni);
      if (dataFim) q = q.lte("data_inicio", dataFim);
      if (supervisorAtivo) {
        q = q.ilike("colaborador.supervisor_nome", `%${supervisorAtivo}%`);
      }

      const buscaTrim = busca.trim();
      if (buscaTrim) {
        // Loja + CID (na própria tabela ausencias)
        q = q.or(
          `loja_codigo_nome.ilike.%${buscaTrim}%,cid.ilike.%${buscaTrim.toUpperCase()}%`,
        );
      }


      q = q.order("data_inicio", { ascending: false }).range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      let rows = (data ?? []) as unknown as AusenciaRow[];

      // Busca por nome / matrícula (client-side no page-slice para não complicar a query)
      if (buscaTrim) {
        const lower = buscaTrim.toLowerCase();
        rows = rows.filter((r) => {
          const hay =
            (r.colaborador?.nome_completo ?? "").toLowerCase() +
            " " +
            (r.colaborador?.matricula ?? "").toLowerCase() +
            " " +
            (r.loja_codigo_nome ?? "").toLowerCase() +
            " " +
            (r.cid ?? "").toLowerCase();
          return hay.includes(lower);
        });
      }

      // Hidrata registrado_por / lancado_por
      const ids = Array.from(
        new Set(rows.flatMap((r) => [r.registrado_por, r.lancado_por]).filter((x): x is string => !!x)),
      );
      let profMap = new Map<string, ProfileMini>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome, email").in("id", ids);
        profMap = new Map((profs ?? []).map((p) => [p.id, p as ProfileMini]));
      }

      return { rows, count: count ?? 0, profMap };
    },
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.count ?? 0;
  const profMap = listQ.data?.profMap ?? new Map<string, ProfileMini>();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectedIds = useMemo(
    () => rows.filter((r) => selected[r.id] && r.status === "PENDENTE").map((r) => r.id),
    [rows, selected],
  );
  const allPageSelected = rows.length > 0 && rows.every((r) => selected[r.id] || r.status !== "PENDENTE");

  function togglePage(v: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.status === "PENDENTE") next[r.id] = v;
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
  }

  const marcarLoteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return { atualizados: 0, ignorados: 0 };
      // Só atualiza os que ainda estão PENDENTE (o trigger seta lancado_por/em automaticamente)
      const { data, error } = await supabase
        .from("ausencias")
        .update({ status: "LANCADO" as StatusAusencia })
        .in("id", ids)
        .eq("status", "PENDENTE")
        .select("id");
      if (error) throw error;
      const atualizados = data?.length ?? 0;
      return { atualizados, ignorados: ids.length - atualizados };
    },
    onSuccess: (r) => {
      toast.success(`${r.atualizados} registro(s) marcado(s) como lançado.`, {
        description: r.ignorados > 0 ? `${r.ignorados} já estava(m) lançado(s) e foi(ram) ignorado(s).` : undefined,
      });
      clearSelection();
      setConfirmLote(false);
      setConfirmSingle(null);
      queryClient.invalidateQueries({ queryKey: ["painel-rh"] });
    },
    onError: (err: unknown) => {
      toast.error("Não foi possível concluir o lançamento.", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  async function baixar(row: AusenciaRow) {
    if (!row.arquivo_url) {
      toast.info("Este registro não possui anexo.");
      return;
    }
    try {
      const url = await getSignedAtestadoUrl(row.arquivo_url, 120);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Não foi possível abrir o anexo.", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function abrirComunicacao(row: AusenciaRow) {
    navigate({ to: "/comunicacoes", search: { ausencia: row.id } as never });
  }

  function exportar(kind: "csv" | "xlsx") {
    if (!rows.length) {
      toast.info("Nada para exportar com os filtros atuais.");
      return;
    }
    const data = rows.map((r) => {
      const tipoOf = tiposAll.find((t) => t.id === r.tipo_ausencia_id);
      const cat = tipoOf ? categorias.find((c) => c.id === tipoOf.categoria_ausencia_id) : undefined;
      return {
        Colaborador: r.colaborador?.nome_completo ?? "",
        Matricula: r.colaborador?.matricula ?? "",
        Empresa: r.empresa?.nome ?? "",
        Projeto: r.projeto?.nome ?? "",
        Categoria: cat?.nome ?? "",
        TipoOficial: r.tipo_ausencia_nome ?? tipoOf?.nome ?? "",
        TipoBase: TIPO_LABEL[r.tipo],
        DataInicio: r.data_inicio,
        DataFim: r.data_fim,
        Dias: r.dias,
        Status: r.status,
        Supervisor: r.colaborador?.supervisor_nome ?? "",
        Loja: r.loja_codigo_nome ?? "",
        CID: r.cid ?? "",
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Ausencias");
    const filename = `painel-rh-${todayISO()}`;
    if (kind === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `${filename}.csv`);
    } else {
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kpis = kpisQ.data;

  return (
    <AppShell title="Painel do RH" breadcrumb={["Operações", "Painel do RH"]}>
      {/* Header controles */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Fila operacional de ausências. Atualização automática a cada 60s.
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={auto} onCheckedChange={(v) => setAuto(!!v)} />
            Auto-atualizar
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["painel-rh"] })}
            disabled={listQ.isFetching}
          >
            {listQ.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Atualizar agora
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Pendentes" value={kpis?.pendentes} loading={kpisQ.isLoading} tone="amber" />
        <KpiCard label="Lançados hoje" value={kpis?.lancHoje} loading={kpisQ.isLoading} tone="emerald" />
        <KpiCard label="Atestados pendentes" value={kpis?.atestado} loading={kpisQ.isLoading} tone="blue" />
        <KpiCard label="Faltas pendentes" value={kpis?.falta} loading={kpisQ.isLoading} tone="rose" />
        <KpiCard label="Declarações pendentes" value={kpis?.decl} loading={kpisQ.isLoading} tone="violet" />
        <KpiCard label="Suspensões pendentes" value={kpis?.susp} loading={kpisQ.isLoading} tone="slate" />
      </div>

      {/* Filtros */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, matrícula, loja, CID..."
              className="pl-8"
            />
          </div>
          <Select value={empresaF} onValueChange={(v) => { setEmpresaF(v); setProjetoF("all"); }}>
            <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projetoF} onValueChange={setProjetoF}>
            <SelectTrigger><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projetosFiltro.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={supervisorF}
            onChange={(e) => setSupervisorF(e.target.value)}
            placeholder="Supervisor (nome)"
          />
          <Select value={categoriaF} onValueChange={(v) => { setCategoriaF(v); setTipoOficialF("all"); }}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.cor ?? CATEGORIA_CORES[c.codigo] ?? "#94a3b8" }} />
                    {c.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipoOficialF} onValueChange={setTipoOficialF}>
            <SelectTrigger><SelectValue placeholder="Tipo oficial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {tiposFiltro.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={(v) => setStatusF(v as typeof statusF)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
              <SelectItem value="LANCADO">Lançado</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportar("xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportar("csv")}>
                  <FileText className="mr-2 h-4 w-4" /> CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Barra de seleção */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm">
            <span className="font-medium">{selectedIds.length} selecionado(s)</span>
            {podeEditar && (
              <Button size="sm" onClick={() => setConfirmLote(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como Lançado
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => exportar("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="mr-2 h-4 w-4" /> Limpar
            </Button>
          </div>
        )}

        {/* Tabela */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(v) => togglePage(!!v)}
                    aria-label="Selecionar página"
                  />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="min-w-[200px]">Colaborador</TableHead>
                <TableHead className="hidden md:table-cell">Matrícula</TableHead>
                <TableHead className="hidden lg:table-cell">Empresa</TableHead>
                <TableHead className="hidden lg:table-cell">Projeto</TableHead>
                <TableHead className="hidden xl:table-cell">Supervisor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Dias</TableHead>
                <TableHead className="hidden xl:table-cell">Loja</TableHead>
                <TableHead className="hidden xl:table-cell">CID</TableHead>
                <TableHead className="text-center">Anexo</TableHead>
                <TableHead className="hidden 2xl:table-cell">Registrado por</TableHead>
                <TableHead className="w-[170px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={15}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))}
              {!listQ.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={15} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum registro encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const isSel = !!selected[r.id];
                const registrador = r.registrado_por ? profMap.get(r.registrado_por) : null;
                return (
                  <TableRow key={r.id} className={isSel ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={isSel}
                        disabled={r.status !== "PENDENTE"}
                        onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [r.id]: !!v }))}
                        aria-label="Selecionar"
                      />
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {fmtDate(r.data_inicio)}<br />
                      <span className="text-muted-foreground">até {fmtDate(r.data_fim)}</span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="text-left font-medium hover:underline"
                      >
                        {r.colaborador?.nome_completo ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{r.colaborador?.matricula ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{r.empresa?.nome ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{r.projeto?.nome ?? "—"}</TableCell>
                    <TableCell className="hidden xl:table-cell text-xs">{r.colaborador?.supervisor_nome ?? "—"}</TableCell>
                    <TableCell className="text-xs">{TIPO_LABEL[r.tipo]}</TableCell>
                    <TableCell className="text-center">{r.dias}</TableCell>
                    <TableCell className="hidden xl:table-cell text-xs">{r.loja_codigo_nome ?? "—"}</TableCell>
                    <TableCell className="hidden xl:table-cell text-xs font-mono">{r.cid ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      {r.possui_anexo ? (
                        <Button size="icon" variant="ghost" onClick={() => baixar(r)} title="Baixar anexo">
                          <Paperclip className="h-4 w-4 text-primary" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell text-xs">
                      {registrador?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setDetail(r)} title="Visualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {podeEditar && r.status === "PENDENTE" && (
                          <Button size="icon" variant="ghost" asChild title="Editar">
                            <Link to="/nova-ausencia" search={{ id: r.id } as never}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => abrirComunicacao(r)} title="Comunicação">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        {podeEditar && r.status === "PENDENTE" && (
                          <Button size="icon" variant="ghost" onClick={() => setConfirmSingle(r)} title="Marcar como lançado">
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        <div className="flex flex-col gap-2 border-t p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            {total} registro(s) · página {page} de {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Por página:</Label>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Drawer de detalhes */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.colaborador?.nome_completo ?? "Ausência"}</SheetTitle>
                <SheetDescription>
                  {TIPO_LABEL[detail.tipo]} · {fmtDate(detail.data_inicio)} a {fmtDate(detail.data_fim)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <Section title="Colaborador">
                  <Row k="Matrícula" v={detail.colaborador?.matricula ?? "—"} />
                  <Row k="Empresa" v={detail.empresa?.nome ?? "—"} />
                  <Row k="Projeto" v={detail.projeto?.nome ?? "—"} />
                  <Row k="Supervisor" v={detail.colaborador?.supervisor_nome ?? "—"} />
                  <Row k="Telefone" v={detail.colaborador?.telefone ?? "—"} />
                  <Row k="WhatsApp" v={detail.colaborador?.whatsapp ?? "—"} />
                  <Row k="E-mail" v={detail.colaborador?.email ?? "—"} />
                </Section>

                <Section title="Ausência">
                  <Row k="Localidade" v={detail.localidade ?? "—"} />
                  <Row k="Loja" v={detail.loja_codigo_nome ?? "—"} />
                  <Row k="Tipo" v={TIPO_LABEL[detail.tipo]} />
                  <Row k="CID" v={detail.cid ?? "—"} />
                  <Row k="Período" v={`${fmtDate(detail.data_inicio)} a ${fmtDate(detail.data_fim)}`} />
                  <Row k="Dias" v={String(detail.dias)} />
                  <Row k="Acidente trab./trajeto" v={detail.acidente_trabalho_trajeto ? "Sim" : "Não"} />
                  <div>
                    <div className="text-xs text-muted-foreground">Motivo</div>
                    <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm">
                      {detail.motivo ?? "—"}
                    </div>
                  </div>
                  {detail.possui_anexo && (
                    <Button size="sm" variant="outline" onClick={() => baixar(detail)}>
                      <Paperclip className="mr-2 h-4 w-4" /> Baixar anexo
                    </Button>
                  )}
                </Section>

                <Section title="Auditoria">
                  <Row k="Registrado por" v={profMap.get(detail.registrado_por ?? "")?.nome ?? "—"} />
                  <Row k="Registrado em" v={fmtDT(detail.registrado_em)} />
                  <Row k="Lançado por" v={profMap.get(detail.lancado_por ?? "")?.nome ?? "—"} />
                  <Row k="Lançado em" v={fmtDT(detail.lancado_em)} />
                </Section>

                <ComunicacoesDoRegistro ausenciaId={detail.id} />

                <div className="flex flex-wrap gap-2">
                  {podeEditar && detail.status === "PENDENTE" && (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/nova-ausencia" search={{ id: detail.id } as never}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </Link>
                      </Button>
                      <Button size="sm" onClick={() => setConfirmSingle(detail)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como lançado
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => abrirComunicacao(detail)}>
                    <MessageSquare className="mr-2 h-4 w-4" /> Comunicação
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmações */}
      <AlertDialog open={confirmLote} onOpenChange={setConfirmLote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar {selectedIds.length} registro(s) como lançado?</AlertDialogTitle>
            <AlertDialogDescription>
              A operação é registrada em auditoria com usuário, data e hora.
              Registros que já estiverem lançados serão ignorados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => marcarLoteMut.mutate(selectedIds)}
              disabled={marcarLoteMut.isPending}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmSingle} onOpenChange={(o) => !o && setConfirmSingle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar registro como lançado?</AlertDialogTitle>
            <AlertDialogDescription>
              A operação é registrada em auditoria com usuário, data e hora.
              Após lançado, o registro deixa de ser editável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSingle && marcarLoteMut.mutate([confirmSingle.id])}
              disabled={marcarLoteMut.isPending}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

/* ==================== Subcomponentes ==================== */

function KpiCard({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  tone: "amber" | "emerald" | "blue" | "rose" | "violet" | "slate";
}) {
  const tones: Record<string, string> = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    slate: "border-slate-500/30 bg-slate-500/10 text-slate-800 dark:text-slate-200",
  };
  return (
    <Card className={`p-4 ${tones[tone]}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        {loading ? <Skeleton className="h-8 w-16" /> : (value ?? 0)}
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div>{v}</div>
    </div>
  );
}

function ComunicacoesDoRegistro({ ausenciaId }: { ausenciaId: string }) {
  const q = useQuery({
    queryKey: ["painel-rh", "comunicacoes-da-ausencia", ausenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacoes")
        .select("id, tipo, status, assunto, mensagem, destinatario, enviado_em, created_at")
        .eq("ausencia_id", ausenciaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Section title="Comunicações">
      {q.isLoading && <Skeleton className="h-8 w-full" />}
      {!q.isLoading && (q.data?.length ?? 0) === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" /> Nenhuma comunicação registrada.
        </div>
      )}
      <ul className="space-y-1 text-xs">
        {(q.data ?? []).map((c) => (
          <li key={c.id} className="rounded border bg-muted/30 p-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.assunto ?? "(sem assunto)"}</span>
              <Badge variant="secondary" className="text-[10px]">{c.status}</Badge>
            </div>
            <div className="text-muted-foreground">
              {c.tipo} · {c.destinatario} · {fmtDT(c.enviado_em ?? c.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
