import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useProjetosAtivosPorEmpresa } from "@/hooks/use-projetos";
import { formatCPF, formatTelefone, isValidCPF, onlyDigits } from "@/lib/br-format";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: () => ({ meta: [{ title: "Colaboradores · CRM MK9" }] }),
  component: ColaboradoresPage,
});

type Empresa = { id: string; nome: string; ativo: boolean };
type Projeto = { id: string; nome: string; ativo: boolean; empresa_id: string };

type Colaborador = {
  id: string;
  empresa_id: string;
  projeto_id: string;
  matricula: string;
  nome_completo: string;
  cpf: string | null;
  cargo: string | null;
  telefone: string | null;
  email: string | null;
  data_admissao: string | null;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  empresa?: { id: string; nome: string; ativo: boolean } | null;
  projeto?: { id: string; nome: string; ativo: boolean } | null;
};

const colabSchema = z
  .object({
    empresa_id: z.string().uuid("Selecione uma empresa."),
    projeto_id: z.string().uuid("Selecione um projeto."),
    matricula: z.string().trim().min(1, "Informe a matrícula.").max(50, "Máximo de 50 caracteres."),
    nome_completo: z
      .string()
      .trim()
      .min(2, "Informe o nome completo.")
      .max(150, "Máximo de 150 caracteres."),
    cpf: z.string().optional().or(z.literal("")),
    cargo: z.string().trim().max(80, "Máximo de 80 caracteres.").optional().or(z.literal("")),
    telefone: z.string().optional().or(z.literal("")),
    email: z.string().optional().or(z.literal("")),
    data_admissao: z.string().optional().or(z.literal("")),
    ativo: z.boolean(),
    observacoes: z.string().max(1000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.cpf && data.cpf.trim() !== "") {
      if (!isValidCPF(data.cpf)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cpf"], message: "CPF inválido." });
      }
    }
    if (data.email && data.email.trim() !== "") {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim());
      if (!ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "E-mail inválido." });
      }
    }
    if (data.telefone && data.telefone.trim() !== "") {
      const d = onlyDigits(data.telefone);
      if (d.length < 10 || d.length > 11) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telefone"],
          message: "Telefone deve ter 10 ou 11 dígitos.",
        });
      }
    }
  });

type ColabForm = z.infer<typeof colabSchema>;

const PAGE_SIZE = 10;

