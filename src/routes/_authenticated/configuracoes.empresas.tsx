import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
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
import { createEmpresa, updateEmpresa, setEmpresaAtiva } from "@/lib/empresas.functions";
import { friendlyRbacError } from "@/lib/rbac/errors";

export const Route = createFileRoute("/_authenticated/configuracoes/empresas")({
  head: () => ({ meta: [{ title: "Empresas · Configurações · CRM MK9" }] }),
  component: EmpresasPage,
});

type Empresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
};

const empresaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da empresa.")
    .max(120, "Máximo de 120 caracteres."),
  cnpj: z.string().trim().max(20, "Máximo de 20 caracteres.").optional().or(z.literal("")),
  descricao: z
    .string()
    .trim()
    .max(500, "Máximo de 500 caracteres.")
    .optional()
    .or(z.literal("")),
  ativo: z.boolean(),
});

type EmpresaForm = z.infer<typeof empresaSchema>;

const PAGE_SIZE = 10;

function EmpresasPage() {
  const { roles } = useSession();
  const canManage = roles.includes("super_admin");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"nome" | "created_at">("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Empresa | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, descricao, ativo, created_at");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = data ?? [];
    if (q) {
      list = list.filter(
        (e) =>
          e.nome.toLowerCase().includes(q) ||
          (e.cnpj ?? "").toLowerCase().includes(q) ||
          (e.descricao ?? "").toLowerCase().includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * dir;
      return (
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
      );
    });
    return list;
  }, [data, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const upsertMut = useMutation({
    mutationFn: async (values: EmpresaForm & { id?: string }) => {
      const payload = {
        nome: values.nome.trim(),
        cnpj: values.cnpj?.trim() ? values.cnpj.trim() : null,
        descricao: values.descricao?.trim() ? values.descricao.trim() : null,
        ativo: values.ativo,
      };
      if (values.id) {
        await updateEmpresa({ data: { id: values.id, ...payload } });
      } else {
        await createEmpresa({ data: payload });
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Empresa atualizada." : "Empresa cadastrada.");
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (row: Empresa) => {
      await setEmpresaAtiva({ data: { id: row.id, ativo: !row.ativo } });
      return !row.ativo;
    },
    onSuccess: (novoAtivo) => {
      toast.success(novoAtivo ? "Empresa ativada." : "Empresa desativada.");
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (err: unknown) => {
      const f = friendlyRbacError(err);
      toast.error(f.title, { description: f.description });
    },
  });

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: Empresa) {
    setEditing(row);
    setDialogOpen(true);
  }
  function toggleSort(col: "nome" | "created_at") {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  return (
    <AppShell
      title="Empresas"
      breadcrumb={["Configurações", "Empresas"]}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          CNPJs utilizados pela MK9. Empresas não são excluídas — apenas
          desativadas quando deixam de operar.
        </p>
        {canManage && (
          <Button onClick={openCreate} className="sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nova empresa
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Pesquisar por nome, CNPJ..."
              className="pl-8"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "empresa" : "empresas"}
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">
                  <button
                    onClick={() => toggleSort("nome")}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Nome <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
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
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {isError && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-destructive">
                    Erro ao carregar empresas: {(error as Error)?.message}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Nenhuma empresa encontrada</p>
                      <p className="text-xs text-muted-foreground">
                        Ajuste a pesquisa ou cadastre uma nova empresa.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.cnpj ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell>
                    {row.ativo ? (
                      <Badge variant="secondary" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        Ativa
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleMut.mutate(row)}
                            disabled={toggleMut.isPending}
                          >
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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

      <EmpresaDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        onSubmit={(values) =>
          upsertMut.mutate({ ...values, id: editing?.id })
        }
        submitting={upsertMut.isPending}
      />
    </AppShell>
  );
}

function EmpresaDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Empresa | null;
  onSubmit: (values: EmpresaForm) => void;
  submitting: boolean;
}) {
  const form = useForm<EmpresaForm>({
    resolver: zodResolver(empresaSchema),
    values: {
      nome: editing?.nome ?? "",
      cnpj: editing?.cnpj ?? "",
      descricao: editing?.descricao ?? "",
      ativo: editing?.ativo ?? true,
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Atualize as informações da empresa."
              : "Cadastre uma nova empresa (CNPJ) utilizada pela MK9."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: R&G" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input placeholder="00.000.000/0000-00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Informações complementares (opcional)"
                      {...field}
                    />
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
                      Empresas inativas continuam nos registros históricos, mas
                      não podem ser selecionadas em novos lançamentos.
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
      </DialogContent>
    </Dialog>
  );
}
