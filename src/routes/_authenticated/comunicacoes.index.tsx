import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, MessageSquarePlus, Pencil, Search, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { TIPO_LABEL, type TipoAusencia } from "@/lib/ausencias";
import {
  CANAL_COMUNICACAO,
  CANAL_LABEL,
  STATUS_COMUNICACAO,
  STATUS_LABEL,
  defaultDestinatario,
  renderTemplate,
  type CanalComunicacao,
  type StatusComunicacao,
} from "@/lib/comunicacoes";

export const Route = createFileRoute("/_authenticated/comunicacoes/")({
  head: () => ({ meta: [{ title: "Comunicações · CRM MK9" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    ausencia: typeof s.ausencia === "string" ? s.ausencia : undefined,
  }),
  component: ComunicacoesPage,
});

type Empresa = { id: string; nome: string };
type Projeto = { id: string; nome: string; empresa_id: string };

type Comunicacao = {
  id: string;
  ausencia_id: string;
  colaborador_id: string;
  tipo: CanalComunicacao;
  status: StatusComunicacao;
  assunto: string | null;
  mensagem: string;
  destinatario: string;
  erro: string | null;
  criado_por: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  enviado_por: string | null;
  enviado_em: string | null;
  created_at: string;
  updated_at: string;
  colaborador?: {
    nome_completo: string;
    matricula: string;
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
    empresa_id: string;
    projeto_id: string;
  } | null;
  ausencia?: {
    tipo: TipoAusencia;
    data_inicio: string;
    data_fim: string;
    empresa_id: string;
    projeto_id: string;
  } | null;
  criador?: { nome: string | null; email: string | null } | null;
  aprovador?: { nome: string | null; email: string | null } | null;
  enviador?: { nome: string | null; email: string | null } | null;
};

type AusenciaOption = {
  id: string;
  tipo: TipoAusencia;
  data_inicio: string;
  data_fim: string;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string;
  colaborador: {
    nome_completo: string;
    matricula: string;
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
  } | null;
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR");
}
function fmtDT(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

function StatusBadge({ status }: { status: StatusComunicacao }) {
  const cls: Record<StatusComunicacao, string> = {
    RASCUNHO: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    APROVADO: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    ENVIADO: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ERRO: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  };
  return (
    <Badge variant="secondary" className={cls[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function ComunicacoesPage() {
  const { roles, user } = useSession();
  const scope = useSessionScope();
  const isRH = roles.includes("super_admin") || roles.includes("rh");
  const queryClient = useQueryClient();
  const { ausencia: ausenciaParam } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [search, setSearch] = useState("");
  const [empresaF, setEmpresaF] = useState("all");
  const [projetoF, setProjetoF] = useState("all");
  const [canalF, setCanalF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [periodoIni, setPeriodoIni] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const [editing, setEditing] = useState<Comunicacao | null>(null);
  const [creating, setCreating] = useState(false);
  const [initialAusenciaId, setInitialAusenciaId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Comunicacao | null>(null);
  const [confirmSend, setConfirmSend] = useState<Comunicacao | null>(null);

  useEffect(() => {
    if (ausenciaParam && isRH) {
      setInitialAusenciaId(ausenciaParam);
      setCreating(true);
      navigate({ search: {}, replace: true });
    }
  }, [ausenciaParam, isRH, navigate]);

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

  const comunicacoesQ = useQuery({
    queryKey: ["comunicacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicacoes")
        .select(
          "*, colaborador:colaboradores(nome_completo, matricula, email, telefone, whatsapp, empresa_id, projeto_id), ausencia:ausencias(tipo, data_inicio, data_fim, empresa_id, projeto_id)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Comunicacao[];
      const ids = Array.from(
        new Set(
          rows
            .flatMap((r) => [r.criado_por, r.aprovado_por, r.enviado_por])
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
          r.criador = r.criado_por ? (map.get(r.criado_por) ?? null) : null;
          r.aprovador = r.aprovado_por ? (map.get(r.aprovado_por) ?? null) : null;
          r.enviador = r.enviado_por ? (map.get(r.enviado_por) ?? null) : null;
        }
      }
      return rows;
    },
  });

  const empresas = empresasQ.data ?? [];
  const projetos = projetosQ.data ?? [];
  const projetosFiltro = useMemo(
    () => (empresaF === "all" ? projetos : projetos.filter((p) => p.empresa_id === empresaF)),
    [projetos, empresaF],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = comunicacoesQ.data ?? [];
    if (q)
      list = list.filter((c) => {
        const hay =
          (c.colaborador?.nome_completo ?? "").toLowerCase() +
          " " +
          (c.colaborador?.matricula ?? "").toLowerCase() +
          " " +
          (c.destinatario ?? "").toLowerCase() +
          " " +
          (c.assunto ?? "").toLowerCase() +
          " " +
          (c.mensagem ?? "").toLowerCase();
        return hay.includes(q);
      });
    if (empresaF !== "all") list = list.filter((c) => c.colaborador?.empresa_id === empresaF);
    if (projetoF !== "all") list = list.filter((c) => c.colaborador?.projeto_id === projetoF);
    if (canalF !== "all") list = list.filter((c) => c.tipo === canalF);
    if (statusF !== "all") list = list.filter((c) => c.status === statusF);
    if (periodoIni) list = list.filter((c) => c.created_at.slice(0, 10) >= periodoIni);
    if (periodoFim) list = list.filter((c) => c.created_at.slice(0, 10) <= periodoFim);
    return list;
  }, [comunicacoesQ.data, search, empresaF, projetoF, canalF, statusF, periodoIni, periodoFim]);

  const enviarMut = useMutation({
    mutationFn: async (row: Comunicacao) => {
      const { error } = await supabase
        .from("comunicacoes")
        .update({ status: "ENVIADO" as StatusComunicacao })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comunicação registrada como enviada.", {
        description: "Auditoria salva. O conteúdo agora é imutável.",
      });
      queryClient.invalidateQueries({ queryKey: ["comunicacoes"] });
      setConfirmSend(null);
      setViewing(null);
    },
    onError: (err: unknown) => {
      toast.error("Não foi possível atualizar o status.", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  return (
    <AppShell title="Comunicações" breadcrumb={["Operações", "Comunicações"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm text-muted-foreground">
            Comunicações administrativas ao colaborador. Toda mensagem passa por
            revisão humana; nada é enviado automaticamente. Após o envio, o
            conteúdo fica imutável para preservar a auditoria.
          </p>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nesta etapa o sistema apenas prepara e registra a mensagem. Nenhum
              e-mail, SMS ou WhatsApp é disparado por integração externa.
            </span>
          </div>
        </div>
        {isRH && (
          <Button onClick={() => setCreating(true)}>
            <MessageSquarePlus className="mr-2 h-4 w-4" /> Nova comunicação
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Colaborador, matrícula, destinatário..."
              className="pl-8"
            />
          </div>
          <Select
            value={empresaF}
            onValueChange={(v) => {
              setEmpresaF(v);
              setProjetoF("all");
            }}
          >
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
          <div className="grid grid-cols-2 gap-2">
            <Select value={canalF} onValueChange={setCanalF}>
              <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                {CANAL_COMUNICACAO.map((c) => (
                  <SelectItem key={c} value={c}>{CANAL_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_COMUNICACAO.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center">
          <label className="text-xs text-muted-foreground">Período:</label>
          <Input type="date" value={periodoIni} onChange={(e) => setPeriodoIni(e.target.value)} className="sm:w-44" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="sm:w-44" />
          {(periodoIni || periodoFim) && (
            <Button variant="ghost" size="sm" onClick={() => { setPeriodoIni(""); setPeriodoFim(""); }}>
              Limpar período
            </Button>
          )}
          <div className="sm:ml-auto text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Colaborador</TableHead>
                <TableHead>Tipo (ausência)</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Enviado em</TableHead>
                <TableHead className="hidden xl:table-cell">Responsável</TableHead>
                <TableHead className="w-[140px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comunicacoesQ.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))}
              {!comunicacoesQ.isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma comunicação registrada.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.colaborador?.nome_completo ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Mat. {c.colaborador?.matricula ?? "—"}</div>
                  </TableCell>
                  <TableCell>{c.ausencia ? TIPO_LABEL[c.ausencia.tipo] : "—"}</TableCell>
                  <TableCell>{CANAL_LABEL[c.tipo]}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="hidden lg:table-cell">{fmtDT(c.enviado_em)}</TableCell>
                  <TableCell className="hidden xl:table-cell text-xs">
                    {c.enviador?.nome ?? c.aprovador?.nome ?? c.criador?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewing(c)} title="Visualizar">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isRH && c.status === "RASCUNHO" && (
                        <Button size="icon" variant="ghost" onClick={() => setEditing(c)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {isRH && c.status !== "ENVIADO" && (
                        <Button size="icon" variant="ghost" onClick={() => setConfirmSend(c)} title="Registrar envio">
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Editor / Novo */}
      {(creating || editing) && (
        <ComunicacaoEditor
          userId={user?.id ?? null}
          existing={editing}
          initialAusenciaId={initialAusenciaId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setInitialAusenciaId(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["comunicacoes"] });
          }}
        />
      )}

      {/* Preview */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prévia da comunicação</DialogTitle>
            <DialogDescription>
              Conteúdo exato conforme será registrado / foi registrado.
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Canal</div>
                  <div>{CANAL_LABEL[viewing.tipo]}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <StatusBadge status={viewing.status} />
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Destinatário</div>
                  <div className="font-mono text-xs">{viewing.destinatario}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Assunto</div>
                  <div>{viewing.assunto || "—"}</div>
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap text-sm">
                {viewing.mensagem}
              </div>
              <div className="rounded-md border p-3 text-xs">
                <div className="mb-1 font-semibold">Auditoria</div>
                <div>Criado: {viewing.criador?.nome ?? "—"} em {fmtDT(viewing.created_at)}</div>
                <div>Aprovado: {viewing.aprovador?.nome ?? "—"} em {fmtDT(viewing.aprovado_em)}</div>
                <div>Enviado: {viewing.enviador?.nome ?? "—"} em {fmtDT(viewing.enviado_em)}</div>
                {viewing.erro && <div className="text-red-600">Erro: {viewing.erro}</div>}
              </div>
            </div>
          )}
          <DialogFooter>
            {isRH && viewing && viewing.status !== "ENVIADO" && (
              <Button onClick={() => setConfirmSend(viewing)}>
                <Send className="mr-2 h-4 w-4" /> Registrar envio
              </Button>
            )}
            <Button variant="ghost" onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de envio */}
      <AlertDialog open={!!confirmSend} onOpenChange={(o) => !o && setConfirmSend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O conteúdo foi revisado e está correto?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, a comunicação será registrada como ENVIADA e não
              poderá ser alterada. A auditoria completa (usuário, data, canal e
              mensagem) será preservada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSend && enviarMut.mutate(confirmSend)}
              disabled={enviarMut.isPending}
            >
              Confirmar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

/* ==================== Editor ==================== */

function ComunicacaoEditor({
  existing,
  onClose,
  onSaved,
  userId,
  initialAusenciaId,
}: {
  existing: Comunicacao | null;
  onClose: () => void;
  onSaved: () => void;
  userId: string | null;
  initialAusenciaId?: string | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!existing;

  const [ausenciaId, setAusenciaId] = useState<string>(existing?.ausencia_id ?? initialAusenciaId ?? "");
  const [canal, setCanal] = useState<CanalComunicacao>(existing?.tipo ?? "EMAIL");
  const [assunto, setAssunto] = useState(existing?.assunto ?? "");
  const [mensagem, setMensagem] = useState(existing?.mensagem ?? "");
  const [destinatario, setDestinatario] = useState(existing?.destinatario ?? "");
  const [showPreview, setShowPreview] = useState(false);

  // Ausências disponíveis para nova comunicação
  const ausenciasQ = useQuery({
    queryKey: ["ausencias", "para-comunicar"],
    enabled: !isEdit,
    queryFn: async (): Promise<AusenciaOption[]> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(
          "id, tipo, data_inicio, data_fim, empresa_id, projeto_id, colaborador_id, colaborador:colaboradores(nome_completo, matricula, email, telefone, whatsapp)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AusenciaOption[];
    },
  });

  const ausenciaSel: AusenciaOption | null = useMemo(() => {
    if (isEdit && existing) {
      return {
        id: existing.ausencia_id,
        tipo: existing.ausencia?.tipo ?? "OUTROS",
        data_inicio: existing.ausencia?.data_inicio ?? "",
        data_fim: existing.ausencia?.data_fim ?? "",
        empresa_id: existing.ausencia?.empresa_id ?? "",
        projeto_id: existing.ausencia?.projeto_id ?? "",
        colaborador_id: existing.colaborador_id,
        colaborador: existing.colaborador
          ? {
              nome_completo: existing.colaborador.nome_completo,
              matricula: existing.colaborador.matricula,
              email: existing.colaborador.email,
              telefone: existing.colaborador.telefone,
              whatsapp: existing.colaborador.whatsapp,
            }
          : null,
      };
    }
    return (ausenciasQ.data ?? []).find((a) => a.id === ausenciaId) ?? null;
  }, [isEdit, existing, ausenciasQ.data, ausenciaId]);

  function aplicarTemplate() {
    if (!ausenciaSel) return;
    const tpl = renderTemplate(ausenciaSel.tipo, {
      nome: ausenciaSel.colaborador?.nome_completo ?? "",
      data: ausenciaSel.data_inicio,
    });
    setAssunto(tpl.assunto);
    setMensagem(tpl.corpo);
    setDestinatario(defaultDestinatario(canal, ausenciaSel.colaborador));
  }

  function onCanalChange(v: CanalComunicacao) {
    setCanal(v);
    if (ausenciaSel && (!destinatario || !isEdit)) {
      setDestinatario(defaultDestinatario(v, ausenciaSel.colaborador));
    }
  }

  const saveMut = useMutation({
    mutationFn: async (opts: { status: StatusComunicacao }) => {
      if (!ausenciaSel) throw new Error("Selecione uma ausência.");
      if (!mensagem.trim()) throw new Error("Mensagem obrigatória.");
      if (!destinatario.trim()) throw new Error("Destinatário obrigatório.");
      if (isEdit && existing) {
        const { error } = await supabase
          .from("comunicacoes")
          .update({
            tipo: canal,
            assunto: assunto.trim() || null,
            mensagem,
            destinatario: destinatario.trim(),
            status: opts.status,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("comunicacoes").insert({
          ausencia_id: ausenciaSel.id,
          colaborador_id: ausenciaSel.colaborador_id,
          tipo: canal,
          assunto: assunto.trim() || null,
          mensagem,
          destinatario: destinatario.trim(),
          status: opts.status,
          criado_por: userId,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_r, vars) => {
      toast.success(
        vars.status === "ENVIADO"
          ? "Comunicação registrada como enviada."
          : vars.status === "APROVADO"
            ? "Comunicação aprovada."
            : "Rascunho salvo.",
      );
      queryClient.invalidateQueries({ queryKey: ["comunicacoes"] });
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      toast.error("Não foi possível salvar.", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });

  const [confirmEnvio, setConfirmEnvio] = useState(false);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar comunicação" : "Nova comunicação"}</DialogTitle>
            <DialogDescription>
              Selecione a ausência, revise a mensagem e escolha o canal. Nenhum
              envio automático é realizado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {!isEdit && (
              <div className="grid gap-2">
                <Label>Ausência de referência *</Label>
                <Select value={ausenciaId} onValueChange={setAusenciaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma ausência" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    {(ausenciasQ.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.colaborador?.nome_completo ?? "—"} · {TIPO_LABEL[a.tipo]} · {fmtDate(a.data_inicio)}–{fmtDate(a.data_fim)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {ausenciaSel && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div><span className="text-muted-foreground">Colaborador:</span> {ausenciaSel.colaborador?.nome_completo} (Mat. {ausenciaSel.colaborador?.matricula})</div>
                <div><span className="text-muted-foreground">Ausência:</span> {TIPO_LABEL[ausenciaSel.tipo]} · {fmtDate(ausenciaSel.data_inicio)} a {fmtDate(ausenciaSel.data_fim)}</div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Canal *</Label>
                <Select value={canal} onValueChange={(v) => onCanalChange(v as CanalComunicacao)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CANAL_COMUNICACAO.map((c) => (
                      <SelectItem key={c} value={c}>{CANAL_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Destinatário *</Label>
                <Input
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  placeholder={canal === "EMAIL" ? "email@dominio.com" : "somente números"}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Modelo</Label>
                <Button type="button" size="sm" variant="outline" onClick={aplicarTemplate} disabled={!ausenciaSel}>
                  Usar modelo padrão
                </Button>
              </div>
              <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto" />
              <Textarea
                rows={8}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Mensagem revisada pelo RH..."
              />
              <p className="text-xs text-muted-foreground">
                Modelos disponíveis: ATESTADO, FALTA, DECLARAÇÃO, SUSPENSÃO e OUTROS.
                O RH é responsável pelo conteúdo final. Nunca escreva conclusões
                médicas, jurídicas, advertências, descontos ou decisões trabalhistas.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="outline" onClick={() => setShowPreview(true)} disabled={!mensagem.trim()}>
              <Eye className="mr-2 h-4 w-4" /> Prévia
            </Button>
            <Button
              variant="secondary"
              onClick={() => saveMut.mutate({ status: "RASCUNHO" })}
              disabled={saveMut.isPending}
            >
              Salvar rascunho
            </Button>
            <Button
              onClick={() => setConfirmEnvio(true)}
              disabled={saveMut.isPending || !ausenciaSel || !mensagem.trim() || !destinatario.trim()}
            >
              <Send className="mr-2 h-4 w-4" /> Registrar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prévia */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prévia da comunicação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Canal</div>
                <div>{CANAL_LABEL[canal]}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Data</div>
                <div>{new Date().toLocaleString("pt-BR")}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Destinatário</div>
                <div className="font-mono text-xs">{destinatario || "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Assunto</div>
                <div>{assunto || "—"}</div>
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap text-sm">
              {mensagem || "—"}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de envio */}
      <AlertDialog open={confirmEnvio} onOpenChange={setConfirmEnvio}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O conteúdo foi revisado e está correto?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, a comunicação será registrada como ENVIADA. Após isso,
              o conteúdo não poderá ser alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmEnvio(false);
                saveMut.mutate({ status: "ENVIADO" });
              }}
            >
              Confirmar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