function ColaboradoresPage() {
  const { roles } = useSession();
  const canManage = roles.includes("super_admin") || roles.includes("rh");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string>("all");
  const [projetoFiltro, setProjetoFiltro] = useState<string>("all");
  const [statusFiltro, setStatusFiltro] = useState<"all" | "ativo" | "inativo">("all");
  const [sortBy, setSortBy] = useState<"nome" | "matricula" | "empresa" | "data_admissao">("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [viewing, setViewing] = useState<Colaborador | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Colaborador | null>(null);

  const empresasQ = useQuery({
    queryKey: ["empresas", "todas"],
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
    queryKey: ["projetos", "todos-para-filtro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, ativo, empresa_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });

  const colabQ = useQuery({
    queryKey: ["colaboradores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select(
          "id, empresa_id, projeto_id, matricula, nome_completo, cpf, cargo, telefone, email, data_admissao, ativo, observacoes, created_at, updated_at, empresa:empresas(id, nome, ativo), projeto:projetos(id, nome, ativo)",
        );
      if (error) throw error;
      return (data ?? []) as Colaborador[];
    },
  });

  const empresas = empresasQ.data ?? [];
  const projetos = projetosQ.data ?? [];
  const empresasAtivas = useMemo(() => empresas.filter((e) => e.ativo), [empresas]);

  const projetosFiltro = useMemo(() => {
    if (empresaFiltro === "all") return projetos;
    return projetos.filter((p) => p.empresa_id === empresaFiltro);
  }, [projetos, empresaFiltro]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = onlyDigits(search);
    let list = colabQ.data ?? [];
    if (q) {
      list = list.filter((c) => {
        const hay =
          c.nome_completo.toLowerCase() +
          " " +
          c.matricula.toLowerCase() +
          " " +
          (c.cargo ?? "").toLowerCase() +
          " " +
          (c.email ?? "").toLowerCase();
        const cpfMatch = qDigits && c.cpf ? c.cpf.includes(qDigits) : false;
        return hay.includes(q) || cpfMatch;
      });
    }
    if (empresaFiltro !== "all") list = list.filter((c) => c.empresa_id === empresaFiltro);
    if (projetoFiltro !== "all") list = list.filter((c) => c.projeto_id === projetoFiltro);
    if (statusFiltro !== "all")
      list = list.filter((c) => (statusFiltro === "ativo" ? c.ativo : !c.ativo));

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "nome") return a.nome_completo.localeCompare(b.nome_completo, "pt-BR") * dir;
      if (sortBy === "matricula") return a.matricula.localeCompare(b.matricula, "pt-BR") * dir;
      if (sortBy === "empresa")
        return (a.empresa?.nome ?? "").localeCompare(b.empresa?.nome ?? "", "pt-BR") * dir;
      const da = a.data_admissao ? new Date(a.data_admissao).getTime() : 0;
      const db = b.data_admissao ? new Date(b.data_admissao).getTime() : 0;
      return (da - db) * dir;
    });
    return list;
  }, [colabQ.data, search, empresaFiltro, projetoFiltro, statusFiltro, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const upsertMut = useMutation({
    mutationFn: async (values: ColabForm & { id?: string }) => {
      const payload = {
        empresa_id: values.empresa_id,
        projeto_id: values.projeto_id,
        matricula: values.matricula.trim(),
        nome_completo: values.nome_completo.trim(),
        cpf: values.cpf?.trim() ? onlyDigits(values.cpf) : null,
        cargo: values.cargo?.trim() ? values.cargo.trim() : null,
        telefone: values.telefone?.trim() ? onlyDigits(values.telefone) : null,
        email: values.email?.trim() ? values.email.trim().toLowerCase() : null,
        data_admissao: values.data_admissao?.trim() ? values.data_admissao : null,
        ativo: values.ativo,
        observacoes: values.observacoes?.trim() ? values.observacoes.trim() : null,
      };
      if (values.id) {
        const { error } = await supabase.from("colaboradores").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("colaboradores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/colaboradores_empresa_matricula_uidx|duplicate|unique/i.test(msg)) {
        toast.error("Já existe um colaborador com esta matrícula nesta empresa.");
      } else if (/não pertence à empresa/i.test(msg)) {
        toast.error("O projeto selecionado não pertence à empresa informada.");
      } else if (/empresa está inativa|empresa inativa/i.test(msg)) {
        toast.error("A empresa está inativa. Ative a empresa antes de manter o colaborador ativo.");
      } else if (/projeto está inativo|projeto inativo/i.test(msg)) {
        toast.error("O projeto está inativo. Ative o projeto antes de manter o colaborador ativo.");
      } else {
        toast.error("Não foi possível salvar o colaborador.", { description: msg });
      }
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (row: Colaborador) => {
      const { error } = await supabase
        .from("colaboradores")
        .update({ ativo: !row.ativo })
        .eq("id", row.id);
      if (error) throw error;
      return !row.ativo;
    },
    onSuccess: (novoAtivo) => {
      toast.success(novoAtivo ? "Colaborador ativado." : "Colaborador desativado.");
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
      setConfirmToggle(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/empresa está inativa|empresa inativa/i.test(msg)) {
        toast.error("Não é possível ativar: a empresa está inativa.");
      } else if (/projeto está inativo|projeto inativo/i.test(msg)) {
        toast.error("Não é possível ativar: o projeto está inativo.");
      } else {
        toast.error("Não foi possível alterar o status.", { description: msg });
      }
      setConfirmToggle(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: Colaborador) {
    setEditing(row);
    setDialogOpen(true);
  }
  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  return (
    <AppShell title="Colaboradores" breadcrumb={["Operação", "Colaboradores"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Pessoas vinculadas às empresas e projetos operacionais. Colaboradores não
          são excluídos — apenas desativados quando deixam a operação.
        </p>
        {canManage && (
          <Button onClick={openCreate} className="sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Novo colaborador
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Nome, matrícula, CPF, cargo ou e-mail..."
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
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                    {!e.ativo && " (inativa)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={projetoFiltro}
              onValueChange={(v) => {
                setProjetoFiltro(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {projetosFiltro.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {!p.ativo && " (inativo)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFiltro}
              onValueChange={(v) => {
                setStatusFiltro(v as typeof statusFiltro);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "colaborador" : "colaboradores"}
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">
                  <button
                    onClick={() => toggleSort("nome")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Colaborador <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("matricula")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Matrícula <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    onClick={() => toggleSort("empresa")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Empresa <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Projeto</TableHead>
                <TableHead className="hidden xl:table-cell">Cargo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    onClick={() => toggleSort("data_admissao")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Admissão <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="w-[70px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colabQ.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {colabQ.isError && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-destructive">
                    Erro ao carregar colaboradores: {(colabQ.error as Error)?.message}
                  </TableCell>
                </TableRow>
              )}

              {!colabQ.isLoading && !colabQ.isError && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Nenhum colaborador encontrado</p>
                      <p className="text-xs text-muted-foreground">
                        Ajuste os filtros ou cadastre um novo colaborador.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.nome_completo}</span>
                      {row.email && (
                        <span className="text-xs text-muted-foreground">{row.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.matricula}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {row.empresa?.nome ?? "—"}
                    {row.empresa && !row.empresa.ativo && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        (inativa)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {row.projeto?.nome ?? "—"}
                    {row.projeto && !row.projeto.ativo && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        (inativo)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-muted-foreground">
                    {row.cargo ?? "—"}
                  </TableCell>
                  <TableCell>
                    {row.ativo ? (
                      <Badge
                        variant="secondary"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {row.data_admissao
                      ? new Date(row.data_admissao + "T00:00:00").toLocaleDateString("pt-BR")
                      : "—"}
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
                        {canManage && (
                          <>
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConfirmToggle(row)}>
                              {row.ativo ? (
                                <>
                                  <PowerOff className="mr-2 h-4 w-4" /> Desativar
                                </>
                              ) : (
                                <>
                                  <Power className="mr-2 h-4 w-4" /> Ativar
                                </>
                              )}
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

      <ColaboradorDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        empresasAtivas={empresasAtivas}
        empresasTodas={empresas}
        onSubmit={(values) => upsertMut.mutate({ ...values, id: editing?.id })}
        submitting={upsertMut.isPending}
      />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.nome_completo}</DialogTitle>
            <DialogDescription>Detalhes do colaborador</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Vínculo operacional
                </h4>
                <dl className="grid grid-cols-3 gap-2">
                  <dt className="text-muted-foreground">Empresa</dt>
                  <dd className="col-span-2">
                    {viewing.empresa?.nome ?? "—"}
                    {viewing.empresa && !viewing.empresa.ativo && " (inativa)"}
                  </dd>
                  <dt className="text-muted-foreground">Projeto</dt>
                  <dd className="col-span-2">
                    {viewing.projeto?.nome ?? "—"}
                    {viewing.projeto && !viewing.projeto.ativo && " (inativo)"}
                  </dd>
                  <dt className="text-muted-foreground">Matrícula</dt>
                  <dd className="col-span-2 font-mono">{viewing.matricula}</dd>
                  <dt className="text-muted-foreground">Cargo</dt>
                  <dd className="col-span-2">{viewing.cargo ?? "—"}</dd>
                  <dt className="text-muted-foreground">Admissão</dt>
                  <dd className="col-span-2">
                    {viewing.data_admissao
                      ? new Date(viewing.data_admissao + "T00:00:00").toLocaleDateString("pt-BR")
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="col-span-2">{viewing.ativo ? "Ativo" : "Inativo"}</dd>
                </dl>
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dados pessoais e contato
                </h4>
                <dl className="grid grid-cols-3 gap-2">
                  <dt className="text-muted-foreground">CPF</dt>
                  <dd className="col-span-2">{viewing.cpf ? formatCPF(viewing.cpf) : "—"}</dd>
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd className="col-span-2">
                    {viewing.telefone ? formatTelefone(viewing.telefone) : "—"}
                  </dd>
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="col-span-2 break-all">{viewing.email ?? "—"}</dd>
                </dl>
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Observações
                </h4>
                <p className="whitespace-pre-wrap">{viewing.observacoes ?? "—"}</p>
              </section>
              <section className="text-xs text-muted-foreground">
                Cadastrado em {new Date(viewing.created_at).toLocaleString("pt-BR")} · Atualizado em{" "}
                {new Date(viewing.updated_at).toLocaleString("pt-BR")}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmToggle} onOpenChange={(o) => !o && setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.ativo ? "Desativar colaborador?" : "Ativar colaborador?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.ativo
                ? "O colaborador deixará de aparecer em novos lançamentos, mas continuará nos registros históricos."
                : "O colaborador voltará a ficar disponível. Requer que a empresa e o projeto estejam ativos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmToggle) toggleMut.mutate(confirmToggle);
              }}
              disabled={toggleMut.isPending}
            >
              {toggleMut.isPending ? "Aplicando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ColaboradorDialog({
  open,
  onOpenChange,
  editing,
  empresasAtivas,
  empresasTodas,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Colaborador | null;
  empresasAtivas: Empresa[];
  empresasTodas: Empresa[];
  onSubmit: (values: ColabForm) => void;
  submitting: boolean;
}) {
  const form = useForm<ColabForm>({
    resolver: zodResolver(colabSchema),
    values: {
      empresa_id: editing?.empresa_id ?? "",
      projeto_id: editing?.projeto_id ?? "",
      matricula: editing?.matricula ?? "",
      nome_completo: editing?.nome_completo ?? "",
      cpf: editing?.cpf ? formatCPF(editing.cpf) : "",
      cargo: editing?.cargo ?? "",
      telefone: editing?.telefone ? formatTelefone(editing.telefone) : "",
      email: editing?.email ?? "",
      data_admissao: editing?.data_admissao ?? "",
      ativo: editing?.ativo ?? true,
      observacoes: editing?.observacoes ?? "",
    },
  });

  const empresaId = form.watch("empresa_id");
  const projetosQ = useProjetosAtivosPorEmpresa(empresaId || null);

  // Empresa select: ao editar com empresa inativa, ainda deve aparecer
  const empresasSelect = useMemo(() => {
    if (editing?.empresa && !editing.empresa.ativo) {
      const existe = empresasAtivas.find((e) => e.id === editing.empresa_id);
      if (!existe) return [...empresasAtivas, editing.empresa];
    }
    return empresasAtivas;
  }, [empresasAtivas, editing]);

  // Projeto select: ao editar, garantir que o projeto vinculado apareça mesmo inativo
  const projetosSelect = useMemo(() => {
    const ativos = projetosQ.data ?? [];
    if (
      editing?.projeto &&
      editing.empresa_id === empresaId &&
      !ativos.find((p) => p.id === editing.projeto_id)
    ) {
      return [...ativos, { id: editing.projeto_id, nome: editing.projeto.nome }];
    }
    return ativos;
  }, [projetosQ.data, editing, empresaId]);

  const semEmpresasAtivas = !editing && empresasAtivas.length === 0;

  function handleEmpresaChange(value: string, field: { onChange: (v: string) => void }) {
    field.onChange(value);
    // Ao trocar empresa, limpar projeto (exceto se for a mesma da edição)
    if (!editing || value !== editing.empresa_id) {
      form.setValue("projeto_id", "");
    } else {
      form.setValue("projeto_id", editing.projeto_id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Atualize as informações do colaborador."
              : "Cadastre um colaborador vinculando-o a uma empresa e projeto."}
          </DialogDescription>
        </DialogHeader>

        {semEmpresasAtivas ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Não há empresas ativas cadastradas. Ative uma empresa em Configurações →
            Empresas antes de cadastrar colaboradores.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="empresa_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => handleEmpresaChange(v, field)}
                        disabled={!!editing && empresasTodas.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma empresa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {empresasSelect.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                              {!e.ativo && " (inativa)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="projeto_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Projeto *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!empresaId || projetosQ.isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !empresaId
                                  ? "Selecione uma empresa primeiro"
                                  : projetosQ.isLoading
                                    ? "Carregando..."
                                    : projetosSelect.length === 0
                                      ? "Nenhum projeto ativo"
                                      : "Selecione um projeto"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {projetosSelect.map((p) => {
                            const inativo =
                              editing &&
                              p.id === editing.projeto_id &&
                              editing.projeto &&
                              !editing.projeto.ativo;
                            return (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                                {inativo && " (inativo)"}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="matricula"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matrícula *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex.: 12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nome_completo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do colaborador" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="000.000.000-00"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatCPF(e.target.value))}
                          inputMode="numeric"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cargo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex.: Promotor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(00) 00000-0000"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatTelefone(e.target.value))}
                          inputMode="tel"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="nome@exemplo.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="data_admissao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de admissão</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label>Status ativo</Label>
                        <FormDescription>
                          Requer empresa e projeto ativos.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Opcional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
