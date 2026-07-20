import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  Hash,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Store,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
import {
  ARQUIVO_MAX_BYTES,
  ARQUIVO_MIMES,
  BUCKET_ATESTADOS,
  QUANTIDADE_DIAS_OPTIONS,
  TIPO_AUSENCIA_DETALHE,
  diasFromLabel,
  getSignedAtestadoUrl,
  tipoBaseFromDetalhe,
  type TipoAusencia,
} from "@/lib/ausencias";
import { formatTelefone } from "@/lib/br-format";
import {
  improveMotivo as improveMotivoFn,
  scoreCompliance as scoreComplianceFn,
  suggestMotivoFromCID as suggestMotivoFromCIDFn,
} from "@/lib/ai.functions";
import { createAusencia, updateAusencia } from "@/lib/ausencias.functions";
import { friendlyRbacError } from "@/lib/rbac/errors";

const formatPhoneBR = formatTelefone;

type SearchParams = { id?: string };

export const Route = createFileRoute("/_authenticated/nova-ausencia")({
  head: () => ({ meta: [{ title: "Nova Ausência · CRM MK9" }] }),
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const id = typeof search.id === "string" && search.id.length > 0 ? search.id : undefined;
    return { id };
  },
  component: NovaAusenciaPage,
});

type ColabMatch = {
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
  empresa: { id: string; nome: string; ativo: boolean } | null;
  projeto: { id: string; nome: string; ativo: boolean; codigo_protocolo: string | null } | null;
};

