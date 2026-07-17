import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Send,
  UploadCloud,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useSession } from "@/hooks/use-session";
import { useProjetosAtivosPorEmpresa } from "@/hooks/use-projetos";
import { useColaboradoresAtivos } from "@/hooks/use-colaboradores";
import {
  ARQUIVO_MAX_BYTES,
  ARQUIVO_MIMES,
  BUCKET_ATESTADOS,
  TIPO_AUSENCIA,
  TIPO_LABEL,
  getSignedAtestadoUrl,
  type TipoAusencia,
} from "@/lib/ausencias";
import { formatPhoneBR } from "@/lib/br-format";

type SearchParams = { id?: string };

export const Route = createFileRoute("/_authenticated/nova-ausencia")({
  head: () => ({ meta: [{ title: "Nova Ausência · CRM MK9" }] }),
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const id = typeof search.id === "string" && search.id.length > 0 ? search.id : undefined;
    return { id };
  },
  component: NovaAusenciaPage,
});

type Empresa = { id: string; nome: string; ativo: boolean };

type ColabDetalhe = {
  id: string;
  nome_completo: string;
  matricula: string;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  supervisor_nome: string | null;
  supervisor_telefone: string | null;
  supervisor_email: string | null;
  ativo: boolean;
  empresa_id: string;
  projeto_id: string;
  empresa?: { nome: string } | null;
  projeto?: { nome: string } | null;
};

type AusenciaEdit = {
  id: string;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string;
  tipo: TipoAusencia;
  motivo: string | null;
  data_inicio: string;
  data_fim: string;
  dias: number;
  localidade: string | null;
  cid: string | null;
  loja_codigo_nome: string | null;
  acidente_trabalho_trajeto: boolean | null;
  status: "PENDENTE" | "LANCADO";
  possui_anexo: boolean;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  arquivo_mime: string | null;
  arquivo_tamanho: number | null;
};

const schema = z.object({
  empresa_id: z.string().uuid("Selecione a empresa."),
  projeto_id: z.string().uuid("Selecione o projeto."),
  colaborador_id: z.string().uuid("Selecione o colaborador."),
  tipo: z.enum(TIPO_AUSENCIA, { errorMap: () => ({ message: "Selecione o tipo." }) }),
  data_inicio: z.string().min(1, "Informe a data da ausência."),
  quantidade_dias: z
    .number({ invalid_type_error: "Informe a quantidade de dias." })
    .int()
    .min(1, "Mínimo de 1 dia.")
    .max(365, "Máximo de 365 dias."),
  localidade: z.string().trim().min(1, "Localidade é obrigatória.").max(150),
  loja_codigo_nome: z.string().trim().min(1, "Código ou nome da loja é obrigatório.").max(150),
  cid: z.string().max(20).optional().or(z.literal("")),
  acidente_trabalho_trajeto: z.enum(["sim", "nao"], {
    errorMap: () => ({ message: "Selecione Sim ou Não." }),
  }),
  motivo: z
    .string()
    .trim()
    .min(5, "Mínimo de 5 caracteres.")
    .max(500, "Máximo de 500 caracteres."),
});

type FormData = z.infer<typeof schema>;

