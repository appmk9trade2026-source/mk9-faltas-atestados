import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronLeft,
  ChevronRight,
  History as HistoryIcon,
  Info,
  KeyRound,
  LogOut,
  MailPlus,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserCog,
} from "lucide-react";

import { toast } from "sonner";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { supabase } from "@/integrations/supabase/client";
import { useSession, type AppRole } from "@/hooks/use-session";
import {
  createUsuario,
  updateUsuario,
  toggleUsuarioAtivo,
  resetUsuarioSenha,
  reenviarConviteUsuario,
  encerrarSessoesUsuario,
  reenviarBoasVindasWhatsapp,
  reprocessarConviteWhatsapp,
  listarStatusBoasVindas,
  redefinirSenhaPadraoUsuario,
  type BoasVindasStatus,
} from "@/lib/usuarios.functions";

import { SenhaTemporariaDialog } from "@/components/usuarios/senha-temporaria-dialog";
import { ExcluirUsuarioDialog } from "@/components/usuarios/excluir-usuario-dialog";


export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários · CRM MK9" }] }),
  component: UsuariosPage,
});

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "rh", label: "RH" },
  { value: "supervisor", label: "Supervisor" },
  { value: "compliance", label: "Compliance" },
  { value: "operacao", label: "Operação" },
  { value: "visualizador", label: "Visualizador" },
];
const roleLabel = (r: AppRole) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

const PAGE_SIZE = 25;

type UsuarioRow = {
  id: string;
  nome: string;
  email: string;
  telefone_whatsapp: string | null;
  cargo: string | null;
  avatar_url: string | null;
  ativo: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  roles: AppRole[];
  empresa_ids: string[];
  empresa_nomes: string[];
  projeto_ids: string[];
  projeto_nomes: string[];
  total_count: number;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type AcessoBadge = { label: string; className: string; when?: string | null };
function computeAcessoBadge(u: UsuarioRow): AcessoBadge {
  const bannedActive =
    !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
  if (!u.ativo || bannedActive) {
    return { label: "Conta bloqueada", className: "bg-rose-500/15 text-rose-700 border-rose-500/30" };
  }
  const invitePending = !!u.invited_at && !u.email_confirmed_at && !u.last_sign_in_at;
  if (invitePending) {
    return { label: "Convite pendente", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", when: u.invited_at };
  }
  if (!u.last_sign_in_at) {
    return { label: "Nunca acessou", className: "bg-muted text-muted-foreground border-border" };
  }
  return { label: fmtDate(u.last_sign_in_at), className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", when: u.last_sign_in_at };
}

// -------------------- Schemas --------------------
const rolesEnum = z.enum(["super_admin", "rh", "supervisor", "compliance", "operacao", "visualizador"]);
const createFormSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  nome: z.string().trim().min(2, "Nome obrigatório"),
  telefone: z.string().trim().optional(),
  cargo: z.string().trim().optional(),
  avatar_url: z.string().trim().url().optional().or(z.literal("")),
  enviar_whatsapp: z.boolean(),
  ativo: z.boolean(),
  roles: z.array(rolesEnum).min(1, "Selecione ao menos um perfil"),
  empresa_ids: z.array(z.string().uuid()),
  projeto_ids: z.array(z.string().uuid()),
});
type CreateForm = z.infer<typeof createFormSchema>;


const editFormSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2),
  telefone: z.string().trim().optional(),
  cargo: z.string().trim().optional(),
  avatar_url: z.string().trim().url().optional().or(z.literal("")),
  roles: z.array(rolesEnum).min(1, "Selecione ao menos um perfil"),
  empresa_ids: z.array(z.string().uuid()),
  projeto_ids: z.array(z.string().uuid()),
});
type EditForm = z.infer<typeof editFormSchema>;

