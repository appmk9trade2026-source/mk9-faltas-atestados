// src/lib/ocorrencias.functions.ts
// Reestruturação AMBEV - Foundation Stage 1
// Implementação de Server Functions para Ocorrências de Ponto.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

/** Schema para criação de ocorrência de ponto AMBEV */
export const ocorrenciaPontoSchema = z.object({
  empresa_id: uuid,
  projeto_id: uuid,
  colaborador_id: uuid.nullable().optional().or(z.literal("")), 
  colaborador_manual: z.boolean(),
  manual_matricula: z.string().trim().max(50).optional().nullable(),
  manual_nome: z.string().trim().max(255).optional().nullable(),
  supervisor_usuario_id: uuid,
  data_ocorrencia: iso,
  motivo: z.string().trim().min(5).max(200),
  justificativa: z.string().trim().min(10).max(2000),
  arquivo_url: z.string().trim().url("URL de anexo inválida"),
  arquivo_nome: z.string().trim().max(255).optional(),
  ausencia_id: uuid.nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.colaborador_manual) {
    if (!data.manual_matricula) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Matrícula é obrigatória no modo manual",
        path: ["manual_matricula"],
      });
    }
    if (!data.manual_nome) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nome é obrigatório no modo manual",
        path: ["manual_nome"],
      });
    }
  } else {
    if (!data.colaborador_id || data.colaborador_id === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Colaborador é obrigatório",
        path: ["colaborador_id"],
      });
    }
  }
});

export type OcorrenciaPontoInput = z.infer<typeof ocorrenciaPontoSchema>;

/** Lista ocorrências com base no escopo do usuário */
export const listarOcorrencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    status: z.enum(["PENDENTE", "APROVADA", "REPROVADA", "CANCELADA"]).optional(),
    projeto_id: uuid.optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("ocorrencias_ponto")
      .select(`
        *,
        projeto:projeto_id (nome),
        colaborador:colaborador_id (nome_completo, matricula),
        supervisor:supervisor_usuario_id (nome)
      `)
      .order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.projeto_id) query = query.eq("projeto_id", data.projeto_id);

    const { data: ocorrencias, error } = await query;
    if (error) throw new Error(`Erro ao listar ocorrências: ${error.message}`);
    return ocorrencias;
  });