type AusenciaEdit = {
  id: string;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string;
  tipo: TipoAusencia;
  tipo_detalhe: string | null;
  dias_label: string | null;
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
  colaborador_id: z.string().uuid("Busque um colaborador pela matrícula."),
  empresa_id: z.string().uuid(),
  projeto_id: z.string().uuid(),
  tipo_ausencia_id: z.string().uuid("Selecione o tipo de ausência."),
  opcao_periodo_id: z.string().uuid("Selecione a quantidade / período."),
  data_inicio: z.string().min(1, "Informe a data da ausência."),
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

function useDebouncedValue<T>(value: T, delay = 800): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function NovaAusenciaPage() {
  const { profile, roles } = useSession();
  const podeCadastrar =
    roles.includes("super_admin") || roles.includes("rh") || roles.includes("supervisor");
  const isSupervisorOnly =
    roles.includes("supervisor") &&
    !roles.includes("super_admin") &&
    !roles.includes("rh");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = Route.useSearch();
  const isEdit = !!editId;

  // Escopo do supervisor: projetos vinculados
  const supervisorProjetosQ = useQuery({
    queryKey: ["supervisor-projetos-escopo", profile?.id ?? "anon"],
    enabled: !!profile?.id && isSupervisorOnly,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, ativo")
        .eq("ativo", true);
      if (error) throw error;
      // RLS já filtra apenas vinculados ao supervisor
      return (data ?? []) as Array<{ id: string; nome: string; ativo: boolean }>;
    },
  });
  const supervisorSemProjetos =
    isSupervisorOnly && supervisorProjetosQ.isSuccess && (supervisorProjetosQ.data?.length ?? 0) === 0;


  // Anexo
  const [file, setFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Matrícula & colaborador
  const [matriculaInput, setMatriculaInput] = useState("");
  const [colab, setColab] = useState<ColabMatch | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<ColabMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      colaborador_id: "",
      empresa_id: "",
      projeto_id: "",
      tipo_ausencia_id: "",
      opcao_periodo_id: "",
      data_inicio: "",
      localidade: "",
      loja_codigo_nome: "",
      cid: "",
      acidente_trabalho_trajeto: undefined as unknown as "sim",
      motivo: "",
    },
  });

  const colaboradorId = form.watch("colaborador_id");
  const dataInicio = form.watch("data_inicio");
  const tipoAusenciaId = form.watch("tipo_ausencia_id");
  const opcaoPeriodoId = form.watch("opcao_periodo_id");
  const motivo = form.watch("motivo") ?? "";
  const cid = form.watch("cid") ?? "";

  // ============= Tipos e opções (DB-driven) =============
  const tiposQ = useQuery({
    queryKey: ["tipos_ausencia_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_ausencia" as never)
        .select("id, codigo, nome, ativo, exige_documento, permite_cid, permite_acidente, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        codigo: string;
        nome: string;
        ativo: boolean;
        exige_documento: boolean;
        permite_cid: boolean;
        permite_acidente: boolean;
        ordem: number;
      }>;
    },
  });

  const opcoesPorTipoQ = useQuery({
    queryKey: ["opcoes_por_tipo", tipoAusenciaId],
    enabled: !!tipoAusenciaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_opcoes_periodo_por_tipo" as never, {
        _tipo_id: tipoAusenciaId,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        codigo: string;
        nome: string;
        quantidade_dias: number | null;
        tipo_periodo: "DIAS" | "HORAS" | "MEIO_PERIODO" | "PERIODO_INTEGRAL";
        ordem: number;
      }>;
    },
  });

  const tipoSelecionado = useMemo(
    () => tiposQ.data?.find((t) => t.id === tipoAusenciaId) ?? null,
    [tiposQ.data, tipoAusenciaId],
  );
  const opcaoSelecionada = useMemo(
    () => opcoesPorTipoQ.data?.find((o) => o.id === opcaoPeriodoId) ?? null,
    [opcoesPorTipoQ.data, opcaoPeriodoId],
  );
  const [tipoPopoverOpen, setTipoPopoverOpen] = useState(false);

  // Limpa período se não for válido para o novo tipo
  useEffect(() => {
    if (!opcoesPorTipoQ.data || !opcaoPeriodoId) return;
    if (!opcoesPorTipoQ.data.some((o) => o.id === opcaoPeriodoId)) {
      form.setValue("opcao_periodo_id", "", { shouldValidate: false });
    }
  }, [opcoesPorTipoQ.data, opcaoPeriodoId, form]);

  const diasNumericos = opcaoSelecionada?.quantidade_dias ?? 1;
  const diasNumericoDisponivel = (opcaoSelecionada?.quantidade_dias ?? null) !== null;

  const dataFim = useMemo(
    () => (dataInicio && diasNumericoDisponivel ? addDaysISO(dataInicio, diasNumericos - 1) : ""),
    [dataInicio, diasNumericos, diasNumericoDisponivel],
  );
  const dataRetorno = useMemo(
    () => (dataInicio && diasNumericoDisponivel ? addDaysISO(dataInicio, diasNumericos) : ""),
    [dataInicio, diasNumericos, diasNumericoDisponivel],
  );

  // Carrega ausência para edição
  const ausenciaQ = useQuery({
    queryKey: ["ausencia", editId],
    enabled: !!editId,
    queryFn: async (): Promise<AusenciaEdit | null> => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(
          "id, empresa_id, projeto_id, colaborador_id, tipo, tipo_detalhe, dias_label, motivo, data_inicio, data_fim, dias, localidade, cid, loja_codigo_nome, acidente_trabalho_trajeto, status, possui_anexo, arquivo_url, arquivo_nome, arquivo_mime, arquivo_tamanho",
        )
        .eq("id", editId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AusenciaEdit | null;
    },
  });

  const ausencia = ausenciaQ.data ?? null;
  const bloqueado = isEdit && ausencia?.status === "LANCADO";

  const applyColab = useCallback(
    (c: ColabMatch) => {
      setColab(c);
      setMatriculaInput(c.matricula);
      form.setValue("colaborador_id", c.id, { shouldValidate: true });
      form.setValue("empresa_id", c.empresa_id, { shouldValidate: true });
      form.setValue("projeto_id", c.projeto_id, { shouldValidate: true });
    },
    [form],
  );

  // Prefill em edição: carrega colaborador
  useEffect(() => {
    if (!(isEdit && ausencia && !prefilled)) return;
    (async () => {
      const { data } = await supabase
        .from("colaboradores")
        .select(
          "id, nome_completo, matricula, email, telefone, whatsapp, supervisor_nome, supervisor_telefone, supervisor_email, ativo, empresa_id, projeto_id, empresa:empresas(id, nome, ativo), projeto:projetos(id, nome, ativo, codigo_protocolo)",
        )
        .eq("id", ausencia.colaborador_id)
        .maybeSingle();
      if (data) {
        applyColab(data as unknown as ColabMatch);
      }
      // Resolve tipo_ausencia_id / opcao_periodo_id a partir do snapshot ou do enum legado.
      const tipoCodPorEnum: Record<TipoAusencia, string> = {
        FALTA: "FALTA_JUSTIFICADA",
        ATESTADO: "ATESTADO_MEDICO",
        DECLARACAO: "DECLARACAO_COMPARECIMENTO",
        SUSPENSAO: "SUSPENSAO_DISCIPLINAR",
        OUTROS: "OUTROS",
      };
      const ausRow = ausencia as unknown as {
        tipo_ausencia_id: string | null;
        opcao_periodo_id: string | null;
        tipo_ausencia_codigo: string | null;
        opcao_periodo_codigo: string | null;
      };
      let tipoId = ausRow.tipo_ausencia_id ?? "";
      if (!tipoId) {
        const cod = ausRow.tipo_ausencia_codigo ?? tipoCodPorEnum[ausencia.tipo];
        const { data: t } = await supabase
          .from("tipos_ausencia" as never)
          .select("id")
          .eq("codigo", cod)
          .maybeSingle();
        tipoId = (t as { id?: string } | null)?.id ?? "";
      }
      let opcaoId = ausRow.opcao_periodo_id ?? "";
      if (!opcaoId) {
        const dias = ausencia.dias || 1;
        const cod = ausRow.opcao_periodo_codigo ?? `${dias}_${dias === 1 ? "DIA" : "DIAS"}`;
        const { data: o } = await supabase
          .from("opcoes_periodo_ausencia" as never)
          .select("id")
          .eq("codigo", cod)
          .maybeSingle();
        opcaoId = (o as { id?: string } | null)?.id ?? "";
      }

      form.reset({
        colaborador_id: ausencia.colaborador_id,
        empresa_id: ausencia.empresa_id,
        projeto_id: ausencia.projeto_id,
        tipo_ausencia_id: tipoId,
        opcao_periodo_id: opcaoId,
        data_inicio: ausencia.data_inicio,
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
    })();
  }, [isEdit, ausencia, prefilled, form, applyColab]);


  async function searchMatricula(rawValue?: string) {
    const val = (rawValue ?? matriculaInput).trim();
    if (!val) {
      toast.error("Digite a matrícula.");
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("colaboradores")
        .select(
          "id, nome_completo, matricula, email, telefone, whatsapp, supervisor_nome, supervisor_telefone, supervisor_email, ativo, empresa_id, projeto_id, empresa:empresas(id, nome, ativo), projeto:projetos(id, nome, ativo, codigo_protocolo)",
        )
        .eq("matricula", val)
        .eq("ativo", true);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ColabMatch[];
      if (rows.length === 0) {
        setColab(null);
        form.setValue("colaborador_id", "");
        form.setValue("empresa_id", "");
        form.setValue("projeto_id", "");
        toast.error("Matrícula não encontrada.", {
          description: "Verifique o número ou cadastre o colaborador em Colaboradores.",
        });
      } else if (rows.length === 1) {
        applyColab(rows[0]);
        toast.success("Colaborador encontrado.");
      } else {
        setMatchCandidates(rows);
      }
    } catch (e) {
      toast.error("Erro ao buscar colaborador.", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSearching(false);
    }
  }

  function clearColab() {
    setColab(null);
    setMatriculaInput("");
    form.setValue("colaborador_id", "");
    form.setValue("empresa_id", "");
    form.setValue("projeto_id", "");
  }

  // Preview de arquivo
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

  // ============= IA (OpenRouter) =============
  const suggestMotivoFromCID = useServerFn(suggestMotivoFromCIDFn);
  const scoreComplianceServer = useServerFn(scoreComplianceFn);
  const improveMotivo = useServerFn(improveMotivoFn);

  const cidSuggestMut = useMutation({
    mutationFn: (c: string) => suggestMotivoFromCID({ data: { cid: c } }),
    onSuccess: (r) => {
      if (r?.motivo) {
        form.setValue("motivo", r.motivo, { shouldValidate: true });
        toast.success("Motivo sugerido a partir do CID.");
      }
    },
    onError: (e) =>
      toast.error("Não foi possível sugerir motivo pelo CID.", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  const improveMut = useMutation({
    mutationFn: (m: string) => improveMotivo({ data: { motivo: m } }),
    onSuccess: (r) => {
      if (r?.motivo) {
        form.setValue("motivo", r.motivo, { shouldValidate: true });
        toast.success("Motivo aprimorado com IA.");
      }
    },
    onError: (e) =>
      toast.error("Não foi possível aprimorar o motivo.", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  const debouncedMotivo = useDebouncedValue(motivo, 900);
  const complianceQ = useQuery({
    queryKey: ["compliance", debouncedMotivo],
    enabled: debouncedMotivo.trim().length >= 5 && !bloqueado,
    queryFn: () => scoreComplianceServer({ data: { motivo: debouncedMotivo } }),
    staleTime: 60_000,
  });
  const compliance = complianceQ.data;

  // CID → sugere motivo apenas quando motivo vazio e CID válido (blur)
  function handleCidBlur() {
    const c = cid.trim().toUpperCase();
    if (!c || c.length < 2) return;
    if (motivo.trim().length > 0) return;
    if (cidSuggestMut.isPending) return;
    cidSuggestMut.mutate(c);
  }

  // ============= Submit (server functions com hardening RBAC) =============
  const createFn = useServerFn(createAusencia);
  const updateFn = useServerFn(updateAusencia);

  const salvarMut = useMutation({
    mutationFn: async (values: FormData) => {
      const dataInicioIso = values.data_inicio;

      let arquivo_url: string | null | undefined = undefined;
      let arquivo_nome: string | null | undefined = undefined;
      let arquivo_mime: string | null | undefined = undefined;
      let arquivo_tamanho: number | null | undefined = undefined;

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
      } else if (isEdit && removeExistingFile) {
        arquivo_url = null;
        arquivo_nome = null;
        arquivo_mime = null;
        arquivo_tamanho = null;
      }

      const payload = {
        colaborador_id: values.colaborador_id,
        tipo_ausencia_id: values.tipo_ausencia_id,
        opcao_periodo_id: values.opcao_periodo_id,
        data_inicio: dataInicioIso,
        localidade: values.localidade.trim(),
        loja_codigo_nome: values.loja_codigo_nome.trim(),
        cid: values.cid && values.cid.trim() ? values.cid.trim().toUpperCase() : null,
        acidente_trabalho_trajeto: values.acidente_trabalho_trajeto === "sim",
        motivo: values.motivo.trim(),
        arquivo_url: arquivo_url ?? null,
        arquivo_nome: arquivo_nome ?? null,
        arquivo_mime: arquivo_mime ?? null,
        arquivo_tamanho: arquivo_tamanho ?? null,
      };

      if (isEdit && editId) {
        await updateFn({ data: { ...payload, id: editId } });
      } else {
        await createFn({ data: payload });
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
      const friendly = friendlyRbacError(err);
      toast.error(friendly.title, {
        description: friendly.description ?? (friendly.correlationId ? `ref: ${friendly.correlationId.slice(0, 8)}` : undefined),
      });
    },
  });

  if (!podeCadastrar) {
    return (
      <AppShell title="Nova Ausência" breadcrumb={["CRM", "Nova Ausência"]}>
        <Card className="p-8 text-sm text-muted-foreground">
          Seu papel não permite cadastrar novas ausências.
        </Card>
      </AppShell>
    );
  }

  if (isEdit && ausenciaQ.isLoading) {
    return (
      <AppShell title="Editar Ausência" breadcrumb={["CRM", "Ausências", "Editar"]}>
        <Card className="p-8 text-sm text-muted-foreground">Carregando registro…</Card>
      </AppShell>
    );
  }

  if (isEdit && !ausencia) {
    return (
      <AppShell title="Editar Ausência" breadcrumb={["CRM", "Ausências", "Editar"]}>
        <Card className="p-8 text-sm text-muted-foreground">Registro não encontrado.</Card>
      </AppShell>
    );
  }

  const title = isEdit ? "Editar Ausência" : "Nova Ausência";
  const crumb = isEdit ? ["CRM", "Ausências", "Editar"] : ["CRM", "Nova Ausência"];
  const anexoExistenteVisivel =
    isEdit && ausencia?.possui_anexo && !file && !removeExistingFile;

  const complianceColor =
    !compliance || compliance.score === 0
      ? "text-muted-foreground"
      : compliance.score >= 75
        ? "text-emerald-600 dark:text-emerald-400"
        : compliance.score >= 45
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <AppShell title={title} breadcrumb={crumb}>
      <div className="mx-auto w-full max-w-5xl">
        <Card className="overflow-hidden p-0 shadow-lg">
          {/* Cabeçalho em gradiente MK9 */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 p-6 text-white sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <ClipboardList className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  Lançamento de Faltas e Atestados
                </h1>
                <p className="mt-1 text-sm text-white/85">Sistema de registro conforme CLT</p>
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
            ) : null}

            {supervisorSemProjetos && !isEdit ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
              >
                <ShieldCheck className="mt-0.5 h-5 w-5 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">
                    Você ainda não possui projetos vinculados. Procure um administrador.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    O cadastro de ausências está indisponível até que o vínculo seja realizado.
                  </p>
                </div>
              </div>
            ) : null}


            <Form {...form}>
              <fieldset disabled={bloqueado || (supervisorSemProjetos && !isEdit)} className="contents">
                <form
                  onSubmit={form.handleSubmit((v) => {
                    if (salvarMut.isPending || bloqueado) return;
                    if (supervisorSemProjetos && !isEdit) {
                      toast.error("Sem projetos vinculados. Procure um administrador.");
                      return;
                    }
                    if (!colab && !isEdit) {
                      toast.error("Busque um colaborador pela matrícula.");
                      return;
                    }
                    if (colab && !colab.projeto?.codigo_protocolo) {
                      toast.error(
                        "O projeto do colaborador está sem código de protocolo. Peça a um administrador para cadastrar em Configurações → Projetos.",
                      );
                      return;
                    }
                    salvarMut.mutate(v);
                  })}
                  className="space-y-6"
                >
                  {/* ============= SEÇÃO 1: Dados do Colaborador ============= */}
                  <Card className="border border-border/60 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h2 className="text-base font-semibold">Dados do Colaborador</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {/* E-mail */}
                      <ReadonlyField
                        label="E-mail"
                        icon={Mail}
                        value={colab?.email ?? ""}
                        placeholder="colaborador@empresa.com"
                        href={colab?.email ? `mailto:${colab.email}` : undefined}
                      />

                      {/* Matrícula (input principal) */}
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-sm">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          Matrícula <span className="text-red-500">*</span>
                        </Label>
                        <p className="text-[11px] leading-tight text-muted-foreground">
                          Digite a matrícula do colaborador. Se existir em mais de uma empresa,
                          o sistema solicitará a seleção.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={matriculaInput}
                            onChange={(e) => setMatriculaInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                searchMatricula();
                              }
                            }}
                            placeholder="Ex: 12 ou 123456"
                            disabled={bloqueado || isEdit}
                          />
                          {colab ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={clearColab}
                              disabled={bloqueado || isEdit}
                              aria-label="Limpar"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => searchMatricula()}
                              disabled={searching || bloqueado || isEdit}
                              aria-label="Buscar"
                            >
                              {searching ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                        {form.formState.errors.colaborador_id && !colab && (
                          <p className="text-xs text-red-500">
                            {form.formState.errors.colaborador_id.message}
                          </p>
                        )}
                      </div>

                      {/* Nome Completo */}
                      <ReadonlyField
                        label="Nome Completo"
                        required
                        icon={UserIcon}
                        value={colab?.nome_completo ?? ""}
                        placeholder="Nome completo do colaborador"
                      />

                      {/* Telefone */}
                      <ReadonlyField
                        label="Telefone do Colaborador"
                        required
                        icon={Phone}
                        value={colab?.telefone ? formatPhoneBR(colab.telefone) : ""}
                        placeholder="(XX) XXXXX-XXXX"
                        href={colab?.telefone ? `tel:+55${colab.telefone}` : undefined}
                      />

                      {/* WhatsApp */}
                      <div className="space-y-1.5">
                        <ReadonlyField
                          label="WhatsApp Alternativo"
                          icon={MessageSquare}
                          hint="Opcional — para contato adicional"
                          value={colab?.whatsapp ? formatPhoneBR(colab.whatsapp) : ""}
                          placeholder="(XX) XXXXX-XXXX"
                          href={colab?.whatsapp ? `https://wa.me/55${colab.whatsapp}` : undefined}
                          external
                        />
                      </div>

                      {/* Empresa */}
                      <ReadonlyField
                        label="Empresa"
                        required
                        icon={Building2}
                        value={colab?.empresa?.nome ?? ""}
                        placeholder="Selecione..."
                      />

                      {/* Supervisor */}
                      <ReadonlyField
                        label="Supervisor(a)"
                        required
                        icon={UserIcon}
                        value={colab?.supervisor_nome ?? ""}
                        placeholder="Selecione..."
                      />

                      {/* Telefone do Supervisor */}
                      <ReadonlyField
                        label="Telefone do Supervisor"
                        required
                        icon={Phone}
                        value={
                          colab?.supervisor_telefone
                            ? formatPhoneBR(colab.supervisor_telefone)
                            : ""
                        }
                        placeholder="(XX) XXXXX-XXXX"
                        href={
                          colab?.supervisor_telefone
                            ? `tel:+55${colab.supervisor_telefone}`
                            : undefined
                        }
                      />

                      {/* Projeto */}
                      <ReadonlyField
                        label="Projeto"
                        required
                        icon={ClipboardList}
                        value={colab?.projeto?.nome ?? ""}
                        placeholder="Selecione..."
                      />
                    </div>

                    {colab && colab.projeto && !colab.projeto.codigo_protocolo && (
                      <div
                        role="alert"
                        className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
                      >
                        <span className="font-semibold">Atenção:</span>
                        <span>
                          O projeto <strong>{colab.projeto.nome}</strong> não possui{" "}
                          <strong>código de protocolo</strong>. Peça a um administrador
                          para cadastrá-lo em Configurações → Projetos antes de lançar
                          esta ausência.
                        </span>
                      </div>
                    )}

                    {colab && colab.supervisor_email && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        E-mail do supervisor:{" "}
                        <a
                          href={`mailto:${colab.supervisor_email}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {colab.supervisor_email}
                        </a>
                      </p>
                    )}
                  </Card>

                  {/* ============= SEÇÃO 2: Informações da Ausência ============= */}
                  <Card className="border border-border/60 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h2 className="text-base font-semibold">Informações da Ausência</h2>
                    </div>

                    {/* Localidade full-width */}
                    <FormField
                      control={form.control}
                      name="localidade"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel className="flex items-center gap-1.5">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            Localidade <span className="text-red-500">*</span>
                          </FormLabel>
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

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="tipo_ausencia_id"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>
                              Tipo de Ausência <span className="text-red-500">*</span>
                            </FormLabel>
                            <Popover open={tipoPopoverOpen} onOpenChange={setTipoPopoverOpen}>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "w-full justify-between font-normal",
                                      !field.value && "text-muted-foreground",
                                    )}
                                    disabled={tiposQ.isLoading}
                                  >
                                    {tipoSelecionado?.nome ?? "Selecione o tipo..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-[--radix-popover-trigger-width] p-0"
                                align="start"
                              >
                                <Command>
                                  <CommandInput placeholder="Buscar tipo..." />
                                  <CommandList>
                                    <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                                    <CommandGroup>
                                      {(tiposQ.data ?? []).map((t) => (
                                        <CommandItem
                                          key={t.id}
                                          value={t.nome}
                                          onSelect={() => {
                                            field.onChange(t.id);
                                            form.setValue("opcao_periodo_id", "", {
                                              shouldValidate: false,
                                            });
                                            setTipoPopoverOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              field.value === t.id ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          {t.nome}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="data_inicio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Data da Ausência <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="opcao_periodo_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Quantidade / Período <span className="text-red-500">*</span>
                            </FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              disabled={!tipoAusenciaId || opcoesPorTipoQ.isLoading}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      tipoAusenciaId
                                        ? opcoesPorTipoQ.isLoading
                                          ? "Carregando..."
                                          : "Selecione..."
                                        : "Selecione o tipo primeiro"
                                    }
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-72">
                                {(opcoesPorTipoQ.data ?? []).map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.nome}
                                  </SelectItem>
                                ))}
                                {tipoAusenciaId &&
                                  !opcoesPorTipoQ.isLoading &&
                                  (opcoesPorTipoQ.data?.length ?? 0) === 0 && (
                                    <div className="px-2 py-3 text-xs text-muted-foreground">
                                      Nenhum período configurado para este tipo.
                                    </div>
                                  )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />



                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          Data de Retorno
                        </Label>
                        <div className="relative">
                          <Input
                            readOnly
                            disabled
                            value={dataRetorno ? formatDatePt(dataRetorno) : ""}
                            placeholder="Indefinido"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
                            Auto
                          </span>
                        </div>
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
                            <FormLabel className="flex items-center gap-1.5">
                              <Stethoscope className="h-4 w-4 text-muted-foreground" />
                              CID
                            </FormLabel>
                            <p className="text-[11px] leading-tight text-muted-foreground">
                              Digite o código CID para preencher o motivo automaticamente
                            </p>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  placeholder="EX: J00, F32, M54"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value.toUpperCase().replace(/\s+/g, ""),
                                    )
                                  }
                                  onBlur={() => {
                                    field.onBlur();
                                    handleCidBlur();
                                  }}
                                  maxLength={20}
                                />
                                {cidSuggestMut.isPending && (
                                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="loja_codigo_nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1.5">
                              <Store className="h-4 w-4 text-muted-foreground" />
                              Código ou Nome da Loja{" "}
                              <span className="text-red-500">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                maxLength={150}
                                placeholder="Ex: 001 ou Nome da Loja"
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
                            <FormLabel className="flex items-center gap-1.5">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              Foi Acidente de Trabalho/Trajeto?{" "}
                              <span className="text-red-500">*</span>
                            </FormLabel>
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
                              <FormLabel className="flex items-center gap-1.5">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                Motivo da Ausência <span className="text-red-500">*</span>
                              </FormLabel>
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

                    {/* Compliance Score + botão Melhorar com IA */}
                    <div className="mt-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <ShieldCheck className={`h-5 w-5 shrink-0 ${complianceColor}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              Compliance Score:{" "}
                              <span className={complianceColor}>
                                {complianceQ.isFetching
                                  ? "Analisando..."
                                  : compliance && compliance.score > 0
                                    ? `${compliance.score}/100 · ${compliance.label}`
                                    : "Aguardando texto"}
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {compliance?.feedback ||
                                "Descreva o motivo para análise em tempo real via OpenRouter."}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                          IA · Tempo Real
                        </span>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            improveMut.isPending || motivo.trim().length < 5 || bloqueado
                          }
                          onClick={() => improveMut.mutate(motivo)}
                          className="gap-2 border-blue-500/40 text-blue-700 hover:bg-blue-500/10 dark:text-blue-300"
                        >
                          {improveMut.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Melhorar com IA
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* ============= SEÇÃO 3: Anexar Documento ============= */}
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={abrirAnexoExistente}
                        >
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
                          PDF, JPG ou PNG (máx. 10MB)
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
                        disabled={
                          salvarMut.isPending ||
                          (!isEdit && !!colab && !colab.projeto?.codigo_protocolo)
                        }
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

            <p className="text-center text-xs text-muted-foreground">
              Sistema de Gestão de Ausências • Conforme legislação CLT vigente
            </p>
          </div>
        </Card>
      </div>

      {/* Dialog: múltiplas empresas para a mesma matrícula */}
      <Dialog
        open={!!matchCandidates}
        onOpenChange={(open) => {
          if (!open) setMatchCandidates(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
              A matrícula <strong>{matriculaInput}</strong> existe em mais de uma empresa.
              Selecione qual colaborador deseja lançar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {matchCandidates?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  applyColab(c);
                  setMatchCandidates(null);
                }}
                className="flex w-full flex-col items-start rounded-md border p-3 text-left hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">{c.empresa?.nome ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {c.nome_completo} · Projeto: {c.projeto?.nome ?? "—"}
                </span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMatchCandidates(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ============= Read-only field ================
type ReadonlyFieldProps = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  href?: string;
  external?: boolean;
};

function ReadonlyField({
  label,
  icon: Icon,
  value,
  placeholder,
  required,
  hint,
  href,
  external,
}: ReadonlyFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      {value && href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="block"
        >
          <Input
            readOnly
            value={value}
            placeholder={placeholder}
            className="cursor-pointer bg-muted/40 hover:bg-muted/60"
          />
        </a>
      ) : (
        <Input readOnly value={value} placeholder={placeholder} className="bg-muted/40" />
      )}
    </div>
  );
}
