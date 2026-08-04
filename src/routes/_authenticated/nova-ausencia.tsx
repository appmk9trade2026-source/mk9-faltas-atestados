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
import { Skeleton } from "@/components/ui/skeleton";
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
import { 
  createAusencia, 
  updateAusencia, 
  checkConflitosAusencia,
  substituirAusenciaConflito
} from "@/lib/ausencias.functions";


import { friendlyRbacError, parseRbacError } from "@/lib/rbac/errors";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useProjetosAtivosPorEmpresa } from "@/hooks/use-projetos";
import { useSupervisoresLancamento } from "@/hooks/use-supervisores-lancamento";
import { ConflitoAusenciaDialog } from "@/components/ausencias/conflito-ausencia-dialog";


import { DadosColaboradorFields } from "@/components/ausencias/dados-colaborador-fields";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BuscaSkeleton,
  BuscaStatus,
  CoachMark,
  EstadoVazioBusca,
  FiltroChips,
  useCoachMark,
  type BuscaEstado,
  type FiltroChip,
} from "@/components/busca/busca-assistida";
import { logEvent } from "@/lib/observability";

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
  colaborador_id: string | null;
  origem_registro: "AUTOMATICO" | "MANUAL" | null;
  manual_motivo: string | null;
  manual_nome: string | null;
  manual_matricula: string | null;
  manual_telefone: string | null;
  manual_whatsapp: string | null;
  manual_email: string | null;
  manual_supervisor_nome: string | null;
  manual_supervisor_telefone: string | null;

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

/**
 * Motivo fixo do lançamento manual: o operador não escolhe nem detalha — a origem
 * "colaborador não localizado pela matrícula informada" é registrada na auditoria.
 */
const MANUAL_MOTIVO_PADRAO = "COLABORADOR_NAO_ENCONTRADO" as const;

