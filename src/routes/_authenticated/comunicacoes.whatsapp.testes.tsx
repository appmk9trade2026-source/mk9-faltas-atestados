// Modo de teste seguro do template WhatsApp v3.
//
// - Somente Super Admin.
// - Envio apenas para números da allow-list `whatsapp_test_recipients`.
// - Não cria ausência, não consome sequência, não afeta métricas operacionais.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  WhatsappRouteError,
  WhatsappRouteLoading,
  WhatsappRouteNotFound,
} from "@/components/whatsapp/route-boundaries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Send,
  Eye,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import {
  createTestRecipient,
  deleteTestRecipient,
  enfileirarTemplateTeste,
  getTesteStatus,
  listProjetosParaTeste,
  listTestRecipients,
  previewTemplateTeste,
  toggleTestRecipient,
} from "@/lib/whatsapp-teste.functions";

export const Route = createFileRoute("/_authenticated/comunicacoes/whatsapp/testes")({
  head: () => ({
    meta: [
      { title: "Testes de Template · WhatsApp Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestesPage,
  errorComponent: ({ error, reset }) => <WhatsappRouteError error={error} reset={reset} />,
  notFoundComponent: () => <WhatsappRouteNotFound />,
  pendingComponent: () => <WhatsappRouteLoading />,
});

// ---------------------------------------------------------------------------
// Form validation (client-side, dobrada no servidor pela RPC).
// ---------------------------------------------------------------------------

const TesteFormSchema = z
  .object({
    recipient_id: z.string().uuid("Selecione um destinatário autorizado."),
    tipo_lancamento: z.enum(["FALTA", "ATESTADO"]),
    projeto_id: z.string().uuid("Selecione um projeto."),
    colaborador_nome: z
      .string()
      .trim()
      .min(1, "Informe um nome de teste.")
      .max(120),
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  })
  .refine((v) => v.data_inicio <= v.data_fim, {
    message: "A data final deve ser igual ou posterior à inicial.",
    path: ["data_fim"],
  });

type TesteForm = z.infer<typeof TesteFormSchema>;

const RecipientSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório.").max(120),
  telefone_e164: z
    .string()
    .trim()
    .regex(
      /^\+?[1-9][0-9]{7,14}$/,
      "Use o formato E.164 (ex.: +5511999999999).",
    ),
});

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

function TestesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTestRecipients);
  const create = useServerFn(createTestRecipient);
  const toggle = useServerFn(toggleTestRecipient);
  const remove = useServerFn(deleteTestRecipient);
  const listProjetos = useServerFn(listProjetosParaTeste);
  const preview = useServerFn(previewTemplateTeste);
  const send = useServerFn(enfileirarTemplateTeste);
  const status = useServerFn(getTesteStatus);

  const recipientsQ = useQuery({
    queryKey: ["wa-test-recipients"],
    queryFn: () => list(),
  });
  const projetosQ = useQuery({
    queryKey: ["wa-test-projetos"],
    queryFn: () => listProjetos(),
  });

  const [openRecipient, setOpenRecipient] = useState(false);

  const createMut = useMutation({
    mutationFn: (data: z.infer<typeof RecipientSchema>) => create({ data }),
    onSuccess: () => {
      toast.success("Destinatário adicionado à allow-list.");
      qc.invalidateQueries({ queryKey: ["wa-test-recipients"] });
      setOpenRecipient(false);
    },
    onError: (e) => toast.error(errorMsg(e)),
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-test-recipients"] }),
    onError: (e) => toast.error(errorMsg(e)),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Destinatário removido.");
      qc.invalidateQueries({ queryKey: ["wa-test-recipients"] });
    },
    onError: (e) => toast.error(errorMsg(e)),
  });

  // form state
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<TesteForm>({
    recipient_id: "",
    tipo_lancamento: "FALTA",
    projeto_id: "",
    colaborador_nome: "Colaborador de Teste",
    data_inicio: today,
    data_fim: today,
  });
  const [previewData, setPreviewData] = useState<Awaited<
    ReturnType<typeof previewTemplateTeste>
  > | null>(null);
  const [lastOutboxId, setLastOutboxId] = useState<string | null>(null);

  const parsed = TesteFormSchema.safeParse(form);
  const formErrors = useMemo(() => {
    if (parsed.success) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!map[key]) map[key] = issue.message;
    }
    return map;
  }, [parsed]);

  const previewMut = useMutation({
    mutationFn: (data: TesteForm) => {
      const { recipient_id: _r, ...rest } = data;
      return preview({ data: rest });
    },
    onSuccess: (d) => setPreviewData(d),
    onError: (e) => toast.error(errorMsg(e)),
  });
  const sendMut = useMutation({
    mutationFn: (data: TesteForm) => send({ data }),
    onSuccess: (d) => {
      setPreviewData({ ...d, periodo_texto: "", aviso_privacidade: "", tipo_lancamento: form.tipo_lancamento, projeto_nome: previewData?.projeto_nome ?? "" });
      setLastOutboxId(d.outbox_id);
      toast.success(`Teste enfileirado · destinatário ${d.destinatario_mascarado}`);
    },
    onError: (e) => toast.error(errorMsg(e)),
  });

  const statusQ = useQuery({
    queryKey: ["wa-test-status", lastOutboxId],
    queryFn: () => (lastOutboxId ? status({ data: { outbox_id: lastOutboxId } }) : null),
    enabled: !!lastOutboxId,
    refetchInterval: (q) => {
      const d = q.state.data as Awaited<ReturnType<typeof getTesteStatus>> | null | undefined;
      if (!d) return 3000;
      if (d.status === "ENVIADO" || d.status === "CONFIRMADO" || d.status === "FALHOU_DEFINITIVO")
        return false;
      return 3000;
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Testes de Template</h2>
        <p className="text-sm text-muted-foreground">
          Envie mensagens do template ativo apenas para números da allow-list.
          Nenhuma ausência real é criada, e nenhum colaborador é notificado.
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Somente Super Admin
          </Badge>
          <Badge variant="outline">Não cria ausência</Badge>
          <Badge variant="outline">Não consome sequência</Badge>
          <Badge variant="outline">Não notifica colaborador real</Badge>
        </div>
      </header>

      {/* --- Allow-list --------------------------------------------------- */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Destinatários autorizados</h3>
            <p className="text-xs text-muted-foreground">
              Apenas números cadastrados aqui podem receber testes. Números não
              vinculados a colaboradores.
            </p>
          </div>
          <Dialog open={openRecipient} onOpenChange={setOpenRecipient}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Adicionar número
              </Button>
            </DialogTrigger>
            <RecipientDialog
              onSubmit={(v) => createMut.mutate(v)}
              submitting={createMut.isPending}
            />
          </Dialog>
        </div>

        {recipientsQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (recipientsQ.data ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum destinatário cadastrado ainda. Adicione um número de teste
            autorizado para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone (mascarado)</TableHead>
                  <TableHead className="w-24">Ativo</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recipientsQ.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.telefone_mascarado}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.ativo}
                        onCheckedChange={(v) =>
                          toggleMut.mutate({ id: r.id, ativo: v })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remover ${r.nome} da allow-list?`,
                            )
                          )
                            removeMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* --- Envio de teste ----------------------------------------------- */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Enviar teste</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Destinatário autorizado" error={formErrors.recipient_id}>
            <Select
              value={form.recipient_id}
              onValueChange={(v) => setForm({ ...form, recipient_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um número da allow-list" />
              </SelectTrigger>
              <SelectContent>
                {(recipientsQ.data ?? [])
                  .filter((r) => r.ativo)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nome} · {r.telefone_mascarado}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Projeto" error={formErrors.projeto_id}>
            <Select
              value={form.projeto_id}
              onValueChange={(v) => setForm({ ...form, projeto_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {(projetosQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.codigo_protocolo ? ` · ${p.codigo_protocolo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tipo de lançamento">
            <Select
              value={form.tipo_lancamento}
              onValueChange={(v) =>
                setForm({ ...form, tipo_lancamento: v as "FALTA" | "ATESTADO" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FALTA">FALTA</SelectItem>
                <SelectItem value="ATESTADO">ATESTADO</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Nome do colaborador (fictício)" error={formErrors.colaborador_nome}>
            <Input
              value={form.colaborador_nome}
              onChange={(e) =>
                setForm({ ...form, colaborador_nome: e.target.value })
              }
              maxLength={120}
            />
          </Field>

          <Field label="Data inicial" error={formErrors.data_inicio}>
            <Input
              type="date"
              value={form.data_inicio}
              onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
            />
          </Field>

          <Field label="Data final" error={formErrors.data_fim}>
            <Input
              type="date"
              value={form.data_fim}
              onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!parsed.success || previewMut.isPending}
            onClick={() => parsed.success && previewMut.mutate(parsed.data)}
          >
            {previewMut.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-1 h-4 w-4" />
            )}
            Pré-visualizar
          </Button>
          <Button
            disabled={!parsed.success || sendMut.isPending}
            onClick={() => parsed.success && sendMut.mutate(parsed.data)}
          >
            {sendMut.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Enviar teste
          </Button>
        </div>

        {previewData && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                Template {previewData.template_codigo} v{previewData.template_versao}
              </Badge>
              <Badge variant="outline">Protocolo simulado: {previewData.protocolo_simulado}</Badge>
              <Badge variant="outline">Projeto: {previewData.projeto_nome}</Badge>
            </div>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">
              {previewData.texto_renderizado}
            </pre>
          </div>
        )}
      </Card>

      {/* --- Status do último envio --------------------------------------- */}
      {lastOutboxId && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Status do último teste</h3>
          {statusQ.isLoading || !statusQ.data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <StatusRow
              status={statusQ.data.status}
              provider_message_id={statusQ.data.provider_message_id}
              enviado_em={statusQ.data.enviado_em}
              confirmado_em={statusQ.data.confirmado_em}
              falhou_em={statusQ.data.falhou_em}
              erro={statusQ.data.ultimo_erro_resumido}
              tentativas={statusQ.data.tentativas}
              destinatario_mascarado={statusQ.data.telefone_mascarado}
            />
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StatusRow(props: {
  status: string;
  provider_message_id: string | null;
  enviado_em: string | null;
  confirmado_em: string | null;
  falhou_em: string | null;
  erro: string | null;
  tentativas: number;
  destinatario_mascarado: string;
}) {
  const map: Record<string, { icon: React.ReactNode; label: string; tone: string }> = {
    PENDENTE: { icon: <Clock className="h-4 w-4" />, label: "Pendente", tone: "text-muted-foreground" },
    PROCESSANDO: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: "Processando", tone: "text-muted-foreground" },
    ENVIADO: { icon: <CheckCircle2 className="h-4 w-4" />, label: "Enviado", tone: "text-emerald-600" },
    CONFIRMADO: { icon: <CheckCircle2 className="h-4 w-4" />, label: "Entregue", tone: "text-emerald-600" },
    FALHOU_TEMPORARIO: { icon: <XCircle className="h-4 w-4" />, label: "Falha temporária", tone: "text-amber-600" },
    FALHOU_DEFINITIVO: { icon: <XCircle className="h-4 w-4" />, label: "Falhou", tone: "text-destructive" },
  };
  const info = map[props.status] ?? { icon: null, label: props.status, tone: "" };
  return (
    <div className="space-y-2 text-sm">
      <div className={`flex items-center gap-2 font-medium ${info.tone}`}>
        {info.icon}
        <span>{info.label}</span>
        <span className="text-xs text-muted-foreground">
          · tentativas: {props.tentativas}
        </span>
      </div>
      <dl className="grid gap-2 text-xs md:grid-cols-2">
        <Detail label="Destinatário" value={props.destinatario_mascarado} mono />
        <Detail label="Provider message ID" value={props.provider_message_id ?? "—"} mono />
        <Detail label="Enviado em" value={fmt(props.enviado_em)} />
        <Detail label="Confirmado em" value={fmt(props.confirmado_em)} />
        {props.falhou_em && <Detail label="Falhou em" value={fmt(props.falhou_em)} />}
        {props.erro && <Detail label="Erro" value={props.erro} />}
      </dl>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : ""}>{value}</dd>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function errorMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("DESTINATARIO_NAO_AUTORIZADO"))
    return "Número não está na allow-list ativa.";
  if (msg.includes("ACESSO_NEGADO")) return "Somente Super Admin pode executar esta ação.";
  if (msg.includes("TELEFONE_INVALIDO")) return "Telefone inválido.";
  if (msg.includes("PROJETO_INEXISTENTE")) return "Projeto não encontrado.";
  if (msg.includes("TEMPLATE_INEXISTENTE")) return "Template ativo não encontrado.";
  return msg;
}

// ---------------------------------------------------------------------------

function RecipientDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (v: z.infer<typeof RecipientSchema>) => void;
  submitting: boolean;
}) {
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const parsed = RecipientSchema.safeParse({ nome, telefone_e164: tel });
  const err = parsed.success
    ? {}
    : Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      );

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo destinatário de teste</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Field label="Nome de referência" error={err.nome as string | undefined}>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Telefone do QA"
            maxLength={120}
          />
        </Field>
        <Field label="Telefone (E.164)" error={err.telefone_e164 as string | undefined}>
          <Input
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="+5511999999999"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Nunca use o telefone de um colaborador real. O número ficará mascarado
          em todos os registros de auditoria.
        </p>
      </div>
      <DialogFooter>
        <Button
          disabled={!parsed.success || submitting}
          onClick={() => parsed.success && onSubmit(parsed.data)}
        >
          {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Adicionar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
