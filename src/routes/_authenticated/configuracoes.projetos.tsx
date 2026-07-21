import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Eye,
  Upload,
  Download,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  Archive,
  CheckCircle2,
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
import { usePermissions } from "@/lib/permissions";
import {
  createProjeto,
  updateProjeto,
  setProjetoAtivo,
  getProjetosVinculos,
  deleteProjetosSmart,
  type ProjetoVinculos,
} from "@/lib/projetos.functions";
import { downloadProjetosTemplate } from "@/lib/projetos-template";
import { friendlyRbacError } from "@/lib/rbac/errors";
import { Checkbox } from "@/components/ui/checkbox";


export const Route = createFileRoute("/_authenticated/configuracoes/projetos")({
  head: () => ({ meta: [{ title: "Projetos · Configurações · CRM MK9" }] }),
  component: ProjetosPage,
});

type Empresa = { id: string; nome: string; ativo: boolean };

type Projeto = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  codigo_protocolo: string | null;
  codigo_interno: string | null;
  ativo: boolean;
  created_at: string;
  empresa?: { id: string; nome: string; ativo: boolean } | null;
};

const projetoSchema = z.object({
  empresa_id: z.string().uuid("Selecione uma empresa."),
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do projeto.")
    .max(120, "Máximo de 120 caracteres."),
  descricao: z.string().trim().max(500, "Máximo de 500 caracteres.").optional().or(z.literal("")),
  ativo: z.boolean(),
});

type ProjetoForm = z.infer<typeof projetoSchema>;


const PAGE_SIZE = 10;