const schema = z
  .object({
    modo_manual: z.boolean(),
    colaborador_id: z.string().optional().or(z.literal("")),
    empresa_id: z.string().optional().or(z.literal("")),
    projeto_id: z.string().optional().or(z.literal("")),
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
    // Preenchimento manual — mesmos campos do formulário padrão
    manual_nome: z.string().max(150).optional().or(z.literal("")),
    manual_matricula: z.string().max(50).optional().or(z.literal("")),
    manual_telefone: z.string().max(20).optional().or(z.literal("")),
    manual_whatsapp: z.string().max(20).optional().or(z.literal("")),
    manual_email: z.string().max(150).optional().or(z.literal("")),
    manual_supervisor_nome: z.string().max(150).optional().or(z.literal("")),
    manual_supervisor_telefone: z.string().max(20).optional().or(z.literal("")),
    /** Supervisor canônico (obrigatório para Coordenador — validado na submissão). */
    manual_supervisor_usuario_id: z.string().uuid().optional().or(z.literal("")),

  })
  .superRefine((v, ctx) => {
    const req = (path: keyof typeof v, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (!v.modo_manual) {
      if (!v.colaborador_id) req("colaborador_id", "Busque um colaborador pela matrícula.");
      return;
    }
    if (!v.empresa_id) req("empresa_id", "Selecione a empresa.");
    if (!v.projeto_id) req("projeto_id", "Selecione o projeto.");
    if ((v.manual_nome ?? "").trim().length < 3) {
      req("manual_nome", "Informe o nome completo (mínimo 3 caracteres).");
    }
    if (!(v.manual_matricula ?? "").trim()) req("manual_matricula", "Informe a matrícula.");
    if (!(v.manual_telefone ?? "").trim()) {
      req("manual_telefone", "Informe o telefone do colaborador.");
    }
    if (!(v.manual_supervisor_nome ?? "").trim()) {
      req("manual_supervisor_nome", "Informe o supervisor(a).");
    }
    if (!(v.manual_supervisor_telefone ?? "").trim()) {
      req("manual_supervisor_telefone", "Informe o telefone do supervisor.");
    }
    const email = (v.manual_email ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) req("manual_email", "E-mail inválido.");
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
  const { profile, roles, loading: sessionLoading } = useSession();
  const podeCadastrar =
    roles.includes("super_admin") || roles.includes("rh") || roles.includes("supervisor") || roles.includes("coordenador");
  const isSupervisorOnly =
    roles.includes("supervisor") &&
    !roles.includes("super_admin") &&
    !roles.includes("rh") &&
    !roles.includes("coordenador");
  /**
   * Coordenador "puro": lança dentro da própria hierarquia (equipe de
   * supervisores). Papéis privilegiados (super_admin/rh) mantêm o fluxo atual.
   */
  const isCoordenadorEscopo =
    roles.includes("coordenador") &&
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
  // Busca já executada e sem resultados → habilita o preenchimento manual
  const [naoEncontrado, setNaoEncontrado] = useState(false);


  // UX de busca assistida (auto-pesquisa com debounce + feedback visual)
  const [buscaEstado, setBuscaEstado] = useState<BuscaEstado>("idle");
  const matriculaRef = useRef<HTMLInputElement>(null);
  const ultimaBuscaRef = useRef<string>("");
  const coach = useCoachMark("mk9.coach.nova-ausencia.busca.v1");

  // Campos específicos de Acidente de Trabalho (categoria ACIDENTES).
  // Só entram no payload quando o tipo selecionado for ACIDENTE_TRABALHO.
  const [acidenteData, setAcidenteData] = useState<string>("");
  const [acidenteHora, setAcidenteHora] = useState<string>("");
  const [acidenteLocal, setAcidenteLocal] = useState<string>("");
  const [acidenteDescricao, setAcidenteDescricao] = useState<string>("");
  const [acidenteAtendMedico, setAcidenteAtendMedico] = useState<boolean | null>(null);
  const [acidenteAfastamento, setAcidenteAfastamento] = useState<boolean | null>(null);
  const [acidenteDiasAfast, setAcidenteDiasAfast] = useState<string>("");
  const [acidenteCatEmitida, setAcidenteCatEmitida] = useState<boolean | null>(null);
  const [acidenteObs, setAcidenteObs] = useState<string>("");

  // Conflitos de Ausência
  const [conflitos, setConflitos] = useState<any[]>([]);
  const [conflitoDialogOpen, setConflitoDialogOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormData | null>(null);



  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      modo_manual: false,
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
      manual_nome: "",
      manual_matricula: "",
      manual_telefone: "",
      manual_whatsapp: "",
      manual_email: "",
      manual_supervisor_nome: "",
      manual_supervisor_telefone: "",
      manual_supervisor_usuario_id: "",
    },
  });

  const colaboradorId = form.watch("colaborador_id");
  const dataInicio = form.watch("data_inicio");
  const tipoAusenciaId = form.watch("tipo_ausencia_id");
  const opcaoPeriodoId = form.watch("opcao_periodo_id");
  const motivo = form.watch("motivo") ?? "";
  const cid = form.watch("cid") ?? "";
  const modoManual = form.watch("modo_manual");
  const manualEmpresaId = form.watch("empresa_id") ?? "";
  const manualProjetoId = form.watch("projeto_id") ?? "";

  /**
   * Supervisores permitidos ao usuário. O banco resolve o escopo
   * (`supervisores_para_lancamento`): Coordenador vê apenas a própria equipe.
   * No modo manual a lista é restrita ao projeto escolhido.
   */
  const supervisoresQ = useSupervisoresLancamento(
    modoManual ? manualProjetoId || null : null,
    isCoordenadorEscopo,
  );
  const supervisoresDisponiveis = supervisoresQ.data ?? [];

  // Trocar o projeto invalida um supervisor que pode não pertencer mais à lista.
  useEffect(() => {
    if (!isCoordenadorEscopo || !modoManual) return;
    const atual = form.getValues("manual_supervisor_usuario_id");
    if (!atual) return;
    if (supervisoresQ.isSuccess && !supervisoresDisponiveis.some((s) => s.id === atual)) {
      form.setValue("manual_supervisor_usuario_id", "");
      form.setValue("manual_supervisor_nome", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualProjetoId, supervisoresQ.isSuccess, supervisoresQ.dataUpdatedAt]);


  

  // Empresas e projetos disponíveis para o lançamento manual (RLS já filtra o escopo).
  const empresasManualQ = useQuery({
    queryKey: ["empresas-manual-ausencia", profile?.id ?? "anon"],
    enabled: modoManual,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });
  const projetosManualQ = useProjetosAtivosPorEmpresa(modoManual ? manualEmpresaId : null);


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
          "id, empresa_id, projeto_id, colaborador_id, origem_registro, manual_motivo, manual_nome, manual_matricula, manual_telefone, manual_whatsapp, manual_email, manual_supervisor_nome, manual_supervisor_telefone, tipo, tipo_detalhe, dias_label, motivo, data_inicio, data_fim, dias, localidade, cid, loja_codigo_nome, acidente_trabalho_trajeto, status, possui_anexo, arquivo_url, arquivo_nome, arquivo_mime, arquivo_tamanho, acidente_data, acidente_hora, acidente_local, acidente_descricao, acidente_atendimento_medico, acidente_houve_afastamento, acidente_dias_afastamento_inicial, acidente_cat_emitida, acidente_observacoes",
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

  // Prefill em edição: carrega colaborador (quando houver vínculo)
  useEffect(() => {
    if (!(isEdit && ausencia && !prefilled)) return;
    (async () => {
      if (ausencia.colaborador_id) {
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
      } else {
        setMatriculaInput(ausencia.manual_matricula ?? "");
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
        modo_manual: ausencia.origem_registro === "MANUAL",
        colaborador_id: ausencia.colaborador_id ?? "",
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
        manual_nome: ausencia.manual_nome ?? "",
        manual_matricula: ausencia.manual_matricula ?? "",
        manual_telefone: ausencia.manual_telefone ?? "",
        manual_whatsapp: ausencia.manual_whatsapp ?? "",
        manual_email: ausencia.manual_email ?? "",
        manual_supervisor_nome: ausencia.manual_supervisor_nome ?? "",
        manual_supervisor_telefone: ausencia.manual_supervisor_telefone ?? "",
      });

      const a = ausencia as unknown as {
        acidente_data?: string | null; acidente_hora?: string | null;
        acidente_local?: string | null; acidente_descricao?: string | null;
        acidente_atendimento_medico?: boolean | null; acidente_houve_afastamento?: boolean | null;
        acidente_dias_afastamento_inicial?: number | null; acidente_cat_emitida?: boolean | null;
        acidente_observacoes?: string | null;
      };
      setAcidenteData(a.acidente_data ?? "");
      setAcidenteHora((a.acidente_hora ?? "").slice(0, 5));
      setAcidenteLocal(a.acidente_local ?? "");
      setAcidenteDescricao(a.acidente_descricao ?? "");
      setAcidenteAtendMedico(a.acidente_atendimento_medico ?? null);
      setAcidenteAfastamento(a.acidente_houve_afastamento ?? null);
      setAcidenteDiasAfast(a.acidente_dias_afastamento_inicial != null ? String(a.acidente_dias_afastamento_inicial) : "");
      setAcidenteCatEmitida(a.acidente_cat_emitida ?? null);
      setAcidenteObs(a.acidente_observacoes ?? "");
      setPrefilled(true);

    })();
  }, [isEdit, ausencia, prefilled, form, applyColab]);


  async function searchMatricula(rawValue?: string, origem: "auto" | "manual" = "manual") {
    const val = (rawValue ?? matriculaInput).trim();
    if (!val) {
      if (origem === "manual") toast.error("Digite a matrícula.");
      return;
    }
    ultimaBuscaRef.current = val;
    const inicio = performance.now();
    setSearching(true);
    setBuscaEstado("carregando");
    let resultado: "ok" | "erro" = "ok";
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
        if (!form.getValues("modo_manual")) {
          form.setValue("empresa_id", "");
          form.setValue("projeto_id", "");
        }
        setNaoEncontrado(true);
        if (origem === "manual") {
          toast.error("Matrícula não encontrada.", {
            description: "Cadastre o colaborador ou use o preenchimento manual.",
          });
        }
      } else if (rows.length === 1) {
        setNaoEncontrado(false);
        applyColab(rows[0]);
        if (origem === "manual") toast.success("Colaborador encontrado.");
      } else {
        setNaoEncontrado(false);
        setMatchCandidates(rows);
      }

      setBuscaEstado("atualizado");
    } catch (e) {
      resultado = "erro";
      setBuscaEstado("idle");
      toast.error("Erro ao buscar colaborador.", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSearching(false);
      // Telemetria anônima: apenas origem, resultado e duração.
      logEvent({
        categoria: "rpc",
        acao: origem === "auto" ? "busca_colaborador_automatica" : "busca_colaborador_manual",
        resultado,
        duracao_ms: Math.round(performance.now() - inicio),
      });
    }
  }

  // Auto-pesquisa com debounce (~500 ms) — a lupa deixa de ser obrigatória.
  useEffect(() => {
    const val = matriculaInput.trim();
    if (isEdit || bloqueado || colab) return;
    if (val.length < 2 || val === ultimaBuscaRef.current) return;
    const t = setTimeout(() => {
      void searchMatricula(val, "auto");
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matriculaInput, isEdit, bloqueado, colab]);

  // O check verde "Dados atualizados" some após alguns segundos.
  useEffect(() => {
    if (buscaEstado !== "atualizado") return;
    const t = setTimeout(() => setBuscaEstado("idle"), 2500);
    return () => clearTimeout(t);
  }, [buscaEstado]);

  function clearColab() {
    setColab(null);
    setMatriculaInput("");
    ultimaBuscaRef.current = "";
    setBuscaEstado("idle");
    setNaoEncontrado(false);
    form.setValue("modo_manual", false);
    form.setValue("colaborador_id", "");
    form.setValue("empresa_id", "");
    form.setValue("projeto_id", "");
  }

  /** Ativa/desativa o preenchimento manual (colaborador não localizado). */
  function toggleModoManual(ativar: boolean) {
    form.setValue("modo_manual", ativar, { shouldValidate: true });
    if (ativar) {
      setColab(null);
      setMatchCandidates(null);
      form.setValue("colaborador_id", "");
      if (!form.getValues("manual_matricula")) {
        form.setValue("manual_matricula", matriculaInput.trim());
      }
      form.setValue("manual_matricula", matriculaInput.trim(), { shouldValidate: true });
      logEvent({ categoria: "tela", acao: "ausencia_modo_manual_ativado", resultado: "ok", duracao_ms: 0 });
    } else {
      form.setValue("empresa_id", "");
      form.setValue("projeto_id", "");
    }
  }


  // Chips de filtros/critérios ativos da busca
  const chipsBusca: FiltroChip[] = useMemo(() => {
    const list: FiltroChip[] = [];
    if (matriculaInput.trim()) {
      list.push({
        id: "matricula",
        titulo: "Matrícula",
        valor: matriculaInput.trim(),
        onRemove: isEdit ? undefined : clearColab,
      });
    }
    if (colab?.empresa?.nome) {
      list.push({ id: "empresa", titulo: "Empresa", valor: colab.empresa.nome });
    }
    if (colab?.projeto?.nome) {
      list.push({ id: "projeto", titulo: "Projeto", valor: colab.projeto.nome });
    }
    if (colab?.supervisor_nome) {
      list.push({ id: "supervisor", titulo: "Supervisor", valor: colab.supervisor_nome });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return list;
  }, [matriculaInput, colab, isEdit]);

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

  // ============= Rascunho automático (Auto Save) =============
  type DraftShape = {
    values: FormData;
    matriculaInput: string;
    colab: ColabMatch | null;
    acidente: {
      data: string; hora: string; local: string; descricao: string;
      atendMedico: boolean | null; afastamento: boolean | null;
      diasAfast: string; catEmitida: boolean | null; obs: string;
    };
    fileName: string | null;
  };
  const draftEnabled = !isEdit && !!profile?.id;
  const draftKey = draftEnabled ? `mk9:draft:nova-ausencia:${profile?.id}` : null;
  const { load: loadDraft, clear: clearDraft, scheduleSave: scheduleDraftSave, save: saveDraftNow } =
    useFormDraft<DraftShape>(draftKey, { debounceMs: 500, enabled: draftEnabled });

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState<DraftShape | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const restoreCheckedRef = useRef(false);

  // Verifica rascunho existente ao montar (apenas cadastro novo)
  useEffect(() => {
    if (!draftEnabled || restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    const env = loadDraft();
    if (env?.data) {
      setRestoredDraft(env.data);
      setRestoreOpen(true);
    }
  }, [draftEnabled, loadDraft]);

  // Salva rascunho a cada mudança (debounce 500 ms)
  const watched = form.watch();
  useEffect(() => {
    if (!draftEnabled) return;
    // Não gravar rascunho vazio antes do usuário digitar nada
    const anyContent =
      !!matriculaInput ||
      !!colab ||
      !!watched.motivo ||
      !!watched.data_inicio ||
      !!watched.tipo_ausencia_id ||
      !!watched.localidade ||
      !!watched.loja_codigo_nome ||
      !!watched.cid ||
      !!acidenteData ||
      !!acidenteHora ||
      !!acidenteLocal ||
      !!acidenteDescricao ||
      !!acidenteObs;
    if (!anyContent) return;
    scheduleDraftSave({
      values: watched as FormData,
      matriculaInput,
      colab,
      acidente: {
        data: acidenteData,
        hora: acidenteHora,
        local: acidenteLocal,
        descricao: acidenteDescricao,
        atendMedico: acidenteAtendMedico,
        afastamento: acidenteAfastamento,
        diasAfast: acidenteDiasAfast,
        catEmitida: acidenteCatEmitida,
        obs: acidenteObs,
      },
      fileName: file?.name ?? null,
    });
  }, [
    draftEnabled,
    scheduleDraftSave,
    watched,
    matriculaInput,
    colab,
    file,
    acidenteData,
    acidenteHora,
    acidenteLocal,
    acidenteDescricao,
    acidenteAtendMedico,
    acidenteAfastamento,
    acidenteDiasAfast,
    acidenteCatEmitida,
    acidenteObs,
  ]);

  const handleRestoreDraft = useCallback(() => {
    const d = restoredDraft;
    if (!d) return;
    if (d.colab) applyColab(d.colab);
    else setMatriculaInput(d.matriculaInput || "");
    form.reset(d.values);
    setAcidenteData(d.acidente.data ?? "");
    setAcidenteHora(d.acidente.hora ?? "");
    setAcidenteLocal(d.acidente.local ?? "");
    setAcidenteDescricao(d.acidente.descricao ?? "");
    setAcidenteAtendMedico(d.acidente.atendMedico ?? null);
    setAcidenteAfastamento(d.acidente.afastamento ?? null);
    setAcidenteDiasAfast(d.acidente.diasAfast ?? "");
    setAcidenteCatEmitida(d.acidente.catEmitida ?? null);
    setAcidenteObs(d.acidente.obs ?? "");
    setRestoreOpen(false);
    if (d.fileName) {
      toast.info("Rascunho restaurado.", {
        description: "Os anexos precisam ser selecionados novamente.",
      });
    } else {
      toast.success("Rascunho restaurado.");
    }
  }, [restoredDraft, applyColab, form]);

  const handleDiscardRestoredDraft = useCallback(() => {
    clearDraft();
    setRestoredDraft(null);
    setRestoreOpen(false);
  }, [clearDraft]);

  const handleCancelClick = useCallback(() => {
    if (isEdit) {
      navigate({ to: "/ausencias" });
      return;
    }
    const hasContent =
      form.formState.isDirty ||
      !!matriculaInput ||
      !!colab ||
      !!acidenteData ||
      !!acidenteDescricao ||
      !!acidenteLocal;
    if (!hasContent) {
      clearDraft();
      navigate({ to: "/ausencias" });
      return;
    }
    setCancelOpen(true);
  }, [
    isEdit,
    navigate,
    clearDraft,
    form.formState.isDirty,
    matriculaInput,
    colab,
    acidenteData,
    acidenteDescricao,
    acidenteLocal,
  ]);


  // ============= Submit (server functions com hardening RBAC) =============
  const createFn = useServerFn(createAusencia);
  const updateFn = useServerFn(updateAusencia);
  const checkConflitosFn = useServerFn(checkConflitosAusencia);
  const substituirFn = useServerFn(substituirAusenciaConflito);



  const substituirMut = useMutation({
    mutationFn: async (params: { idAntiga: string; values: FormData; motivo: string }) => {
      // 1. Upload do arquivo se houver (mesma lógica de salvarMut)
      let arquivo_url: string | null | undefined = undefined;
      let arquivo_nome: string | null | undefined = undefined;
      let arquivo_mime: string | null | undefined = undefined;
      let arquivo_tamanho: number | null | undefined = undefined;

      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `ausencias/${params.values.colaborador_id || "manual"}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET_ATESTADOS).upload(path, file);
        if (error) throw error;
        arquivo_url = path;
        arquivo_nome = file.name;
        arquivo_mime = file.type;
        arquivo_tamanho = file.size;
      }

      const isAcidente = tipoSelecionado?.codigo === "ACIDENTE_TRABALHO";
      
      const payload = {
        colaborador_id: params.values.colaborador_id || null,
        empresa_id: params.values.modo_manual ? params.values.empresa_id : colab?.empresa_id,
        projeto_id: params.values.modo_manual ? params.values.projeto_id : colab?.projeto_id,
        origem_registro: params.values.modo_manual ? "MANUAL" : "AUTOMATICO",
        tipo_ausencia_id: params.values.tipo_ausencia_id,
        opcao_periodo_id: params.values.opcao_periodo_id,
        data_inicio: params.values.data_inicio,
        data_fim: dataFim,
        localidade: params.values.localidade,
        loja_codigo_nome: params.values.loja_codigo_nome,
        cid: params.values.cid?.toUpperCase() || null,
        acidente_trabalho_trajeto: params.values.acidente_trabalho_trajeto === "sim",
        motivo: params.values.motivo,
        arquivo_url,
        arquivo_nome,
        arquivo_mime,
        arquivo_tamanho,
        tipo: tipoBaseFromDetalhe(tipoSelecionado?.codigo || ""),
        ...(isAcidente ? {
          acidente_data: acidenteData,
          acidente_hora: acidenteHora,
          acidente_local: acidenteLocal,
          acidente_descricao: acidenteDescricao,
          acidente_atendimento_medico: acidenteAtendMedico,
          acidente_houve_afastamento: acidenteAfastamento,
          acidente_dias_afastamento_inicial: parseInt(acidenteDiasAfast) || 0,
          acidente_cat_emitida: acidenteCatEmitida,
          acidente_observacoes: acidenteObs,
        } : {}),
        // Campos manuais se necessário
        ...(params.values.modo_manual ? {
          manual_nome: params.values.manual_nome,
          manual_matricula: params.values.manual_matricula,
          manual_telefone: params.values.manual_telefone,
          manual_whatsapp: params.values.manual_whatsapp,
          manual_email: params.values.manual_email,
          manual_supervisor_nome: params.values.manual_supervisor_nome,
          manual_supervisor_telefone: params.values.manual_supervisor_telefone,
          manual_supervisor_usuario_id: params.values.manual_supervisor_usuario_id || null,
        } : {})
      };

      const res = await substituirFn({
        data: {
          ausencia_id_antiga: params.idAntiga,
          dados_nova_ausencia: payload,
          motivo_substituicao: params.motivo,
        }
      });
      return res;

    },
    onSuccess: () => {
      toast.success("Ausência lançada com sucesso.", {
        description: "Registro enviado automaticamente para a Central de Processamento.",
      });
      setConflitoDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
      navigate({ to: "/ausencias" });
    },
    onError: (err) => {
      toast.error("Falha ao realizar substituição.", {
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  });


  const salvarMut = useMutation({
    mutationFn: async (values: FormData) => {
      const dataInicioIso = values.data_inicio;

      // Coordenador precisa indicar a qual supervisor da sua equipe o
      // colaborador manual pertence (o servidor revalida esse vínculo).
      if (values.modo_manual && isCoordenadorEscopo && !values.manual_supervisor_usuario_id) {
        throw new Error("INVALID_PAYLOAD: Selecione o Supervisor responsável pelo colaborador.");
      }



      let arquivo_url: string | null | undefined = undefined;
      let arquivo_nome: string | null | undefined = undefined;
      let arquivo_mime: string | null | undefined = undefined;
      let arquivo_tamanho: number | null | undefined = undefined;

      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const stamp = Date.now();
        const rand = crypto.randomUUID();
        const path = `ausencias/${values.colaborador_id || "manual"}/${stamp}-${rand}.${ext}`;
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

      const isAcidente = tipoSelecionado?.codigo === "ACIDENTE_TRABALHO";
      if (isAcidente) {
        if (!acidenteData || !acidenteHora || !acidenteLocal.trim() || !acidenteDescricao.trim()) {
          throw new Error("Para Acidente de Trabalho, informe data, hora, local e descrição.");
        }
      }

      const origemFields = values.modo_manual
        ? {
            origem_registro: "MANUAL" as const,
            empresa_id: values.empresa_id!,
            projeto_id: values.projeto_id!,
            // Motivo fixo — o operador não digita nem escolhe; a auditoria recebe a origem.
            manual_motivo: MANUAL_MOTIVO_PADRAO,
            manual_motivo_detalhe: "Colaborador não localizado pela matrícula informada.",
            manual_nome: values.manual_nome!.trim(),
            manual_matricula: (values.manual_matricula || matriculaInput).trim(),
            manual_telefone: values.manual_telefone?.trim() || null,
            manual_whatsapp: values.manual_whatsapp?.trim() || null,
            manual_email: values.manual_email?.trim() || null,
            manual_supervisor_nome: values.manual_supervisor_nome?.trim() || null,
            manual_supervisor_telefone: values.manual_supervisor_telefone?.trim() || null,
            // Coordenador: supervisor canônico do vínculo. O servidor revalida
            // se ele pertence à coordenação antes de criar o colaborador.
            manual_supervisor_usuario_id: values.manual_supervisor_usuario_id || null,

          }
        : { origem_registro: "AUTOMATICO" as const, colaborador_id: values.colaborador_id! };

      const payload = {
        ...origemFields,

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
        ...(isAcidente ? {
          acidente_data: acidenteData,
          acidente_hora: acidenteHora.length === 5 ? `${acidenteHora}:00` : acidenteHora,
          acidente_local: acidenteLocal.trim(),
          acidente_descricao: acidenteDescricao.trim(),
          acidente_atendimento_medico: acidenteAtendMedico,
          acidente_houve_afastamento: acidenteAfastamento,
          acidente_dias_afastamento_inicial: acidenteDiasAfast.trim() ? Number(acidenteDiasAfast) : null,
          acidente_cat_emitida: acidenteCatEmitida,
          acidente_observacoes: acidenteObs.trim() || null,
        } : {}),
      };


      if (isEdit && editId) {
        await updateFn({ data: { ...payload, id: editId } });
        return { manual: false, colaboradorCriado: false };
      }
      const res = await createFn({ data: payload });
      return {
        manual: !!values.modo_manual,
        colaboradorCriado: !!(res as { colaborador_criado?: boolean } | undefined)?.colaborador_criado,
      };
    },
    onSuccess: (res) => {
      clearDraft();
      const descricao = isEdit
        ? undefined
        : res?.manual
          ? res.colaboradorCriado
            ? "Ausência registrada e colaborador salvo para futuros lançamentos."
            : "Ausência registrada e vinculada ao colaborador existente."
          : "Status inicial: PENDENTE.";
      toast.success(isEdit ? "Ausência atualizada." : "Ausência lançada com sucesso.", {
        description: isEdit ? "As alterações foram salvas." : "Registro enviado automaticamente para a Central de Processamento.",
      });
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
      queryClient.invalidateQueries({ queryKey: ["ausencia", editId] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
      navigate({ to: "/ausencias" });
    },

    onError: (err: unknown) => {
      const friendly = friendlyRbacError(err);
      const isScope = parseRbacError(err).code === "PROJECT_SCOPE_DENIED";
      toast.error(
        isScope
          ? "Você não possui permissão para registrar uma ausência neste projeto."
          : friendly.title,
        {
          description: isScope
            ? undefined
            : [friendly.description, friendly.correlationId ? `ref: ${friendly.correlationId.slice(0, 8)}` : null]
                .filter(Boolean)
                .join(" • ") || undefined,

        },
      );
    },
  });

  if (sessionLoading) {
    return (
      <AppShell title="Nova Ausência" breadcrumb={["CRM", "Nova Ausência"]}>
        <div className="space-y-4 p-6" aria-busy="true" aria-live="polite">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

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
                  onSubmit={form.handleSubmit(async (v) => {
                    if (salvarMut.isPending || substituirMut.isPending || bloqueado) return;
                    if (supervisorSemProjetos && !isEdit) {
                      toast.error("Sem projetos vinculados. Procure um administrador.");
                      return;
                    }
                    if (!colab && !isEdit && !v.modo_manual) {
                      toast.error("Busque um colaborador pela matrícula ou use o preenchimento manual.");
                      return;
                    }

                    // 1. Detecção de Conflitos (Etapa 1)
                    if (!isEdit) {
                      try {
                        const tipo = tipoSelecionado?.codigo ? tipoBaseFromDetalhe(tipoSelecionado.codigo) : "FALTA";
                        const confs = await checkConflitosFn({
                          data: {
                            colaborador_id: v.modo_manual ? null : v.colaborador_id,
                            data_inicio: v.data_inicio,
                            data_fim: dataFim || v.data_inicio,
                            tipo: tipo as any,
                            origem_registro: v.modo_manual ? "MANUAL" : "AUTOMATICO",
                            manual_matricula: v.modo_manual ? v.manual_matricula : null,
                            empresa_id: v.modo_manual ? v.empresa_id : null,
                          }
                        });


                        if (confs && confs.length > 0) {
                          setConflitos(confs);
                          setPendingValues(v);
                          setConflitoDialogOpen(true);
                          return;
                        }
                      } catch (err) {
                        console.error("Erro ao verificar conflitos:", err);
                        // Se falhar a verificação, prossegue com o salvamento normal
                      }
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

                    <DadosColaboradorFields
                      modo={modoManual ? "MANUAL" : "AUTOMATICO"}
                      colaboradorEncontrado={colab}
                      form={form}
                      empresasDisponiveis={empresasManualQ.data ?? []}
                      projetosDisponiveis={projetosManualQ.data ?? []}
                      usarSelectSupervisor={isCoordenadorEscopo}
                      supervisoresDisponiveis={supervisoresDisponiveis}

                      matriculaSlot={
                        <div className="space-y-1.5">
                          {coach.visible && !isEdit && !bloqueado && (
                            <CoachMark
                              text="A pesquisa agora é automática: digite a matrícula e os dados são carregados sozinhos."
                              onDismiss={coach.dismiss}
                              onNeverShowAgain={coach.neverShowAgain}
                            />
                          )}
                          <Label htmlFor="matricula-busca" className="flex items-center gap-1.5 text-sm">
                            <Hash className="h-4 w-4 text-muted-foreground" />
                            Matrícula <span className="text-red-500">*</span>
                          </Label>
                          <p className="text-[11px] leading-tight text-muted-foreground">
                            Digite a matrícula — a pesquisa é automática. Se existir em mais de uma
                            empresa, o sistema solicitará a seleção.
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              id="matricula-busca"
                              ref={matriculaRef}
                              value={matriculaInput}
                              onChange={(e) => {
                                setMatriculaInput(e.target.value);
                                if (form.getValues("modo_manual")) {
                                  form.setValue("manual_matricula", e.target.value.trim(), {
                                    shouldValidate: true,
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  searchMatricula(undefined, "manual");
                                }
                                if (e.key === "Escape" && !isEdit && !bloqueado) {
                                  e.preventDefault();
                                  clearColab();
                                }
                              }}
                              placeholder="Ex: 12 ou 123456"
                              disabled={bloqueado || isEdit}
                              aria-describedby="matricula-busca-status"
                            />
                            {colab ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11 sm:min-h-10"
                                onClick={clearColab}
                                disabled={bloqueado || isEdit}
                              >
                                <X className="h-4 w-4" />
                                <span>Limpar</span>
                              </Button>
                            ) : (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="min-h-11 whitespace-nowrap sm:min-h-10"
                                      onClick={() => searchMatricula(undefined, "manual")}
                                      disabled={searching || bloqueado || isEdit}
                                    >
                                      {searching ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Search className="h-4 w-4" />
                                      )}
                                      <span>Atualizar resultados</span>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    A busca já ocorre automaticamente ao digitar
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>

                          <BuscaStatus estado={buscaEstado} className="pt-0.5" />
                          <span id="matricula-busca-status" className="sr-only">
                            A pesquisa é executada automaticamente após você parar de digitar.
                          </span>

                          <FiltroChips chips={chipsBusca} className="pt-1" />

                          {searching && !colab && <BuscaSkeleton linhas={2} />}

                          {!searching &&
                            !colab &&
                            !isEdit &&
                            matriculaInput.trim().length === 0 &&
                            buscaEstado === "idle" && (
                              <EstadoVazioBusca
                                mensagem="Nenhum colaborador selecionado. Informe a matrícula para carregar os dados."
                                acaoLabel="Informar matrícula"
                                onAcao={() => matriculaRef.current?.focus()}
                              />
                            )}

                          {form.formState.errors.colaborador_id && !colab && (
                            <p className="text-xs text-red-500">
                              {form.formState.errors.colaborador_id.message}
                            </p>
                          )}
                          {form.formState.errors.manual_matricula && modoManual && (
                            <p className="text-xs text-red-500">
                              {form.formState.errors.manual_matricula.message}
                            </p>
                          )}
                        </div>
                      }
                      avisoSlot={
                        !isEdit && naoEncontrado && !colab ? (
                          <div className="md:col-span-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                            <p className="font-medium text-amber-900 dark:text-amber-200">
                              Colaborador não localizado nesta matrícula.
                            </p>
                            {modoManual ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-background/70 px-2.5 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                                  Preenchimento manual
                                </span>
                                <button
                                  type="button"
                                  className="text-[11px] underline underline-offset-2 text-amber-900/80 hover:text-amber-900 dark:text-amber-200/80"
                                  onClick={() => toggleModoManual(false)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
                                  Você pode preencher os dados manualmente. O lançamento ficará
                                  marcado como <strong>MANUAL</strong> na auditoria.
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => toggleModoManual(true)}
                                >
                                  Preencher manualmente
                                </Button>
                              </>
                            )}
                          </div>
                        ) : null
                      }
                    />


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
                                    <CommandEmpty>
                                      {tiposQ.isLoading ? (
                                        <span className="text-muted-foreground">Carregando tipos...</span>
                                      ) : tiposQ.isError ? (
                                        <div className="flex flex-col items-center gap-2 py-2">
                                          <span className="text-destructive text-sm">Não foi possível carregar os tipos</span>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => tiposQ.refetch()}
                                          >
                                            Tentar novamente
                                          </Button>
                                        </div>
                                      ) : (tiposQ.data ?? []).length === 0 ? (
                                        <span className="text-muted-foreground">Nenhum tipo ativo disponível</span>
                                      ) : (
                                        <span className="text-muted-foreground">Nenhum resultado para a busca</span>
                                      )}
                                    </CommandEmpty>
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

                    {tipoSelecionado?.codigo === "ACIDENTE_TRABALHO" && (
                      <div className="mt-4 rounded-lg border border-red-300/60 bg-red-50/60 p-4 dark:bg-red-950/30">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                            <AlertTriangle className="h-3.5 w-3.5" /> Acidente de Trabalho
                          </span>
                          <span className="text-xs text-muted-foreground">
                            O Técnico de Segurança será notificado após o lançamento.
                          </span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <label className="text-xs font-medium">Data do acidente <span className="text-red-500">*</span></label>
                            <Input type="date" value={acidenteData} onChange={(e) => setAcidenteData(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Hora <span className="text-red-500">*</span></label>
                            <Input type="time" value={acidenteHora} onChange={(e) => setAcidenteHora(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Local <span className="text-red-500">*</span></label>
                            <Input maxLength={200} placeholder="Ex: Depósito - Setor B" value={acidenteLocal} onChange={(e) => setAcidenteLocal(e.target.value)} />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="text-xs font-medium">Descrição do ocorrido <span className="text-red-500">*</span></label>
                          <Textarea rows={3} maxLength={2000} placeholder="Descreva o que aconteceu, como e onde." value={acidenteDescricao} onChange={(e) => setAcidenteDescricao(e.target.value)} />
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div>
                            <label className="text-xs font-medium">Houve atendimento médico?</label>
                            <RadioGroup
                              value={acidenteAtendMedico === null ? "" : acidenteAtendMedico ? "sim" : "nao"}
                              onValueChange={(v) => setAcidenteAtendMedico(v === "sim" ? true : v === "nao" ? false : null)}
                              className="flex gap-3 pt-1"
                            >
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="sim" /> Sim</label>
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="nao" /> Não</label>
                            </RadioGroup>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Houve afastamento?</label>
                            <RadioGroup
                              value={acidenteAfastamento === null ? "" : acidenteAfastamento ? "sim" : "nao"}
                              onValueChange={(v) => setAcidenteAfastamento(v === "sim" ? true : v === "nao" ? false : null)}
                              className="flex gap-3 pt-1"
                            >
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="sim" /> Sim</label>
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="nao" /> Não</label>
                            </RadioGroup>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Dias iniciais de afastamento</label>
                            <Input type="number" min={0} max={3650} value={acidenteDiasAfast} onChange={(e) => setAcidenteDiasAfast(e.target.value)} disabled={acidenteAfastamento !== true} />
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium">CAT emitida?</label>
                            <RadioGroup
                              value={acidenteCatEmitida === null ? "" : acidenteCatEmitida ? "sim" : "nao"}
                              onValueChange={(v) => setAcidenteCatEmitida(v === "sim" ? true : v === "nao" ? false : null)}
                              className="flex gap-3 pt-1"
                            >
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="sim" /> Sim</label>
                              <label className="flex cursor-pointer items-center gap-1.5 text-sm"><RadioGroupItem value="nao" /> Não</label>
                            </RadioGroup>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Observações</label>
                            <Textarea rows={2} maxLength={2000} value={acidenteObs} onChange={(e) => setAcidenteObs(e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}



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
                        onClick={handleCancelClick}
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

      {/* Dialog: restaurar rascunho não enviado */}
      <Dialog
        open={restoreOpen}
        onOpenChange={(open) => {
          if (!open) setRestoreOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rascunho encontrado</DialogTitle>
            <DialogDescription>
              Foi encontrado um rascunho não enviado deste formulário. Deseja continuar
              de onde parou?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleDiscardRestoredDraft}>
              Descartar
            </Button>
            <Button
              onClick={handleRestoreDraft}
              className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:from-blue-700 hover:to-indigo-800"
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: cancelar preenchimento */}
      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (!open) setCancelOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sair do formulário?</DialogTitle>
            <DialogDescription>
              Você tem informações preenchidas. Escolha o que deseja fazer:
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setCancelOpen(false)}
            >
              Continuar preenchendo
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                clearDraft();
                setCancelOpen(false);
                navigate({ to: "/ausencias" });
              }}
            >
              Descartar
            </Button>
            <Button
              onClick={() => {
                // Grava imediatamente o estado atual como rascunho
                saveDraftNow({
                  values: form.getValues(),
                  matriculaInput,
                  colab,
                  acidente: {
                    data: acidenteData,
                    hora: acidenteHora,
                    local: acidenteLocal,
                    descricao: acidenteDescricao,
                    atendMedico: acidenteAtendMedico,
                    afastamento: acidenteAfastamento,
                    diasAfast: acidenteDiasAfast,
                    catEmitida: acidenteCatEmitida,
                    obs: acidenteObs,
                  },
                  fileName: file?.name ?? null,
                });
                setCancelOpen(false);
                toast.success("Rascunho salvo. Você pode continuar depois.");
                navigate({ to: "/ausencias" });
              }}
              className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white hover:from-blue-700 hover:to-indigo-800"
            >
              Salvar como rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConflitoAusenciaDialog
        open={conflitoDialogOpen}
        onOpenChange={setConflitoDialogOpen}
        conflitos={conflitos}
        novoTipo={tipoSelecionado?.nome || "Ausência"}
        isSubmitting={substituirMut.isPending}
        onConfirmSubstituir={(idAntiga) => {
          if (pendingValues) {
            substituirMut.mutate({
              idAntiga,
              values: pendingValues,
              motivo: "Substituição automática por conflito detectado no lançamento."
            });
          }
        }}
        onConfirmManterAmbos={() => {
          if (pendingValues) {
            setConflitoDialogOpen(false);
            salvarMut.mutate(pendingValues);
          }
        }}
        onCancel={() => {
          setConflitoDialogOpen(false);
          setPendingValues(null);
        }}
      />
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
