import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Paperclip,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { formatCPF } from "@/lib/br-format";

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
  cargo: string | null;
  cpf: string | null;
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
  observacoes: string | null;
  status: "PENDENTE" | "LANCADO";
  possui_anexo: boolean;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  arquivo_mime: string | null;
  arquivo_tamanho: number | null;
};

const schema = z
  .object({
    empresa_id: z.string().uuid("Selecione a empresa."),
    projeto_id: z.string().uuid("Selecione o projeto."),
    colaborador_id: z.string().uuid("Selecione o colaborador."),
    tipo: z.enum(TIPO_AUSENCIA, { errorMap: () => ({ message: "Selecione o tipo." }) }),
    data_inicio: z.string().min(1, "Informe a data inicial."),
    data_fim: z.string().min(1, "Informe a data final."),
    motivo: z.string().max(500).optional().or(z.literal("")),
    observacoes: z.string().max(1000).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.data_inicio && v.data_fim && v.data_fim < v.data_inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data_fim"],
        message: "A data final não pode ser anterior à data inicial.",
      });
    }
  });

type FormData = z.infer<typeof schema>;

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
      data_fim: "",
      motivo: "",
      observacoes: "",
    },
  });

  const empresaId = form.watch("empresa_id");
  const projetoId = form.watch("projeto_id");
  const colaboradorId = form.watch("colaborador_id");
  const dataInicio = form.watch("data_inicio");
  const dataFim = form.watch("data_fim");

  // Carrega registro para edição
  const ausenciaQ = useQuery({
    queryKey: ["ausencia", editId],
    enabled: !!editId,
    queryFn: async (): Promise<AusenciaEdit | null> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(
          "id, empresa_id, projeto_id, colaborador_id, tipo, motivo, data_inicio, data_fim, observacoes, status, possui_anexo, arquivo_url, arquivo_nome, arquivo_mime, arquivo_tamanho",
        )
        .eq("id", editId!)
        .maybeSingle();
      if (error) throw error;
      return data as AusenciaEdit | null;
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
        data_fim: ausencia.data_fim,
        motivo: ausencia.motivo ?? "",
        observacoes: ausencia.observacoes ?? "",
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
    queryKey: ["colaborador-detalhe", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select(
          "id, nome_completo, matricula, cargo, cpf, ativo, empresa_id, projeto_id, empresa:empresas(nome), projeto:projetos(nome)",
        )
        .eq("id", colaboradorId)
        .maybeSingle();
      if (error) throw error;
      return data as ColabDetalhe | null;
    },
  });

  const dias = useMemo(() => {
    if (!dataInicio || !dataFim) return null;
    if (dataFim < dataInicio) return null;
    const a = new Date(dataInicio + "T00:00:00").getTime();
    const b = new Date(dataFim + "T00:00:00").getTime();
    return Math.floor((b - a) / 86400000) + 1;
  }, [dataInicio, dataFim]);

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
      let arquivo_url: string | null | undefined = undefined;
      let arquivo_nome: string | null | undefined = undefined;
      let arquivo_mime: string | null | undefined = undefined;
      let arquivo_tamanho: number | null | undefined = undefined;
      let arquivo_criado_por: string | null | undefined = undefined;
      let arquivo_criado_em: string | null | undefined = undefined;

      // Upload novo arquivo se houver
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
        motivo: values.motivo?.trim() ? values.motivo.trim() : null,
        data_inicio: values.data_inicio,
        data_fim: values.data_fim,
        observacoes: values.observacoes?.trim() ? values.observacoes.trim() : null,
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
          .update(updatePayload)
          .eq("id", editId)
          .eq("status", "PENDENTE"); // proteção adicional
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
        const { error } = await supabase.from("ausencias").insert(insertPayload);
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
      {bloqueado ? (
        <Card
          role="alert"
          className="border-amber-500/40 bg-amber-500/5 p-4 text-sm"
        >
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Este registro já foi lançado e não pode mais ser alterado.
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/70">
                Registros com status <strong>LANCADO</strong> são somente leitura.
                Use a visualização na listagem para consultar detalhes.
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
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isEdit ? (
            <>
              Editando registro com status{" "}
              <span className="font-medium text-foreground">PENDENTE</span>.
              Após marcar como lançado, a edição é bloqueada.
            </>
          ) : (
            <>
              Registre uma ausência. Todo lançamento nasce com status{" "}
              <span className="font-medium text-foreground">PENDENTE</span> até o RH
              efetuar o lançamento no sistema do cliente.
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
            className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]"
          >
            <Card className="p-5 space-y-5">
              <section className="space-y-4">
                <h2 className="text-sm font-semibold">Vínculo</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                                    ? "Selecione empresa"
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
                                    ? "Selecione projeto"
                                    : colabQ.isLoading
                                      ? "Carregando..."
                                      : colaboradores.length === 0
                                        ? "Sem colaboradores"
                                        : "Selecione"
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
              </section>

              <section className="space-y-4">
                <h2 className="text-sm font-semibold">Ausência</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <FormField
                    control={form.control}
                    name="tipo"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel>Tipo *</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => field.onChange(v as TipoAusencia)}
                          disabled={bloqueado}
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
                        <FormLabel>Data inicial *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={bloqueado} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="data_fim"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data final *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={bloqueado} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormItem>
                    <FormLabel>Dias</FormLabel>
                    <Input value={dias ?? ""} readOnly disabled placeholder="—" />
                  </FormItem>
                </div>

                <FormField
                  control={form.control}
                  name="motivo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo</FormLabel>
                      <FormControl>
                        <Input placeholder="Breve descrição" {...field} disabled={bloqueado} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="Opcional" {...field} disabled={bloqueado} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Anexo</h2>

                {anexoExistenteVisivel && (
                  <div className="flex items-center gap-3 rounded-md border p-3">
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
                    className={
                      "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-6 text-center text-sm transition " +
                      (dragOver
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/40")
                    }
                    role="button"
                    tabIndex={0}
                  >
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {anexoExistenteVisivel
                        ? "Substituir anexo (arraste ou clique)"
                        : "Arraste um arquivo ou clique para selecionar"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, PNG, JPG ou JPEG · até 10 MB
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
                  <div className="flex items-center gap-3 rounded-md border p-3">
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
                  <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
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
              </section>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate({ to: "/ausencias" })}
                  disabled={salvarMut.isPending}
                >
                  {bloqueado ? "Voltar" : "Cancelar"}
                </Button>
                {!bloqueado && (
                  <Button type="submit" disabled={salvarMut.isPending}>
                    {salvarMut.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {salvarMut.isPending
                      ? "Salvando..."
                      : isEdit
                        ? "Salvar alterações"
                        : "Registrar ausência"}
                  </Button>
                )}
              </div>
            </Card>

            <aside className="space-y-4">
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Colaborador</h3>
                </div>
                {!colaboradorId ? (
                  <p className="text-xs text-muted-foreground">
                    Selecione empresa, projeto e colaborador para ver o resumo aqui.
                  </p>
                ) : colabDetalheQ.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando...</p>
                ) : colab ? (
                  <dl className="grid grid-cols-3 gap-y-2 text-xs">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd className="col-span-2 font-medium">{colab.nome_completo}</dd>
                    <dt className="text-muted-foreground">Matrícula</dt>
                    <dd className="col-span-2 font-mono">{colab.matricula}</dd>
                    <dt className="text-muted-foreground">Empresa</dt>
                    <dd className="col-span-2">{colab.empresa?.nome ?? "—"}</dd>
                    <dt className="text-muted-foreground">Projeto</dt>
                    <dd className="col-span-2">{colab.projeto?.nome ?? "—"}</dd>
                    <dt className="text-muted-foreground">Cargo</dt>
                    <dd className="col-span-2">{colab.cargo ?? "—"}</dd>
                    <dt className="text-muted-foreground">CPF</dt>
                    <dd className="col-span-2">{colab.cpf ? formatCPF(colab.cpf) : "—"}</dd>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="col-span-2">
                      {colab.ativo ? (
                        <Badge
                          variant="secondary"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        >
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline">Inativo</Badge>
                      )}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Colaborador não encontrado.</p>
                )}
              </Card>
              <Card className="p-4 text-xs text-muted-foreground">
                <Label className="text-xs">Fluxo</Label>
                <p className="mt-1 leading-relaxed">
                  Empresa → Projeto → Colaborador → Tipo → Datas → Anexo → Salvar.
                  A ausência entra como <strong>PENDENTE</strong> e o RH marca como{" "}
                  <strong>LANCADO</strong> após efetuar o lançamento no sistema do
                  cliente. Após lançada, a edição é bloqueada.
                </p>
              </Card>
            </aside>
          </form>
        </fieldset>
      </Form>
    </AppShell>
  );
}