function addDaysISO(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDatePt(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function NovaAusenciaPage() {
  const { profile, roles } = useSession();
  const podeCadastrar =
    roles.includes("super_admin") || roles.includes("rh") || roles.includes("supervisor");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = Route.useSearch();
  const isEdit = !!editId;

  const [file, setFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prefilled, setPrefilled] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      empresa_id: "",
      projeto_id: "",
      colaborador_id: "",
      tipo: "FALTA",
      data_inicio: "",
      quantidade_dias: 1,
      localidade: "",
      loja_codigo_nome: "",
      cid: "",
      acidente_trabalho_trajeto: undefined as unknown as "sim",
      motivo: "",
    },
  });

  const empresaId = form.watch("empresa_id");
  const projetoId = form.watch("projeto_id");
  const colaboradorId = form.watch("colaborador_id");
  const dataInicio = form.watch("data_inicio");
  const quantidadeDias = form.watch("quantidade_dias");
  const motivo = form.watch("motivo") ?? "";

  const dataFim = useMemo(
    () => (dataInicio && quantidadeDias ? addDaysISO(dataInicio, quantidadeDias - 1) : ""),
    [dataInicio, quantidadeDias],
  );
  const dataRetorno = useMemo(
    () => (dataInicio && quantidadeDias ? addDaysISO(dataInicio, quantidadeDias) : ""),
    [dataInicio, quantidadeDias],
  );

  const ausenciaQ = useQuery({
    queryKey: ["ausencia", editId],
    enabled: !!editId,
    queryFn: async (): Promise<AusenciaEdit | null> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(
          "id, empresa_id, projeto_id, colaborador_id, tipo, motivo, data_inicio, data_fim, dias, localidade, cid, loja_codigo_nome, acidente_trabalho_trajeto, status, possui_anexo, arquivo_url, arquivo_nome, arquivo_mime, arquivo_tamanho",
        )
        .eq("id", editId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AusenciaEdit | null;
    },
  });

  const ausencia = ausenciaQ.data ?? null;
  const bloqueado = isEdit && ausencia?.status === "LANCADO";

  useEffect(() => {
    if (isEdit && ausencia && !prefilled) {
      form.reset({
        empresa_id: ausencia.empresa_id,
        projeto_id: ausencia.projeto_id,
        colaborador_id: ausencia.colaborador_id,
        tipo: ausencia.tipo,
        data_inicio: ausencia.data_inicio,
        quantidade_dias: ausencia.dias || 1,
        localidade: ausencia.localidade ?? "",
        loja_codigo_nome: ausencia.loja_codigo_nome ?? "",
        cid: ausencia.cid ?? "",
        acidente_trabalho_trajeto:
          ausencia.acidente_trabalho_trajeto === true
            ? "sim"
            : ausencia.acidente_trabalho_trajeto === false
              ? "nao"
              : (undefined as unknown as "sim"),
        motivo: ausencia.motivo ?? "",
      });
      setPrefilled(true);
    }
  }, [isEdit, ausencia, prefilled, form]);

  const empresasQ = useQuery({
    queryKey: ["empresas", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  const projetosQ = useProjetosAtivosPorEmpresa(empresaId || null);
  const colabQ = useColaboradoresAtivos({
    empresaId: empresaId || null,
    projetoId: projetoId || null,
  });

  const colabDetalheQ = useQuery({
    queryKey: ["colaborador-detalhe-nova", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select(
          "id, nome_completo, matricula, email, telefone, whatsapp, supervisor_nome, supervisor_telefone, supervisor_email, ativo, empresa_id, projeto_id, empresa:empresas(nome), projeto:projetos(nome)",
        )
        .eq("id", colaboradorId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ColabDetalhe | null;
    },
  });

  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  function validateFile(f: File): string | null {
    if (!(ARQUIVO_MIMES as readonly string[]).includes(f.type)) {
      return "Formato não suportado. Use PDF, PNG, JPG ou JPEG.";
    }
    if (f.size > ARQUIVO_MAX_BYTES) return "Arquivo excede 10 MB.";
    return null;
  }

  function handleFileSelected(f: File | null | undefined) {
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      toast.error(err);
      return;
    }
    setFile(f);
    setRemoveExistingFile(true);
  }

  async function abrirAnexoExistente() {
    if (!ausencia?.arquivo_url) return;
    try {
      const url = await getSignedAtestadoUrl(ausencia.arquivo_url, 120);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Não foi possível abrir o anexo.", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const salvarMut = useMutation({
    mutationFn: async (values: FormData) => {
      const dataInicioIso = values.data_inicio;
      const dataFimIso = addDaysISO(dataInicioIso, values.quantidade_dias - 1);

      let arquivo_url: string | null | undefined = undefined;
      let arquivo_nome: string | null | undefined = undefined;
      let arquivo_mime: string | null | undefined = undefined;
      let arquivo_tamanho: number | null | undefined = undefined;
      let arquivo_criado_por: string | null | undefined = undefined;
      let arquivo_criado_em: string | null | undefined = undefined;

      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const stamp = Date.now();
        const rand = crypto.randomUUID();
        const path = `ausencias/${values.colaborador_id}/${stamp}-${rand}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_ATESTADOS)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        arquivo_url = path;
        arquivo_nome = file.name;
        arquivo_mime = file.type;
        arquivo_tamanho = file.size;
        arquivo_criado_por = profile?.id ?? null;
        arquivo_criado_em = new Date().toISOString();
      } else if (isEdit && removeExistingFile) {
        arquivo_url = null;
        arquivo_nome = null;
        arquivo_mime = null;
        arquivo_tamanho = null;
        arquivo_criado_por = null;
        arquivo_criado_em = null;
      }

      const basePayload = {
        empresa_id: values.empresa_id,
        projeto_id: values.projeto_id,
        colaborador_id: values.colaborador_id,
        tipo: values.tipo,
        motivo: values.motivo.trim(),
        data_inicio: dataInicioIso,
        data_fim: dataFimIso,
        localidade: values.localidade.trim(),
        loja_codigo_nome: values.loja_codigo_nome.trim(),
        cid: values.cid && values.cid.trim() ? values.cid.trim().toUpperCase() : null,
        acidente_trabalho_trajeto: values.acidente_trabalho_trajeto === "sim",
      };

      if (isEdit && editId) {
        const updatePayload =
          arquivo_url !== undefined
            ? {
                ...basePayload,
                arquivo_url,
                arquivo_nome,
                arquivo_mime,
                arquivo_tamanho,
                arquivo_criado_por,
                arquivo_criado_em,
              }
            : basePayload;
        const { error } = await supabase
          .from("ausencias")
          .update(updatePayload as never)
          .eq("id", editId)
          .eq("status", "PENDENTE");
        if (error) throw error;
      } else {
        const insertPayload = {
          ...basePayload,
          arquivo_url: arquivo_url ?? null,
          arquivo_nome: arquivo_nome ?? null,
          arquivo_mime: arquivo_mime ?? null,
          arquivo_tamanho: arquivo_tamanho ?? null,
          arquivo_criado_por: file ? profile?.id ?? null : null,
          arquivo_criado_em: file ? new Date().toISOString() : null,
        };
        const { error } = await supabase.from("ausencias").insert(insertPayload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Ausência atualizada." : "Ausência registrada.", {
        description: isEdit ? undefined : "Status inicial: PENDENTE.",
      });
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
      queryClient.invalidateQueries({ queryKey: ["ausencia", editId] });
      navigate({ to: "/ausencias" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/não pertence à empresa/i.test(msg)) {
        toast.error("O projeto/colaborador não pertence à empresa selecionada.");
      } else if (/inativ/i.test(msg)) {
        toast.error("Empresa, projeto ou colaborador está inativo.");
      } else if (/data final/i.test(msg)) {
        toast.error("A data final não pode ser anterior à data inicial.");
      } else {
        toast.error("Não foi possível salvar a ausência.", { description: msg });
      }
    },
  });

  if (!podeCadastrar) {
    return (
      <AppShell title="Nova Ausência" breadcrumb={["Operações", "Nova Ausência"]}>
        <Card className="p-8 text-sm text-muted-foreground">
          Seu papel não permite cadastrar novas ausências.
        </Card>
      </AppShell>
    );
  }

  if (isEdit && ausenciaQ.isLoading) {
    return (
      <AppShell title="Editar Ausência" breadcrumb={["Operações", "Ausências", "Editar"]}>
        <Card className="p-8 text-sm text-muted-foreground">Carregando registro…</Card>
      </AppShell>
    );
  }

  if (isEdit && !ausencia) {
    return (
      <AppShell title="Editar Ausência" breadcrumb={["Operações", "Ausências", "Editar"]}>
        <Card className="p-8 text-sm text-muted-foreground">Registro não encontrado.</Card>
      </AppShell>
    );
  }

  const empresas = empresasQ.data ?? [];
  const projetos = projetosQ.data ?? [];
  const colaboradores = colabQ.data ?? [];
  const colab = colabDetalheQ.data ?? null;

  const title = isEdit ? "Editar Ausência" : "Nova Ausência";
  const crumb = isEdit ? ["Operações", "Ausências", "Editar"] : ["Operações", "Nova Ausência"];
  const anexoExistenteVisivel =
    isEdit && ausencia?.possui_anexo && !file && !removeExistingFile;

  return (
    <AppShell title={title} breadcrumb={crumb}>
      <div className="mx-auto w-full max-w-5xl">
        <Card className="overflow-hidden p-0 shadow-lg">
          {/* Cabeçalho em gradiente */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 p-6 text-white sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <ClipboardList className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  Lançamento de Faltas e Atestados
                </h1>
                <p className="mt-1 text-sm text-white/85">
                  Sistema de registro de ausências de colaboradores
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-4 sm:p-6 md:p-8">
            {bloqueado ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
              >
                <Lock className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Este registro já foi lançado e não pode mais ser alterado.
                  </p>
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/70">
                    Registros com status <strong>LANCADO</strong> são somente leitura.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => navigate({ to: "/ausencias" })}
                  >
                    Voltar para a listagem
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isEdit ? (
                  <>
                    Editando registro com status{" "}
                    <span className="font-medium text-foreground">PENDENTE</span>.
                  </>
                ) : (
                  <>
                    Preencha o formulário abaixo. O lançamento nasce com status{" "}
                    <span className="font-medium text-foreground">PENDENTE</span>.
                  </>
                )}
              </p>
            )}

            <Form {...form}>
              <fieldset disabled={bloqueado} className="contents">
                <form
                  onSubmit={form.handleSubmit((v) => {
                    if (salvarMut.isPending || bloqueado) return;
                    salvarMut.mutate(v);
                  })}
                  className="space-y-6"
                >
                  {/* SEÇÃO 1: Dados do Colaborador */}
                  <Card className="border border-border/60 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h2 className="text-base font-semibold">Dados do Colaborador</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="empresa_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Empresa *</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(v) => {
                                field.onChange(v);
                                form.setValue("projeto_id", "");
                                form.setValue("colaborador_id", "");
                              }}
                              disabled={bloqueado}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {empresas.map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.nome}
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
                              onValueChange={(v) => {
                                field.onChange(v);
                                form.setValue("colaborador_id", "");
                              }}
                              disabled={bloqueado || !empresaId || projetosQ.isLoading}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      !empresaId
                                        ? "Selecione a empresa"
                                        : projetosQ.isLoading
                                          ? "Carregando..."
                                          : projetos.length === 0
                                            ? "Sem projetos ativos"
                                            : "Selecione"
                                    }
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {projetos.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.nome}
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
                        name="colaborador_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Colaborador *</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={bloqueado || !projetoId || colabQ.isLoading}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      !projetoId
                                        ? "Selecione o projeto"
                                        : colabQ.isLoading
                                          ? "Carregando..."
                                          : colaboradores.length === 0
                                            ? "Sem colaboradores"
                                            : "Buscar por nome ou matrícula"
                                    }
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {colaboradores.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.nome_completo} · {c.matricula}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Dados automáticos */}
                    {colaboradorId && (
                      <div className="mt-5 rounded-lg border bg-muted/30 p-4">
                        {colabDetalheQ.isLoading ? (
                          <p className="text-xs text-muted-foreground">Carregando dados…</p>
                        ) : colab ? (
                          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                            <ReadField label="Nome completo" value={colab.nome_completo} icon={UserIcon} />
                            <ReadField label="Matrícula" value={colab.matricula} mono />
                            <ReadField
                              label="E-mail"
                              value={colab.email}
                              icon={Mail}
                              href={colab.email ? `mailto:${colab.email}` : undefined}
                            />
                            <ReadField
                              label="Telefone"
                              value={colab.telefone ? formatPhoneBR(colab.telefone) : null}
                              icon={Phone}
                              href={colab.telefone ? `tel:+55${colab.telefone}` : undefined}
                            />
                            <ReadField
                              label="WhatsApp"
                              value={colab.whatsapp ? formatPhoneBR(colab.whatsapp) : null}
                              icon={MessageSquare}
                              href={
                                colab.whatsapp
                                  ? `https://wa.me/55${colab.whatsapp}`
                                  : undefined
                              }
                              external
                            />
                            <ReadField
                              label="Empresa"
                              value={colab.empresa?.nome ?? null}
                              icon={Building2}
                            />
                            <ReadField
                              label="Projeto"
                              value={colab.projeto?.nome ?? null}
                              icon={ClipboardList}
                            />
                            <ReadField
                              label="Supervisor(a)"
                              value={colab.supervisor_nome}
                              icon={UserIcon}
                            />
                            <ReadField
                              label="Telefone do supervisor"
                              value={
                                colab.supervisor_telefone
                                  ? formatPhoneBR(colab.supervisor_telefone)
                                  : null
                              }
                              icon={Phone}
                              href={
                                colab.supervisor_telefone
                                  ? `tel:+55${colab.supervisor_telefone}`
                                  : undefined
                              }
                            />
                            <ReadField
                              label="E-mail do supervisor"
                              value={colab.supervisor_email}
                              icon={Mail}
                              href={
                                colab.supervisor_email
                                  ? `mailto:${colab.supervisor_email}`
                                  : undefined
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Colaborador não encontrado.
                          </p>
                        )}
                      </div>
                    )}
                  </Card>

                  {/* SEÇÃO 2: Informações da Ausência */}
                  <Card className="border border-border/60 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h2 className="text-base font-semibold">Informações da Ausência</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="localidade"
                        render={({ field }) => (
                          <FormItem className="lg:col-span-2">
                            <FormLabel>Localidade *</FormLabel>
                            <FormControl>
                              <Input
                                maxLength={150}
                                placeholder="Ex.: Taguatinga Norte, Loja Carrefour Taguatinga, Atacadão Ceilândia"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tipo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Ausência *</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(v) => field.onChange(v as TipoAusencia)}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TIPO_AUSENCIA.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {TIPO_LABEL[t]}
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
                        name="data_inicio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data da Ausência *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="quantidade_dias"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantidade de Dias *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={365}
                                value={field.value ?? ""}
                                onChange={(e) => {
                                  const n = parseInt(e.target.value, 10);
                                  field.onChange(Number.isFinite(n) ? n : 1);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-2">
                        <Label>Data de Retorno</Label>
                        <Input
                          readOnly
                          disabled
                          value={dataRetorno ? formatDatePt(dataRetorno) : ""}
                          placeholder="—"
                        />
                        {dataFim && (
                          <p className="text-[11px] text-muted-foreground">
                            Última data de ausência: {formatDatePt(dataFim)}
                          </p>
                        )}
                      </div>

                      <FormField
                        control={form.control}
                        name="cid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex.: J00, F32, M54"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(e.target.value.toUpperCase().replace(/\s+/g, ""))
                                }
                                maxLength={20}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="loja_codigo_nome"
                        render={({ field }) => (
                          <FormItem className="lg:col-span-2">
                            <FormLabel>Código ou Nome da Loja *</FormLabel>
                            <FormControl>
                              <Input
                                maxLength={150}
                                placeholder="Ex.: 001 ou Nome da Loja"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name="acidente_trabalho_trajeto"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Foi Acidente de Trabalho ou Trajeto? *</FormLabel>
                            <FormControl>
                              <RadioGroup
                                value={field.value ?? ""}
                                onValueChange={field.onChange}
                                className="flex flex-wrap gap-4 pt-1"
                              >
                                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted/50">
                                  <RadioGroupItem value="sim" id="at-sim" />
                                  <span>Sim</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted/50">
                                  <RadioGroupItem value="nao" id="at-nao" />
                                  <span>Não</span>
                                </label>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name="motivo"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Motivo da Ausência *</FormLabel>
                              <span className="text-xs text-muted-foreground">
                                {motivo.length}/500
                              </span>
                            </div>
                            <FormControl>
                              <Textarea
                                rows={4}
                                maxLength={500}
                                placeholder="Descreva detalhadamente o motivo da ausência..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Card>

                  {/* SEÇÃO 3: Anexar Documento */}
                  <Card className="border border-border/60 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <UploadCloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h2 className="text-base font-semibold">Anexar Documento</h2>
                    </div>

                    {anexoExistenteVisivel && (
                      <div className="mb-3 flex items-center gap-3 rounded-md border p-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded bg-muted">
                          {ausencia?.arquivo_mime === "application/pdf" ? (
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {ausencia?.arquivo_nome ?? "arquivo"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ausencia?.arquivo_mime ?? "—"} ·{" "}
                            {ausencia?.arquivo_tamanho
                              ? `${(ausencia.arquivo_tamanho / 1024).toFixed(1)} KB`
                              : ""}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={abrirAnexoExistente}>
                          Abrir
                        </Button>
                        {!bloqueado && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setRemoveExistingFile(true)}
                            aria-label="Remover anexo"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}

                    {!bloqueado && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const f = e.dataTransfer.files?.[0];
                          handleFileSelected(f);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
                        className={
                          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition " +
                          (dragOver
                            ? "border-blue-500 bg-blue-500/5"
                            : "border-border hover:border-blue-500/60 hover:bg-muted/40")
                        }
                        role="button"
                        tabIndex={0}
                        aria-label="Selecionar arquivo"
                      >
                        <UploadCloud className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium">
                          Clique ou arraste o arquivo aqui
                        </span>
                        <span className="text-xs text-muted-foreground">
                          PDF, JPG ou PNG — máximo de 10 MB
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => handleFileSelected(e.target.files?.[0])}
                        />
                      </div>
                    )}

                    {file && (
                      <div className="mt-3 flex items-center gap-3 rounded-md border p-3">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={file.name}
                            className="h-14 w-14 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded bg-muted">
                            {file.type === "application/pdf" ? (
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB · {file.type}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setFile(null);
                            if (isEdit && ausencia?.possui_anexo) setRemoveExistingFile(false);
                          }}
                          aria-label="Remover anexo"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {isEdit && ausencia?.possui_anexo && removeExistingFile && !file && (
                      <p className="mt-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        O anexo atual será removido ao salvar.
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => setRemoveExistingFile(false)}
                        >
                          Desfazer
                        </Button>
                      </p>
                    )}
                  </Card>

                  {/* Botão de envio */}
                  {!bloqueado && (
                    <div className="flex flex-col items-center gap-3 border-t pt-6 sm:flex-row sm:justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => navigate({ to: "/ausencias" })}
                        disabled={salvarMut.isPending}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        size="lg"
                        disabled={salvarMut.isPending}
                        className="min-w-[220px] bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:from-blue-700 hover:to-indigo-800"
                      >
                        {salvarMut.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {salvarMut.isPending
                          ? "Enviando..."
                          : isEdit
                            ? "Salvar Alterações"
                            : "Enviar Lançamento"}
                      </Button>
                    </div>
                  )}
                </form>
              </fieldset>
            </Form>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

type ReadFieldProps = {
  label: string;
  value: string | null;
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
  href?: string;
  external?: boolean;
};

function ReadField({ label, value, icon: Icon, mono, href, external }: ReadFieldProps) {
  const empty = !value;
  const content = (
    <span className={mono ? "font-mono" : undefined}>{empty ? "Não informado" : value}</span>
  );
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div
        className={
          "truncate text-sm " + (empty ? "italic text-muted-foreground" : "text-foreground")
        }
        title={value ?? undefined}
      >
        {href && !empty ? (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