// -------------------- Page --------------------
function UsuariosPage() {
  const { user, roles } = useSession();
  const qc = useQueryClient();
  const canWrite = roles.includes("super_admin");

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterProjeto, setFilterProjeto] = useState<string>("all");
  const [filterAtivo, setFilterAtivo] = useState<string>("all");
  const [page, setPage] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UsuarioRow | null>(null);
  const [historyFor, setHistoryFor] = useState<UsuarioRow | null>(null);

  const empresasQ = useQuery({
    queryKey: ["empresas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("id, nome, ativo").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const projetosQ = useQuery({
    queryKey: ["projetos-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, empresa_id, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const listQ = useQuery({
    queryKey: ["usuarios", { search, filterRole, filterEmpresa, filterProjeto, filterAtivo, page }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users", {
        _search: search || undefined,
        _role: filterRole === "all" ? undefined : (filterRole as AppRole),
        _empresa_id: filterEmpresa === "all" ? undefined : filterEmpresa,
        _projeto_id: filterProjeto === "all" ? undefined : filterProjeto,
        _ativo: filterAtivo === "all" ? undefined : filterAtivo === "1",
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as unknown as UsuarioRow[];
    },
  });

  const total = listQ.data?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  const createFn = useServerFn(createUsuario);
  const updateFn = useServerFn(updateUsuario);
  const toggleFn = useServerFn(toggleUsuarioAtivo);
  const resetFn = useServerFn(resetUsuarioSenha);
  const reenviarFn = useServerFn(reenviarConviteUsuario);
  const encerrarSessoesFn = useServerFn(encerrarSessoesUsuario);
  const reenviarWaFn = useServerFn(reenviarBoasVindasWhatsapp);
  const reprocessarWaFn = useServerFn(reprocessarConviteWhatsapp);
  const listarStatusWaFn = useServerFn(listarStatusBoasVindas);

  const [confirmDeactivate, setConfirmDeactivate] = useState<UsuarioRow | null>(null);
  const [confirmEncerrarSessoes, setConfirmEncerrarSessoes] = useState<UsuarioRow | null>(null);
  const [senhaTempAlvo, setSenhaTempAlvo] = useState<UsuarioRow | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<UsuarioRow | null>(null);
  const [waDetalhesFor, setWaDetalhesFor] = useState<{ usuario: UsuarioRow; status: BoasVindasStatus | null } | null>(null);
  const isSuperAdmin = roles.includes("super_admin");

  const canResendWhatsapp = roles.includes("super_admin");
  const canSeeWhatsapp = roles.includes("super_admin") || roles.includes("rh") || roles.includes("compliance");


  const userIdsList = useMemo(() => (listQ.data ?? []).map((u) => u.id), [listQ.data]);
  const statusWaQ = useQuery({
    queryKey: ["usuarios-whatsapp-status", userIdsList.join(",")],
    enabled: canSeeWhatsapp && userIdsList.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await listarStatusWaFn({ data: { user_ids: userIdsList } });
      const map = new Map<string, BoasVindasStatus>();
      for (const it of r.itens ?? []) map.set(it.user_id, it);
      return map;
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (v: { id: string; ativo: boolean }) => toggleFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.ativo ? "Usuário reativado." : "Usuário desativado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resetMut = useMutation({
    mutationFn: async (id: string) => resetFn({ data: { id } }),
    onSuccess: () => toast.success("Link de redefinição enviado."),
    onError: (e: Error) => toast.error(e.message),
  });
  const reenviarMut = useMutation({
    mutationFn: async (id: string) => reenviarFn({ data: { id } }),
    onSuccess: () => toast.success("Convite reenviado."),
    onError: (e: Error) => toast.error(e.message),
  });
  const reenviarWaMut = useMutation({
    mutationFn: async (id: string) => reenviarWaFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Convite enfileirado para envio.");
      qc.invalidateQueries({ queryKey: ["usuarios-whatsapp-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reprocessarWaMut = useMutation({
    mutationFn: async (id: string) => reprocessarWaFn({ data: { id } }),
    onSuccess: (r: { acao?: string }) => {
      const msgs: Record<string, string> = {
        materializado: "Novo convite enfileirado.",
        reenfileirado: "Convite reenfileirado após falha.",
        antecipado: "Próxima tentativa antecipada.",
      };
      toast.success(msgs[r?.acao ?? ""] ?? "Reprocessamento solicitado.");
      qc.invalidateQueries({ queryKey: ["usuarios-whatsapp-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const encerrarSessoesMut = useMutation({
    mutationFn: async (v: { id: string }) => encerrarSessoesFn({ data: { id: v.id, manter_atual: true } }),
    onSuccess: () => { toast.success("Sessões encerradas."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <AppShell title="Usuários" breadcrumb={["Configurações", "Usuários"]}>
      <Card className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Gestão de usuários</h2>
              <p className="text-xs text-muted-foreground">
                {canWrite ? "Cadastre, edite, ative/desative e envie reset de senha." : "Consulta somente leitura."}
              </p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Novo usuário
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por nome ou e-mail"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <Select value={filterRole} onValueChange={(v) => { setFilterRole(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterEmpresa} onValueChange={(v) => { setFilterEmpresa(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {(empresasQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProjeto} onValueChange={(v) => { setFilterProjeto(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {(projetosQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAtivo} onValueChange={(v) => { setFilterAtivo(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="1">Ativos</SelectItem>
              <SelectItem value="0">Desativados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Usuário</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Empresas / Projetos</TableHead>
                <TableHead>Perfis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último acesso</TableHead>
                {canSeeWhatsapp && <TableHead>Convite</TableHead>}
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.isLoading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={canSeeWhatsapp ? 8 : 7}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ))}
              {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={canSeeWhatsapp ? 8 : 7} className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell></TableRow>
              )}

              {(listQ.data ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.nome} />}
                        <AvatarFallback>{initials(u.nome)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.nome}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.cargo || "—"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm truncate max-w-[220px]">{u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.telefone_whatsapp || "—"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {u.empresa_nomes.length === 0 && <span className="text-xs text-muted-foreground">Sem empresas</span>}
                      {u.empresa_nomes.slice(0, 3).map((n, i) => (
                        <Badge key={`e-${i}`} variant="secondary" className="text-[10px]">{n}</Badge>
                      ))}
                      {u.empresa_nomes.length > 3 && <Badge variant="outline" className="text-[10px]">+{u.empresa_nomes.length - 3}</Badge>}
                    </div>
                    {u.projeto_nomes.length > 0 && (
                      <div className="mt-1 text-[10px] text-muted-foreground truncate max-w-[260px]">
                        {u.projeto_nomes.slice(0, 4).join(" · ")}
                        {u.projeto_nomes.length > 4 ? ` +${u.projeto_nomes.length - 4}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <Badge variant="outline" className="text-[10px]">sem papel</Badge>}
                      {u.roles.map((r) => (
                        <Badge key={r} variant={r === "super_admin" ? "default" : "secondary"} className="text-[10px]">
                          {roleLabel(r)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.ativo ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Desativado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {(() => {
                      const b = computeAcessoBadge(u);
                      return (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={`text-[10px] ${b.className}`}>{b.label}</Badge>
                          {b.when && b.label !== fmtDate(b.when) && (
                            <span className="text-[10px] text-muted-foreground">{fmtDate(b.when)}</span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  {canSeeWhatsapp && (
                    <TableCell className="whitespace-nowrap">
                      <WhatsappStatusCell
                        status={statusWaQ.data?.get(u.id) ?? null}
                        onOpenDetails={
                          isSuperAdmin
                            ? () => setWaDetalhesFor({ usuario: u, status: statusWaQ.data?.get(u.id) ?? null })
                            : undefined
                        }
                      />
                    </TableCell>
                  )}

                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setHistoryFor(u)}>
                          <HistoryIcon className="mr-2 h-4 w-4" /> Histórico e sessões
                        </DropdownMenuItem>
                        {canWrite && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setEditing(u)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => resetMut.mutate(u.id)}
                              disabled={!u.email}
                            >
                              <KeyRound className="mr-2 h-4 w-4" /> Enviar reset de senha
                            </DropdownMenuItem>
                            {isSuperAdmin && (
                              <DropdownMenuItem
                                onClick={() => setSenhaTempAlvo(u)}
                                disabled={u.id === user?.id}
                              >
                                <KeyRound className="mr-2 h-4 w-4" /> Definir nova senha temporária
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => reenviarMut.mutate(u.id)}
                              disabled={!u.email || !u.ativo}
                            >
                              <MailPlus className="mr-2 h-4 w-4" /> Reenviar convite
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setConfirmEncerrarSessoes(u)}>
                              <LogOut className="mr-2 h-4 w-4" /> Encerrar sessões
                            </DropdownMenuItem>
                          </>
                        )}
                        {canResendWhatsapp && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => reenviarWaMut.mutate(u.id)}
                              disabled={!u.telefone_whatsapp || !u.ativo || reenviarWaMut.isPending}
                            >
                              <Send className="mr-2 h-4 w-4" /> Reenviar WhatsApp de boas-vindas
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => reprocessarWaMut.mutate(u.id)}
                              disabled={!u.telefone_whatsapp || !u.ativo || reprocessarWaMut.isPending}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" /> Tentar envio novamente
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setWaDetalhesFor({ usuario: u, status: statusWaQ.data?.get(u.id) ?? null })}
                            >
                              <Info className="mr-2 h-4 w-4" /> Detalhes do envio
                            </DropdownMenuItem>
                          </>
                        )}
                        {canWrite && (
                          <>

                            <DropdownMenuSeparator />
                            {u.ativo ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={u.id === user?.id}
                                onClick={() => setConfirmDeactivate(u)}
                              >
                                <PowerOff className="mr-2 h-4 w-4" /> Desativar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => toggleMut.mutate({ id: u.id, ativo: true })}>
                                <Power className="mr-2 h-4 w-4" /> Ativar
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {isSuperAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={u.id === user?.id}
                              onClick={() => setExcluirAlvo(u)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir definitivamente
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

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>{Number(total).toLocaleString("pt-BR")} usuário(s) · página {page + 1} de {totalPages}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {createOpen && (
        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          empresas={empresasQ.data ?? []}
          projetos={projetosQ.data ?? []}
          onSubmit={async (values) => {
            await createFn({
              data: {
                ...values,
                telefone: values.telefone || null,
                cargo: values.cargo || null,
                avatar_url: values.avatar_url || null,
                senha_temporaria: null,
                enviar_convite: false,
              },
            });
            toast.success('Usuário criado com a senha temporária padrão "12345678".');
            setCreateOpen(false);
            invalidate();
          }}
        />
      )}


      {editing && (
        <EditDialog
          usuario={editing}
          onClose={() => setEditing(null)}
          empresas={empresasQ.data ?? []}
          projetos={projetosQ.data ?? []}
          onSubmit={async (values) => {
            await updateFn({
              data: {
                ...values,
                telefone: values.telefone || null,
                cargo: values.cargo || null,
                avatar_url: values.avatar_url || null,
              },
            });
            toast.success("Usuário atualizado.");
            setEditing(null);
            invalidate();
          }}
        />
      )}

      <HistoryDrawer usuario={historyFor} onClose={() => setHistoryFor(null)} />

      <AlertDialog open={!!confirmDeactivate} onOpenChange={(o) => !o && setConfirmDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.nome} perderá acesso imediatamente. A conta poderá ser reativada depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeactivate) toggleMut.mutate({ id: confirmDeactivate.id, ativo: false });
                setConfirmDeactivate(null);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmEncerrarSessoes} onOpenChange={(o) => !o && setConfirmEncerrarSessoes(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar todas as sessões?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as sessões ativas de {confirmEncerrarSessoes?.nome} serão encerradas
              {confirmEncerrarSessoes?.id === user?.id ? ", exceto a sua sessão atual." : "."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmEncerrarSessoes) encerrarSessoesMut.mutate({ id: confirmEncerrarSessoes.id });
                setConfirmEncerrarSessoes(null);
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SenhaTemporariaDialog
        alvo={senhaTempAlvo ? { id: senhaTempAlvo.id, nome: senhaTempAlvo.nome, email: senhaTempAlvo.email } : null}
        onClose={() => setSenhaTempAlvo(null)}
      />
      <ExcluirUsuarioDialog
        alvo={
          excluirAlvo
            ? {
                id: excluirAlvo.id,
                nome: excluirAlvo.nome,
                email: excluirAlvo.email,
                roles: excluirAlvo.roles,
                empresa_nomes: excluirAlvo.empresa_nomes,
                projeto_nomes: excluirAlvo.projeto_nomes,
              }
            : null
        }
        onClose={() => setExcluirAlvo(null)}
      />
      <WhatsappDetalhesDialog
        alvo={waDetalhesFor}
        onClose={() => setWaDetalhesFor(null)}
        onReprocessar={() => {
          if (waDetalhesFor) reprocessarWaMut.mutate(waDetalhesFor.usuario.id);
        }}
        reprocessando={reprocessarWaMut.isPending}
      />
    </AppShell>
  );
}

// -------------------- Create Dialog --------------------
function CreateDialog({
  open,
  onOpenChange,
  empresas,
  projetos,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresas: { id: string; nome: string; ativo: boolean }[];
  projetos: { id: string; nome: string; empresa_id: string; ativo: boolean }[];
  onSubmit: (v: CreateForm) => Promise<void>;
}) {
  const form = useForm<CreateForm>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      email: "",
      nome: "",
      telefone: "",
      cargo: "",
      avatar_url: "",
      enviar_whatsapp: false,
      ativo: true,
      roles: [],
      empresa_ids: [],
      projeto_ids: [],
    },
  });

  const [submitting, setSubmitting] = useState(false);
  const selectedEmpresas = form.watch("empresa_ids");
  const availableProjetos = useMemo(
    () => projetos.filter((p) => p.ativo && selectedEmpresas.includes(p.empresa_id)),
    [projetos, selectedEmpresas],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Cadastro completo com perfis, empresas e projetos.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              setSubmitting(true);
              try { await onSubmit(v); } catch (e) { toast.error((e as Error).message); }
              finally { setSubmitting(false); }
            })}
            className="space-y-4"
          >
            <FormSectionsCreate
              form={form}
              empresas={empresas.filter((e) => e.ativo)}
              availableProjetos={availableProjetos}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Criar usuário"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function FormSectionsCreate({
  form, empresas, availableProjetos,
}: {
  form: ReturnType<typeof useForm<CreateForm>>;
  empresas: { id: string; nome: string }[];
  availableProjetos: { id: string; nome: string }[];
}) {
  return (
    <>
      <div>
        <h3 className="text-sm font-semibold mb-2">Dados pessoais</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <FormField control={form.control} name="nome" render={({ field }) => (
            <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="telefone" render={({ field }) => (
            <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="cargo" render={({ field }) => (
            <FormItem><FormLabel>Cargo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="avatar_url" render={({ field }) => (
            <FormItem className="md:col-span-2"><FormLabel>Avatar (URL)</FormLabel><FormControl><Input placeholder="https://…" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      </div>

      <Separator />
      <div>
        <h3 className="text-sm font-semibold mb-2">Acesso</h3>
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs mb-3">
          <p className="font-medium text-foreground">Senha temporária padrão do CRM: <code className="font-mono">12345678</code></p>
          <p className="text-muted-foreground mt-1">
            Todo novo usuário é criado com esta senha e será obrigado a defini-la no primeiro login.
            Nenhum convite por e-mail é enviado — repasse a senha por um canal seguro.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-3">
            <FormField control={form.control} name="enviar_whatsapp" render={({ field }) => {

              const tel = (form.watch("telefone") ?? "").toString();
              const digits = tel.replace(/\D+/g, "");
              const telValido = digits.length >= 10 && digits.length <= 15;
              return (
                <FormItem className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Enviar convite por WhatsApp</Label>
                    <FormControl>
                      <Switch
                        checked={field.value && telValido}
                        disabled={!telValido}
                        onCheckedChange={(v) => field.onChange(v && telValido)}
                      />
                    </FormControl>
                  </div>
                  {!telValido && (
                    <p className="text-[11px] text-muted-foreground">
                      Informe um telefone válido (formato E.164, 10–15 dígitos) para habilitar o envio por WhatsApp.
                    </p>
                  )}
                </FormItem>
              );
            }} />
            <FormField control={form.control} name="ativo" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3">
                <div><Label>Ativo</Label></div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
          </div>

        </div>
      </div>

      <Separator />
      <MultiSelectSection
        title="Perfis"
        options={ROLE_OPTIONS.map((r) => ({ id: r.value, label: r.label }))}
        selected={form.watch("roles")}
        onChange={(v) => form.setValue("roles", v as AppRole[], { shouldValidate: true })}
      />
      <MultiSelectSection
        title="Empresas"
        options={empresas.map((e) => ({ id: e.id, label: e.nome }))}
        selected={form.watch("empresa_ids")}
        onChange={(v) => {
          form.setValue("empresa_ids", v);
          // remove projetos de empresas que sumiram
          const validProj = form.getValues("projeto_ids").filter((pid) =>
            availableProjetos.some((p) => p.id === pid) || v.length === 0
          );
          form.setValue("projeto_ids", validProj);
        }}
      />
      <MultiSelectSection
        title="Projetos (dependem das empresas)"
        options={availableProjetos.map((p) => ({ id: p.id, label: p.nome }))}
        selected={form.watch("projeto_ids")}
        onChange={(v) => form.setValue("projeto_ids", v)}
        emptyLabel="Selecione empresas para liberar projetos."
      />
    </>
  );
}

// -------------------- Edit Dialog --------------------
function EditDialog({
  usuario,
  onClose,
  empresas,
  projetos,
  onSubmit,
}: {
  usuario: UsuarioRow;
  onClose: () => void;
  empresas: { id: string; nome: string; ativo: boolean }[];
  projetos: { id: string; nome: string; empresa_id: string; ativo: boolean }[];
  onSubmit: (v: EditForm) => Promise<void>;
}) {
  const form = useForm<EditForm>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      id: usuario.id,
      nome: usuario.nome,
      telefone: usuario.telefone_whatsapp ?? "",
      cargo: usuario.cargo ?? "",
      avatar_url: usuario.avatar_url ?? "",
      roles: usuario.roles,
      empresa_ids: usuario.empresa_ids,
      projeto_ids: usuario.projeto_ids,
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const selectedEmpresas = form.watch("empresa_ids");
  const availableProjetos = useMemo(
    () => projetos.filter((p) => p.ativo && selectedEmpresas.includes(p.empresa_id)),
    [projetos, selectedEmpresas],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>{usuario.email}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              setSubmitting(true);
              try { await onSubmit(v); } catch (e) { toast.error((e as Error).message); }
              finally { setSubmitting(false); }
            })}
            className="space-y-4"
          >
            <div className="grid md:grid-cols-2 gap-3">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="cargo" render={({ field }) => (
                <FormItem><FormLabel>Cargo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="avatar_url" render={({ field }) => (
                <FormItem><FormLabel>Avatar (URL)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <Separator />
            <MultiSelectSection
              title="Perfis"
              options={ROLE_OPTIONS.map((r) => ({ id: r.value, label: r.label }))}
              selected={form.watch("roles")}
              onChange={(v) => form.setValue("roles", v as AppRole[], { shouldValidate: true })}
            />
            <MultiSelectSection
              title="Empresas"
              options={empresas.filter((e) => e.ativo).map((e) => ({ id: e.id, label: e.nome }))}
              selected={form.watch("empresa_ids")}
              onChange={(v) => {
                form.setValue("empresa_ids", v);
                const validProj = form.getValues("projeto_ids").filter((pid) =>
                  availableProjetos.some((p) => p.id === pid)
                );
                form.setValue("projeto_ids", validProj);
              }}
            />
            <MultiSelectSection
              title="Projetos"
              options={availableProjetos.map((p) => ({ id: p.id, label: p.nome }))}
              selected={form.watch("projeto_ids")}
              onChange={(v) => form.setValue("projeto_ids", v)}
              emptyLabel="Selecione empresas para liberar projetos."
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar alterações"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Multi-select helper --------------------
function MultiSelectSection({
  title, options, selected, onChange, emptyLabel,
}: {
  title: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyLabel?: string;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground border rounded-md p-3">{emptyLabel ?? "Nenhuma opção disponível."}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border rounded-md p-3 max-h-56 overflow-y-auto">
          {options.map((o) => {
            const checked = selected.includes(o.id);
            return (
              <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v) onChange([...selected, o.id]);
                    else onChange(selected.filter((s) => s !== o.id));
                  }}
                />
                <span className="truncate">{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -------------------- History Drawer --------------------
function HistoryDrawer({ usuario, onClose }: { usuario: UsuarioRow | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["usuario-historico", usuario?.id],
    enabled: !!usuario,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_user_history", {
        _user_id: usuario!.id,
        _limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const sessQ = useQuery({
    queryKey: ["usuario-sessoes", usuario?.id],
    enabled: !!usuario,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_user_sessions", {
        _user_id: usuario!.id,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Sheet open={!!usuario} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico e sessões</SheetTitle>
          <SheetDescription>{usuario?.nome} · {usuario?.email}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="historico" className="mt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="historico">Auditoria</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões</TabsTrigger>
          </TabsList>
          <TabsContent value="historico" className="space-y-2 mt-3">
            {q.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            {!q.isLoading && (q.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem eventos registrados.</p>
            )}
            {(q.data ?? []).map((ev: {
              id: string; created_at: string; acao: string; modulo: string;
              usuario_nome: string | null; observacoes: string | null;
            }) => (
              <div key={ev.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">{ev.acao}</Badge>
                  <span className="text-[10px] text-muted-foreground">{fmtDate(ev.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {ev.observacoes || `${ev.modulo}`}
                </div>
                {ev.usuario_nome && (
                  <div className="text-[10px] text-muted-foreground mt-1">por {ev.usuario_nome}</div>
                )}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="sessoes" className="space-y-2 mt-3">
            {sessQ.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            {!sessQ.isLoading && (sessQ.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma sessão registrada.</p>
            )}
            {(sessQ.data ?? []).map((s: {
              id: string; device: string | null; browser: string | null; os: string | null;
              created_at: string; last_activity: string; status: string;
            }) => (
              <div key={s.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-xs">
                    {[s.device, s.browser, s.os].filter(Boolean).join(" · ") || "Sessão"}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${s.status === "ATIVA"
                      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                      : "text-muted-foreground"}`}
                  >
                    {s.status}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Iniciada {fmtDate(s.created_at)} · Última atividade {fmtDate(s.last_activity)}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}


const WA_STATUS_META: Record<string, { label: string; cls: string }> = {
  NAO_ENVIADO:       { label: "Não enviado",   cls: "text-muted-foreground" },
  PENDENTE:          { label: "Pendente",      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  ATRASADO:          { label: "Atrasado",      cls: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  PROCESSANDO:       { label: "Processando",   cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  ENVIADO:           { label: "Enviado",       cls: "bg-sky-500/15 text-sky-700 border-sky-500/30" },
  ENTREGUE:          { label: "Entregue",      cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  LIDA:              { label: "Lida",          cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  FALHOU_TEMPORARIO: { label: "Retentando",    cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  FALHOU_DEFINITIVO: { label: "Falhou",        cls: "bg-red-500/15 text-red-700 border-red-500/30" },
  CANCELADO:         { label: "Cancelado",     cls: "bg-red-500/15 text-red-700 border-red-500/30" },
};

function WhatsappStatusCell({
  status,
  onOpenDetails,
}: {
  status: BoasVindasStatus | null;
  onOpenDetails?: () => void;
}) {
  const derived = status?.status_derivado ?? "NAO_ENVIADO";
  const meta = WA_STATUS_META[derived] ?? { label: derived, cls: "text-muted-foreground" };
  const isSent = derived !== "NAO_ENVIADO";
  const timestamp = status?.enviado_em ?? status?.proxima_tentativa_em ?? status?.atualizado_em ?? null;

  const content = (
    <div className="flex flex-col gap-0.5" title={status?.ultimo_erro ?? undefined}>
      <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
        <MessageCircle className="mr-1 h-3 w-3" />{meta.label}
      </Badge>
      {isSent && timestamp && (
        <span className="text-[10px] text-muted-foreground">{fmtDate(timestamp)}</span>
      )}
      {status && status.tentativas > 0 && derived !== "ENVIADO" && (
        <span className="text-[10px] text-muted-foreground">
          Tentativa {status.tentativas}/{status.max_tentativas}
        </span>
      )}
    </div>
  );

  if (!onOpenDetails) return content;
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="text-left hover:opacity-80 transition-opacity"
      aria-label="Ver detalhes do envio de WhatsApp"
    >
      {content}
    </button>
  );
}

function WhatsappDetalhesDialog({
  alvo,
  onClose,
  onReprocessar,
  reprocessando,
}: {
  alvo: { usuario: UsuarioRow; status: BoasVindasStatus | null } | null;
  onClose: () => void;
  onReprocessar: () => void;
  reprocessando: boolean;
}) {
  const open = !!alvo;
  const s = alvo?.status ?? null;
  const derived = s?.status_derivado ?? "NAO_ENVIADO";
  const meta = WA_STATUS_META[derived] ?? { label: derived, cls: "text-muted-foreground" };

  const rows: Array<[string, React.ReactNode]> = s
    ? [
        ["Status", <Badge key="s" variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>],
        ["Status interno", <code key="si" className="text-[11px]">{s.status ?? "—"}</code>],
        ["Telefone", s.telefone_mascarado ?? "—"],
        ["Template", s.template_codigo ?? "—"],
        ["Tentativas", `${s.tentativas} / ${s.max_tentativas}`],
        ["Próxima tentativa", s.proxima_tentativa_em ? fmtDate(s.proxima_tentativa_em) : "—"],
        ["Enviado em", s.enviado_em ? fmtDate(s.enviado_em) : "—"],
        ["Criado em", s.created_at ? fmtDate(s.created_at) : "—"],
        ["ID do provedor", <code key="pm" className="text-[11px] break-all">{s.provider_message_id ?? "—"}</code>],
        ["Código do erro", <code key="ec" className="text-[11px]">{s.ultimo_erro_codigo ?? "—"}</code>],
        ["Erro (resumo)", <span key="er" className="text-[11px] break-words">{s.ultimo_erro ?? "—"}</span>],
        ["Outbox ID", <code key="oid" className="text-[11px] break-all">{s.outbox_id ?? "—"}</code>],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envio do convite por WhatsApp</DialogTitle>
          <DialogDescription>
            {alvo?.usuario.nome} · {alvo?.usuario.email}
          </DialogDescription>
        </DialogHeader>
        {s ? (
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <>
                <div key={`k-${k}`} className="text-muted-foreground">{k}</div>
                <div key={`v-${k}`} className="min-w-0">{v}</div>
              </>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4">
            Nenhum envio foi registrado para este usuário ainda.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button
            onClick={onReprocessar}
            disabled={reprocessando || !alvo?.usuario.telefone_whatsapp || !alvo?.usuario.ativo}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {reprocessando ? "Enviando..." : "Tentar novamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