function ProjetosPage() {
  const { roles } = useSession();
  const { has, loading: permsLoading } = usePermissions();
  const canManage = roles.includes("super_admin") || roles.includes("rh");
  const canImport = canManage || has("projeto.criar") || has("projeto.editar");
  const canDownloadTemplate = canImport || has("projeto.visualizar");
  const canDelete = roles.includes("super_admin") || has("projeto.excluir");

  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string>("all");
  const [statusFiltro, setStatusFiltro] = useState<"all" | "ativo" | "inativo">("all");
  const [sortBy, setSortBy] = useState<"nome" | "empresa" | "created_at">("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Projeto | null>(null);
  const [viewing, setViewing] = useState<Projeto | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Projeto | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);


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
    queryKey: ["projetos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select(
          "id, empresa_id, nome, descricao, codigo_protocolo, codigo_interno, ativo, created_at, empresa:empresas(id, nome, ativo)",
        );
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });

  const empresas = empresasQ.data ?? [];
  const empresasAtivas = useMemo(() => empresas.filter((e) => e.ativo), [empresas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projetosQ.data ?? [];
    if (q) {
      list = list.filter(
        (p) =>
          p.nome.toLowerCase().includes(q) ||
          (p.descricao ?? "").toLowerCase().includes(q) ||
          (p.empresa?.nome ?? "").toLowerCase().includes(q),
      );
    }
    if (empresaFiltro !== "all") list = list.filter((p) => p.empresa_id === empresaFiltro);
    if (statusFiltro !== "all")
      list = list.filter((p) => (statusFiltro === "ativo" ? p.ativo : !p.ativo));

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * dir;
      if (sortBy === "empresa")
        return (a.empresa?.nome ?? "").localeCompare(b.empresa?.nome ?? "", "pt-BR") * dir;
      return (
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      );
    });
    return list;
  }, [projetosQ.data, search, empresaFiltro, statusFiltro, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const upsertMut = useMutation({
    mutationFn: async (values: ProjetoForm & { id?: string }) => {
      const basePayload = {
        empresa_id: values.empresa_id,
        nome: values.nome.trim(),
        descricao: values.descricao?.trim() ? values.descricao.trim() : null,
        ativo: values.ativo,
      };
      if (values.id) {
        // Ao editar, preservamos o prefixo atual (gerado pelo sistema). Ele
        // nunca é alterado por este formulário — permissão específica pode
        // ser adicionada no futuro.
        await updateProjeto({
          data: {
            id: values.id,
            ...basePayload,
            codigo_protocolo: editing?.codigo_protocolo ?? "",
          },
        });
      } else {
        // Ao criar, o backend gera codigo_interno (PRJ-000001) e codigo_protocolo
        // (prefixo curto) automaticamente via trigger.
        await createProjeto({ data: { ...basePayload, codigo_protocolo: "" } });
      }
    },

    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Projeto atualizado." : "Projeto cadastrado.");
      queryClient.invalidateQueries({ queryKey: ["projetos"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (row: Projeto) => {
      await setProjetoAtivo({ data: { id: row.id, ativo: !row.ativo } });
      return !row.ativo;
    },
    onSuccess: (novoAtivo) => {
      toast.success(novoAtivo ? "Projeto ativado." : "Projeto desativado.");
      queryClient.invalidateQueries({ queryKey: ["projetos"] });
      setConfirmToggle(null);
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
      setConfirmToggle(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: Projeto) {
    setEditing(row);
    setDialogOpen(true);
  }
  function toggleSort(col: "nome" | "empresa" | "created_at") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const selectedCount = selectedIds.size;
  const pageAllSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const pageSomeSelected = pageRows.some((r) => selectedIds.has(r.id));

  function togglePageSelection(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }
  function toggleRowSelection(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (

    <AppShell title="Projetos" breadcrumb={["Configurações", "Projetos"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Projetos vinculados a cada empresa (CNPJ). Projetos não são excluídos —
          apenas desativados quando deixam de operar.
        </p>
        <div className="flex flex-wrap gap-2">
          {permsLoading ? (
            <>
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-9 w-36" />
            </>
          ) : (
            <>
              {canDownloadTemplate && (
                <Button variant="outline" onClick={() => downloadProjetosTemplate()}>
                  <Download className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Baixar modelo</span>
                  <span className="sm:hidden">Modelo</span>
                </Button>
              )}
              {canImport && (
                <Button asChild variant="outline">
                  <Link to="/configuracoes/projetos/importar">
                    <Upload className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Importar / Atualizar planilha</span>
                    <span className="sm:hidden">Importar planilha</span>
                  </Link>
                </Button>
              )}
              {canManage && (
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> Novo projeto
                </Button>
              )}
            </>
          )}
        </div>

      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar por nome..."
                className="pl-8"
              />
            </div>
            <Select
              value={empresaFiltro}
              onValueChange={(v) => {
                setEmpresaFiltro(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-56">
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
              value={statusFiltro}
              onValueChange={(v) => {
                setStatusFiltro(v as "all" | "ativo" | "inativo");
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
            {filtered.length} {filtered.length === 1 ? "projeto" : "projetos"}
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canDelete && (
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        pageAllSelected
                          ? true
                          : pageSomeSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => togglePageSelection(v === true)}
                      aria-label="Selecionar todos da página"
                    />
                  </TableHead>
                )}
                <TableHead className="min-w-[180px]">
                  <button
                    onClick={() => toggleSort("nome")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Projeto <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("empresa")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Empresa <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead title="Código interno gerado automaticamente pelo sistema">Cód. interno</TableHead>
                <TableHead title="Prefixo curto usado nos protocolos dos lançamentos">Prefixo</TableHead>

                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    onClick={() => toggleSort("created_at")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Data cadastro <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="w-[70px] text-right">Ações</TableHead>
              </TableRow>

            </TableHeader>
            <TableBody>
              {projetosQ.isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canDelete ? 9 : 8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {projetosQ.isError && (
                <TableRow>
                  <TableCell colSpan={canDelete ? 9 : 8} className="py-10 text-center text-sm text-destructive">
                    Erro ao carregar projetos: {(projetosQ.error as Error)?.message}
                  </TableCell>
                </TableRow>
              )}

              {!projetosQ.isLoading && !projetosQ.isError && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canDelete ? 9 : 8} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <FolderKanban className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Nenhum projeto encontrado</p>
                      <p className="text-xs text-muted-foreground">
                        Ajuste os filtros ou cadastre um novo projeto.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {pageRows.map((row) => (
                <TableRow key={row.id} data-state={selectedIds.has(row.id) ? "selected" : undefined}>
                  {canDelete && (
                    <TableCell className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(v) => toggleRowSelection(row.id, v === true)}
                        aria-label={`Selecionar ${row.nome}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{row.nome}</TableCell>

                  <TableCell className="text-muted-foreground">
                    {row.empresa?.nome ?? "—"}
                    {row.empresa && !row.empresa.ativo && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        (inativa)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.codigo_interno ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.codigo_interno}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.codigo_protocolo ? (
                      <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-blue-700 dark:text-blue-300">
                        {row.codigo_protocolo}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-[260px] truncate">
                    {row.descricao ?? <span className="italic">—</span>}
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
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString("pt-BR")}
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
                        {canDelete && (
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedIds(new Set([row.id]));
                              setDeleteOpen(true);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
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

      <ProjetoDialog
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{viewing?.nome}</DialogTitle>
            <DialogDescription>Detalhes do projeto</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-muted-foreground">Empresa</dt>
            <dd className="col-span-2">{viewing?.empresa?.nome ?? "—"}</dd>
            <dt className="text-muted-foreground">Código</dt>
            <dd className="col-span-2 font-mono">{viewing?.codigo_protocolo ?? "—"}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="col-span-2">{viewing?.ativo ? "Ativo" : "Inativo"}</dd>
            <dt className="text-muted-foreground">Cadastro</dt>
            <dd className="col-span-2">
              {viewing && new Date(viewing.created_at).toLocaleDateString("pt-BR")}
            </dd>
            <dt className="text-muted-foreground">Descrição</dt>
            <dd className="col-span-2 whitespace-pre-wrap">{viewing?.descricao ?? "—"}</dd>
          </dl>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmToggle}
        onOpenChange={(o) => !o && setConfirmToggle(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.ativo ? "Desativar projeto?" : "Ativar projeto?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.ativo
                ? "O projeto deixará de aparecer em novos lançamentos, mas continuará nos registros históricos."
                : "O projeto voltará a ficar disponível para novos lançamentos. Requer que a empresa esteja ativa."}
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

      {canDelete && (
        <DeleteProjetosDialog
          open={deleteOpen}
          onOpenChange={(o) => {
            setDeleteOpen(o);
          }}
          ids={Array.from(selectedIds)}
          onDone={() => {
            setDeleteOpen(false);
            clearSelection();
            queryClient.invalidateQueries({ queryKey: ["projetos"] });
          }}
        />
      )}

      {canDelete && selectedCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="font-medium">
                {selectedCount} {selectedCount === 1 ? "projeto selecionado" : "projetos selecionados"}
              </span>
              {selectedCount < filtered.length && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={selectAllFiltered}
                >
                  Selecionar todos os {filtered.length} filtrados
                </Button>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>
                <X className="mr-1 h-4 w-4" /> Limpar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Excluir selecionados
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>

  );
}

function ProjetoDialog({
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
  editing: Projeto | null;
  empresasAtivas: Empresa[];
  empresasTodas: Empresa[];
  onSubmit: (values: ProjetoForm) => void;
  submitting: boolean;
}) {
  const form = useForm<ProjetoForm>({
    resolver: zodResolver(projetoSchema),
    values: {
      empresa_id: editing?.empresa_id ?? "",
      nome: editing?.nome ?? "",
      descricao: editing?.descricao ?? "",
      ativo: editing?.ativo ?? true,
    },

  });

  // Ao editar, se a empresa vinculada estiver inativa, ainda deve aparecer no select.
  const empresasSelect = useMemo(() => {
    if (editing?.empresa && !editing.empresa.ativo) {
      const existe = empresasAtivas.find((e) => e.id === editing.empresa_id);
      if (!existe) return [...empresasAtivas, editing.empresa];
    }
    return empresasAtivas;
  }, [empresasAtivas, editing]);

  const semEmpresasAtivas = !editing && empresasAtivas.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Atualize as informações do projeto."
              : "Cadastre um novo projeto vinculado a uma empresa."}
          </DialogDescription>
        </DialogHeader>

        {semEmpresasAtivas ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Não há empresas ativas cadastradas. Ative uma empresa em
            Configurações → Empresas antes de cadastrar projetos.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="empresa_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
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
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do projeto *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: AMBEV AS DIRETA 61" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {editing ? (
                <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Código interno</p>
                      <p className="font-mono text-sm">{editing.codigo_interno ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-muted-foreground">Prefixo de protocolo</p>
                      <p className="font-mono text-sm tracking-wider">{editing.codigo_protocolo ?? "—"}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Códigos gerados automaticamente pelo sistema. Não podem ser alterados por este formulário.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-blue-500/40 bg-blue-500/5 p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    O <span className="font-medium">código interno</span> (ex.:{" "}
                    <span className="font-mono">PRJ-000001</span>) e o{" "}
                    <span className="font-medium">prefixo de protocolo</span> (ex.:{" "}
                    <span className="font-mono">ADM</span>) serão gerados automaticamente
                    após o cadastro.
                  </p>
                </div>
              )}



              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Opcional" {...field} />
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
                        Projetos inativos continuam no histórico, mas não aparecem
                        em novos lançamentos.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
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

function DeleteProjetosDialog({
  open,
  onOpenChange,
  ids,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  onDone: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [motivo, setMotivo] = useState("");

  const vinculosQ = useQuery({
    queryKey: ["projetos", "vinculos", ids.sort().join(",")],
    queryFn: async () => {
      if (ids.length === 0) return { projetos: [] as ProjetoVinculos[] };
      return await getProjetosVinculos({ data: { ids } });
    },
    enabled: open && ids.length > 0,
  });

  const projetos = vinculosQ.data?.projetos ?? [];
  const paraExcluir = projetos.filter((p) => p.pode_excluir);
  const paraArquivar = projetos.filter((p) => !p.pode_excluir);

  const deleteMut = useMutation({
    mutationFn: async () => {
      return await deleteProjetosSmart({
        data: {
          ids,
          confirm: "EXCLUIR",
          motivo: motivo.trim() || undefined,
        },
      });
    },
    onSuccess: (res) => {
      const parts: string[] = [];
      if (res.excluidos > 0) parts.push(`${res.excluidos} excluído(s)`);
      if (res.arquivados > 0) parts.push(`${res.arquivados} arquivado(s)`);
      toast.success(parts.join(" · ") || "Operação concluída.");
      if (res.erros.length > 0) {
        toast.error(`${res.erros.length} erro(s)`, {
          description: res.erros.map((e) => `${e.nome}: ${e.erro}`).join("\n"),
        });
      }
      setConfirmText("");
      setMotivo("");
      onDone();
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
    },
  });

  const canConfirm = confirmText.trim().toUpperCase() === "EXCLUIR" && projetos.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmText("");
          setMotivo("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Excluir {ids.length === 1 ? "projeto" : `${ids.length} projetos`}
          </DialogTitle>
          <DialogDescription>
            Projetos sem vínculos serão <strong>excluídos definitivamente</strong>.
            Projetos com colaboradores ou ausências serão <strong>arquivados</strong>{" "}
            (desativados) para preservar o histórico.
          </DialogDescription>
        </DialogHeader>

        {vinculosQ.isLoading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando vínculos...
          </div>
        )}

        {vinculosQ.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Erro ao carregar vínculos: {(vinculosQ.error as Error)?.message}
          </div>
        )}

        {!vinculosQ.isLoading && !vinculosQ.isError && projetos.length > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <Trash2 className="h-4 w-4" /> Exclusão física
                </div>
                <p className="mt-1 text-2xl font-bold text-destructive">
                  {paraExcluir.length}
                </p>
                <p className="text-xs text-muted-foreground">sem vínculos</p>
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                  <Archive className="h-4 w-4" /> Arquivamento
                </div>
                <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {paraArquivar.length}
                </p>
                <p className="text-xs text-muted-foreground">com vínculos</p>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Colab.</TableHead>
                    <TableHead className="text-right">Ausências</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projetos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.empresa_nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{p.colaboradores}</TableCell>
                      <TableCell className="text-right">{p.ausencias}</TableCell>
                      <TableCell>
                        {p.pode_excluir ? (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 text-destructive"
                          >
                            Excluir
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-700 dark:text-amber-400"
                          >
                            Arquivar
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Motivo (opcional, registrado na auditoria)
              </label>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: encerramento de contrato, projeto duplicado..."
                maxLength={500}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Digite <span className="font-mono font-bold text-destructive">EXCLUIR</span>{" "}
                para confirmar
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMut.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || deleteMut.isPending}
            onClick={() => deleteMut.mutate()}
          >
            {deleteMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" /> Confirmar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