/** Cria uma nova ocorrência de ponto */
export const criarOcorrencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => {
    // Normalizar colaborador_id vazio para null antes da validação
    const normalizedData = { ...data };
    
    // Normalizar colaborador_id
    if (normalizedData.colaborador_id === "" || normalizedData.colaborador_id === undefined) {
      normalizedData.colaborador_id = null;
    }
    
    // Garantir que supervisor_usuario_id não seja string vazia se vier da UI
    if (normalizedData.supervisor_usuario_id === "" || normalizedData.supervisor_usuario_id === undefined) {
      throw new Error("Supervisor é obrigatório.");
    }

    return ocorrenciaPontoSchema.parse(normalizedData);
  })
  .handler(async ({ data, context }) => {
    // 1. Validar permissão (Supervisor, Coordenador, RH)
    await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createAbsence, 
      projetoId: data.projeto_id,
      empresaId: data.empresa_id,
    });

    // 2. Validar se o projeto é AMBEV (Obrigatório para manual)
    const { data: projeto } = await context.supabase
      .from("projetos")
      .select("nome, empresa_id")
      .eq("id", data.projeto_id)
      .single();

    const isAmbev = projeto?.empresa_id === '0a6c2ac6-2872-47a0-b818-b4660ef81244' || projeto?.nome.toUpperCase().includes('AMBEV');
    
    if (data.colaborador_manual && !isAmbev) {
      throw new Error("Lançamento manual é exclusivo para projetos AMBEV.");
    }

    if (!isAmbev && !data.colaborador_manual) {
       throw new Error("Ocorrência de Ponto é um fluxo exclusivo para projetos AMBEV.");
    }

    // 3. Validação do Colaborador
    if (data.colaborador_manual) {
      if (!data.manual_matricula || !data.manual_nome) {
        throw new Error("Matrícula e Nome são obrigatórios para lançamento manual.");
      }

      // Verificar se matrícula já existe na base mestre
      const { data: colabExistente } = await context.supabase
        .from("colaboradores")
        .select("id, nome_completo, projeto_id, supervisor_usuario_id")
        .eq("matricula", data.manual_matricula)
        .eq("ativo", true)
        .maybeSingle();

      if (colabExistente) {
        const mesmoContexto = colabExistente.projeto_id === data.projeto_id && 
                             colabExistente.supervisor_usuario_id === data.supervisor_usuario_id;
        
        if (mesmoContexto) {
          throw new Error(`O colaborador "${colabExistente.nome_completo}" já está cadastrado neste projeto/supervisor. Por favor, use a busca automática.`);
        }
        // Caso exista em outro projeto/supervisor, permitimos o manual para manter a evidência sem alterar o mestre
      }
    } else {
      if (!data.colaborador_id) throw new Error("Colaborador não selecionado.");

      const { data: colab } = await context.supabase
        .from("colaboradores")
        .select("projeto_id, supervisor_usuario_id, ativo")
        .eq("id", data.colaborador_id)
        .single();

      if (!colab || !colab.ativo) throw new Error("Colaborador não encontrado ou inativo.");
      if (colab.projeto_id !== data.projeto_id) throw new Error("Colaborador não pertence ao projeto selecionado.");
      if (colab.supervisor_usuario_id !== data.supervisor_usuario_id) throw new Error("Colaborador não pertence ao supervisor selecionado.");
    }

    // 4. Persistir
    const { data: newOcorrencia, error } = await context.supabase
      .from("ocorrencias_ponto")
      .insert({
        empresa_id: data.empresa_id,
        projeto_id: data.projeto_id,
        colaborador_id: data.colaborador_id || null,
        colaborador_manual: data.colaborador_manual,
        manual_matricula: data.manual_matricula || null,
        manual_nome: data.manual_nome || null,
        supervisor_usuario_id: data.supervisor_usuario_id,
        data_ocorrencia: data.data_ocorrencia,
        motivo: data.motivo,
        justificativa: data.justificativa,
        arquivo_url: data.arquivo_url,
        arquivo_nome: data.arquivo_nome,
        ausencia_id: data.ausencia_id,
        registrado_por: context.userId,
        status: "PENDENTE",
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar ocorrência: ${error.message}`);

    // 5. Log de auditoria
    const acaoAuditoria = data.colaborador_manual ? "LANCAMENTO" : "LANCAMENTO";
    const obsAuditoria = data.colaborador_manual 
      ? `Lançamento manual para matrícula ${data.manual_matricula}: ${newOcorrencia.protocolo}`
      : `Nova ocorrência de ponto protocolada: ${newOcorrencia.protocolo}`;

    await supabaseAdmin.rpc("log_audit_event", {
      _modulo: "ocorrencias",
      _acao: acaoAuditoria,
      _entidade: "Ocorrência Ponto",
      _registro_id: newOcorrencia.id,
      _empresa_id: data.empresa_id,
      _projeto_id: data.projeto_id,
      _usuario_id: context.userId,
      _sucesso: true,
      _observacoes: obsAuditoria,
      _origem: "server"
    } as any);

    return newOcorrencia;
  });

/** Aprova ou reprova uma ocorrência (RH/Coordenador apenas) */
export const processarOcorrencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    id: uuid,
    status: z.enum(["APROVADA", "REPROVADA"]),
    parecer: z.string().trim().min(5).max(1000),
  }).parse(data))
  .handler(async ({ data, context }) => {
    // 1. Validar permissão (RH ou Coordenador)
    const roles = (context.claims?.roles as string[]) || [];
    const canProcess = roles.some((r: string) => ["rh", "coordenador", "super_admin"].includes(r));
    if (!canProcess) throw new Error("Apenas RH ou Coordenadores podem processar ocorrências.");

    // 2. Buscar ocorrência para conferir escopo e dados para vínculo
    const { data: ocorrencia } = await context.supabase
      .from("ocorrencias_ponto")
      .select("*, projeto:projeto_id (nome, empresa_id)")
      .eq("id", data.id)
      .single();

    if (!ocorrencia) throw new Error("Ocorrência não encontrada.");
    if (ocorrencia.status !== "PENDENTE") throw new Error("Esta ocorrência já foi processada.");

    let vinculadoAusenciaId: string | null = null;

    // 3. Lógica de Vínculo AMBEV (Fase 3) - Somente na Aprovação
    if (data.status === "APROVADA") {
      // Localizar falta compatível
      const query = context.supabase
        .from("ausencias")
        .select("id, protocolo")
        .eq("projeto_id", ocorrencia.projeto_id)
        .eq("data_inicio", ocorrencia.data_ocorrencia)
        .eq("tipo", "FALTA")
        .eq("status_documental", "ATIVO");

      if (ocorrencia.colaborador_id) {
        query.eq("colaborador_id", ocorrencia.colaborador_id);
      } else if (ocorrencia.manual_matricula) {
        query.eq("manual_matricula", ocorrencia.manual_matricula);
      }

      const { data: faltas } = await query;

      // Só vincula automaticamente se houver exatamente uma
      if (faltas && faltas.length === 1) {
        vinculadoAusenciaId = faltas[0].id;
        
        // Marcar falta como justificada
        const { error: errorJustificativa } = await context.supabase
          .from("ausencias")
          .update({
            status_justificativa: "JUSTIFICADA_OCORRENCIA_PONTO",
            justificada_por_ocorrencia_id: ocorrencia.id,
            observacao_processamento: `Justificada via Ocorrência AMBEV: ${ocorrencia.protocolo}`
          })
          .eq("id", vinculadoAusenciaId);
          
        if (errorJustificativa) {
          console.error("[Fase 3] Erro ao marcar justificativa na ausência:", errorJustificativa);
          // O fluxo continua, o vínculo na ocorrência é o principal
        }
      }
    }

    // 4. Atualizar Ocorrência
    const { data: updated, error } = await context.supabase
      .from("ocorrencias_ponto")
      .update({
        status: data.status,
        parecer_processamento: data.parecer,
        processado_por: context.userId,
        processado_em: new Date().toISOString(),
        ausencia_id: vinculadoAusenciaId || ocorrencia.ausencia_id,
      })
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw new Error(`Erro ao processar ocorrência: ${error.message}`);

    // 5. Auditoria
    await supabaseAdmin.rpc("log_audit_event", {
      _modulo: "ocorrencias",
      _acao: "MUDANCA_STATUS",
      _entidade: "Ocorrência Ponto",
      _registro_id: data.id,
      _empresa_id: ocorrencia.empresa_id,
      _projeto_id: ocorrencia.projeto_id,
      _usuario_id: context.userId,
      _sucesso: true,
      _observacoes: `Ocorrência ${data.status} ${vinculadoAusenciaId ? '(Vinculada a Falta)' : ''}: ${data.parecer}`,
      _origem: "server"
    } as any);

    if (vinculadoAusenciaId) {
      await supabaseAdmin.rpc("log_audit_event", {
        _modulo: "ausencias",
        _acao: "LANCAMENTO", // Usando fallback por falta de enum custom
        _entidade: "Ausência",
        _registro_id: vinculadoAusenciaId,
        _empresa_id: ocorrencia.empresa_id,
        _projeto_id: ocorrencia.projeto_id,
        _usuario_id: context.userId,
        _sucesso: true,
        _observacoes: `FALTA_JUSTIFICADA_POR_OCORRENCIA: ${ocorrencia.protocolo}`,
        _origem: "server"
      } as any);
    }

    return updated;
  });

/** Busca supervisores vinculados a um projeto */
export const getSupervisoresProjeto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    projeto_id: uuid
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: supervisores, error } = await context.supabase.rpc("get_supervisores_projeto", {
      _projeto_id: data.projeto_id
    });
    if (error) throw new Error(`Erro ao buscar supervisores: ${error.message}`);
    return (supervisores || []) as { id: string; nome: string }[];
  });
