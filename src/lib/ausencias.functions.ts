// Ausências — Server Functions com hardening RBAC e Auditoria Forense.
//
// TODAS as mutações de ausência agora passam por aqui. Nunca chame
// supabase.from("ausencias").insert/update/delete direto do client.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";
import { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enfileirarNotificacoesAusencia } from "./notificacoes-ausencia.server";
import { format } from "date-fns";
import { calculateIntegrityHash, resolveOperationMetadata } from "./integridade-forense.server";

async function getSnapshot(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("get_user_snapshot", { _user_id: userId });
  if (error || !data || data.length === 0) return null;
  return data[0] as { nome: string; email: string; papel: string };
}


type StatusProcessamento = Database["public"]["Enums"]["ausencia_status_processamento"];


const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

/** Campos comuns às duas origens (AUTOMATICO e MANUAL). */
const commonPayloadSchema = z.object({
  tipo_ausencia_id: uuid,
  opcao_periodo_id: uuid,
  data_inicio: iso,
  localidade: z.string().trim().min(1).max(150),
  loja_codigo_nome: z.string().trim().min(1).max(150),
  cid: z.string().trim().max(20).nullable().optional(),
  acidente_trabalho_trajeto: z.boolean(),
  motivo: z.string().trim().min(5).max(500),
  arquivo_url: z.string().trim().max(500).nullable().optional(),
  arquivo_nome: z.string().trim().max(255).nullable().optional(),
  arquivo_mime: z.string().trim().max(120).nullable().optional(),
  arquivo_tamanho: z.number().int().nullable().optional(),
  // Novos campos de horário para comparecimento parcial (Meio Período)
  horario_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  horario_fim: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  // Campos específicos de Acidente de Trabalho (opcionais no schema; obrigatoriedade
  // é revalidada no handler quando o tipo selecionado é ACIDENTE_TRABALHO).
  acidente_data: iso.nullable().optional(),
  acidente_hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  acidente_local: z.string().trim().max(200).nullable().optional(),
  acidente_descricao: z.string().trim().max(2000).nullable().optional(),
  acidente_atendimento_medico: z.boolean().nullable().optional(),
  acidente_houve_afastamento: z.boolean().nullable().optional(),
  acidente_dias_afastamento_inicial: z.union([z.string(), z.number()]).nullable().optional(),
  acidente_cat_emitida: z.boolean().nullable().optional(),
  acidente_observacoes: z.string().trim().max(2000).nullable().optional(),
});

/** Motivos aceitos para o preenchimento manual (sem vínculo com colaborador). */
export const MANUAL_MOTIVOS = [
  "COLABORADOR_NAO_ENCONTRADO",
  "CADASTRO_DESATUALIZADO",
  "ADMISSAO_RECENTE",
  "OUTRO",
] as const;

/** Origem AUTOMATICA — empresa/projeto derivados do colaborador. */
const autoPayloadSchema = commonPayloadSchema.extend({
  origem_registro: z.literal("AUTOMATICO"),
  colaborador_id: uuid,
});

/** Origem MANUAL — empresa/projeto informados e validados por escopo RBAC. */
const manualPayloadSchema = commonPayloadSchema.extend({
  origem_registro: z.literal("MANUAL"),
  empresa_id: uuid,
  projeto_id: uuid,
  manual_motivo: z.enum(MANUAL_MOTIVOS),
  manual_motivo_detalhe: z.string().trim().max(300).nullable().optional(),
  manual_nome: z.string().trim().refine(val => {
    const ok = val.length >= 3;
    if (!ok) {
      console.error("ETAPA 8 — LOG DO MANUAL PAYLOAD SCHEMA", {
        correlation_id: (globalThis as any).__lastCorrelationId || "unknown",
        etapa: "server-manual-schema",
        manual_nome_type: typeof val,
        manual_nome_length: val.length,
        manual_nome_present: true
      });
    }
    return ok;
  }, { message: "Informe o nome completo do colaborador (mínimo 3 caracteres)." }).transform(v => v.trim()),
  manual_matricula: z.string().trim().min(1).max(50),
  manual_telefone: z.string().trim().max(20).nullable().optional(),
  manual_whatsapp: z.string().trim().max(20).nullable().optional(),
  manual_email: z.string().trim().max(150).nullable().optional(),
  manual_supervisor_nome: z.string().trim().max(150).nullable().optional(),
  manual_supervisor_telefone: z.string().trim().max(20).nullable().optional(),
  /**
   * Supervisor canônico escolhido no formulário (Coordenador).
   * NÃO é coluna de `ausencias` — vai apenas no `_colaborador` da RPC, que
   * revalida no servidor se o supervisor pertence à coordenação do usuário.
   */
  manual_supervisor_usuario_id: uuid.nullable().optional(),

});

const basePayloadSchema = z.discriminatedUnion("origem_registro", [
  autoPayloadSchema,
  manualPayloadSchema,
]);

type ManualPayload = z.infer<typeof manualPayloadSchema>;

/** Normaliza os campos manuais antes da persistência (o banco revalida). */
function manualColumns(data: ManualPayload, userId: string) {
  const digits = (v: string | null | undefined) => (v ? v.replace(/\D+/g, "") || null : null);
  const trim = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const lower = (v: string | null | undefined) => trim(v)?.toLowerCase() ?? null;
  return {
    origem_registro: "MANUAL" as const,
    colaborador_id: null,
    manual_motivo: data.manual_motivo,
    manual_motivo_detalhe: trim(data.manual_motivo_detalhe),
    manual_nome: data.manual_nome.trim(),
    manual_matricula: data.manual_matricula.trim(),
    manual_telefone: digits(data.manual_telefone),
    manual_whatsapp: digits(data.manual_whatsapp),
    manual_email: lower(data.manual_email),
    manual_supervisor_nome: trim(data.manual_supervisor_nome),
    manual_supervisor_telefone: digits(data.manual_supervisor_telefone),
    manual_registrado_por: userId,
    manual_registrado_em: new Date().toISOString(),
  };
}




/**
 * Hardening P0: Validação de conflito que ignora registros cancelados/excluídos.
 * 
 * Como a RPC do banco em Lovable Cloud é read-only para comandos DDL, 
 * implementamos a lógica de filtragem segura aqui no servidor.
 */
async function checkConflitosSeguro(
  supabase: any,
  data: {
    colaborador_id?: string;
    data_inicio: string;
    data_fim: string;
    tipo: string;
    origem_registro: string;
    manual_matricula?: string;
    empresa_id?: string;
  }
) {
  const { data: conflitos, error } = await supabase.rpc("detectar_conflitos_ausencia", {
    _colaborador_id: data.colaborador_id || null,
    _data_inicio: data.data_inicio,
    _data_fim: data.data_fim,
    _tipo: data.tipo,
    _origem_registro: data.origem_registro,
    _manual_matricula: data.manual_matricula || null,
    _empresa_id: data.empresa_id || null,
    _projeto_id: null,
    _supervisor_id: null
  });

  if (error) throw error;

  // Filtragem P0: Garantir que registros excluídos ou cancelados não bloqueiem novos lançamentos
  // mesmo que a RPC original no banco não tenha sido atualizada.
  return (conflitos || []).filter((c: any) => {
    const status = (c.status || "").toUpperCase();
    const statusDoc = (c.status_documental || "ATIVO").toUpperCase();
    return status !== "CANCELADO" && status !== "SUBSTITUIDA" && statusDoc !== "EXCLUIDO";
  });
}

function toInvalidPayload(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
}


/**
 * Classificação precisa de erros vindos do Postgres/PostgREST.
 *
 * Antes, QUALQUER falha de banco virava `CONFLICT: <msg>` e a UI descartava a
 * descrição — o usuário via apenas "Operação em conflito com o estado atual do
 * registro." e a causa real (ex.: SQLSTATE 23505 do trigger
 * `trg_ausencias_bloqueia_duplicidade`) ficava invisível.
 *
 * Agora: SQLSTATE + mensagem original são logados no servidor e o código
 * devolvido ao cliente carrega a razão específica.
 */
function ausenciaDbError(
  err: unknown,
  etapa: "insert_ausencia" | "rpc_manual" | "update_ausencia" | "delete_ausencia" | "status_ausencia",
  correlationId?: string,
): Error {
  const e = (err ?? {}) as { message?: string; code?: string; details?: string; hint?: string };
  const msg = (e.message ?? String(err)) || "";
  const sqlstate = e.code ?? "";

  console.error(
    "[ausencias] falha de banco",
    JSON.stringify({
      etapa,
      correlation_id: correlationId ?? null,
      sqlstate: sqlstate || null,
      message: msg,
      details: e.details ?? null,
      hint: e.hint ?? null,
    }),
  );

  // Escopo hierárquico do Coordenador — mensagens de negócio definidas na RPC.
  if (/SUPERVISOR_FORA_DA_COORDENACAO/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: O Supervisor selecionado não pertence à sua coordenação.");
  }
  if (/SUPERVISOR_OBRIGATORIO/i.test(msg)) {
    return new Error("INVALID_PAYLOAD: Selecione o Supervisor responsável pelo colaborador.");
  }
  if (/COLABORADOR_FORA_DO_SUPERVISOR/i.test(msg)) {
    return new Error("COLLABORATOR_SCOPE_DENIED: Colaborador não encontrado no seu escopo.");
  }
  if (/PROJETO_FORA_DO_ESCOPO|Projeto fora do seu escopo/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: O projeto selecionado não pertence ao seu escopo.");
  }

  // Permissão / RLS / Hardening de Vínculo
  if (sqlstate === "42501" || /row-level security|permission denied|not authorized/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso");
  }

  // Erros de Hardening de Vínculo definidos na RPC (CENÁRIO C e D)
  if (/já está vinculada a outro projeto/i.test(msg) || /já está vinculada a outro supervisor/i.test(msg)) {
    return new Error(`CONFLICT: ${msg}`);
  }

  if (/fora do seu escopo|não pertence à empresa informada|não está vinculado a você/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso");
  }

  // Duplicidade (trigger trg_ausencias_bloqueia_duplicidade — SQLSTATE 23505)
  if (sqlstate === "23505" || /DUPLICIDADE_AUSENCIA/i.test(msg)) {
    const limpa = msg.replace(/^.*DUPLICIDADE_AUSENCIA:\s*/s, "").trim();
    // REGRA CRÍTICA: Se for duplicidade em modo manual, a mensagem deve ser clara sobre o bloqueio seguro.
    if (etapa === "rpc_manual") {
      return new Error(`CONFLICT: BLOQUEIO DE SEGURANÇA — Esta matrícula já possui um registro ativo no sistema. Para evitar duplicidade e inconsistência na folha, o lançamento manual foi interceptado. Verifique o histórico ou utilize a busca automática.`);
    }
    return new Error(
      `CONFLICT: ${limpa || "Já existe uma ausência registrada para este colaborador neste período. Retifique o lançamento existente."}`,
    );
  }

  // Projeto sem código de protocolo (gerar_protocolo_ausencia)
  if (/PROJETO_SEM_CODIGO_PROTOCOLO/i.test(msg)) {
    return new Error(
      "CONFLICT: O projeto não possui código de protocolo configurado. Cadastre o código do projeto antes de lançar.",
    );
  }
  if (/PROTOCOLO_NAO_PODE_SER_INFORMADO/i.test(msg)) {
    return new Error("INVALID_PAYLOAD: o protocolo é gerado pelo sistema e não pode ser informado.");
  }

  // Violações de regra/estrutura → payload inválido, com a razão original
  if (sqlstate === "23514" || sqlstate === "23503" || sqlstate === "23502" || sqlstate === "22P02") {
    return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
  }

  return new Error(`CONFLICT: ${msg.slice(0, 240) || "falha ao gravar a ausência"}`);
}


async function audit(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  acao: string,
  registroId: string | null,
  correlationId: string,
  antes: unknown,
  depois: unknown,
  observacoes: string,
  empresaId?: string | null,
  projetoId?: string | null,
  userId?: string | null,
) {
  try {
    const snapshot = userId ? await getSnapshot(supabase, userId) : null;
    
    await supabase.rpc("log_audit_event", {
      _modulo: "ausencias",
      _acao: acao as any,
      _entidade: "Ausência",
      _registro_id: registroId,
      _empresa_id: empresaId ?? null,
      _projeto_id: projetoId ?? null,
      _antes: (antes ?? null) as any,
      _depois: (depois ?? null) as any,
      _sucesso: true,
      _observacoes: `[corr=${correlationId}] ${observacoes}`,
      _origem: "server",
      ...(snapshot ? {
        _usuario_id: userId,
        _usuario_nome: snapshot.nome,
        _perfil: snapshot.papel
      } : {})
    } as any);
  } catch (err) { 
    console.error("[Audit Error]", err);
  }
}



// ==================== CREATE ====================
export const createAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => {
    const correlationId = (data as any)?.correlation_id || "no-correlation-id";
    (globalThis as any).__lastCorrelationId = correlationId;

    console.log("ETAPA 7 — LOG DO INPUT VALIDATOR DO SERVIDOR", {
      correlation_id: correlationId,
      etapa: "server-input-validator",
      received_keys: data ? Object.keys(data) : [],
      manual_nome_location: data?.manual_nome !== undefined ? "root" : "missing",
      manual_nome_type: typeof data?.manual_nome,
      manual_nome_length: (data?.manual_nome ?? "").length,
      manual_nome_present: data?.manual_nome !== undefined,
      modo_manual: data?.origem_registro === "MANUAL"
    });

    try { 
      return basePayloadSchema.parse(data); 
    } catch (e) { 
      console.error("ETAPA 7 — FALHA NO INPUT VALIDATOR", {
        correlation_id: correlationId,
        error: e,
        received_data_keys: data ? Object.keys(data) : []
      });
      throw toInvalidPayload(e); 
    }
  })
  .handler(async ({ data, context }) => {
    const traceId = (data as any).correlation_id || crypto.randomUUID();
    const logger = async (stage: string, err: unknown, category: any = "DATABASE", severity: any = "P1") => {
      const { logAppError } = await import("./observability.server");
      return logAppError({
        traceId,
        userId: context.userId,
        module: "ausencias",
        operation: "createAusencia",
        stage,
        category,
        severity
      }, err);
    };

    try {
      // ETAPA 9 — RESOLVE_COLABORADOR
      const isManual = data.origem_registro === "MANUAL";
      const request = getRequest();
      const meta = resolveOperationMetadata(request);

      // ETAPA 10 e 11 — Validação Server-side P0 de Integridade da Matrícula
      if (!isManual && data.colaborador_id) {
        const { data: colab, error: colabErr } = await context.supabase
          .from("colaboradores")
          .select("matricula")
          .eq("id", data.colaborador_id)
          .maybeSingle();
        
        if (colabErr || !colab) {
          await logger("RESOLVE_COLABORADOR", colabErr || "Colaborador não encontrado", "VALIDATION");
          throw new Error("INVALID_PAYLOAD: Colaborador não encontrado para verificação de identidade.");
        }

      // Normalização básica: trim. O banco é a fonte da verdade.
      // O input validator do frontend já passou, mas aqui é o gate final.
      if (colab.matricula.trim() !== (data as any).manual_matricula?.trim()) {
        // Se origem é AUTOMATICO, o payload não traz manual_matricula explicitamente no schema auto, 
        // mas o middleware/componente pode ter injetado ou o client pode estar tentando burlar.
        // Como o payload discriminado para AUTOMATICO não tem matricula, validamos contra o que foi
        // usado na busca (se disponível no contexto de auditoria ou payload estendido).
        
        // Se houver um manual_matricula no payload bruto (mesmo que não no schema auto), validamos.
        const inputMatricula = (data as any).manual_matricula?.trim();
        if (inputMatricula && colab.matricula.trim() !== inputMatricula) {
           console.error("[P0-INTEGRITY] Divergência de matrícula detectada", {
             colaborador_id: data.colaborador_id,
             esperado: colab.matricula,
             recebido: inputMatricula
           });
           throw new Error("CONFLICT: Os dados do colaborador selecionado estão inconsistentes. Faça novamente a busca pela matrícula.");
        }
      }
    }

    // 1-4. auth + permissão + escopo:
    //  • AUTOMATICO → escopo do colaborador (deriva empresa/projeto)
    //  • MANUAL     → escopo do PROJETO informado (require_permission valida vínculo)
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createAbsence,
      colaboradorId: isManual ? null : data.colaborador_id,
      projetoId: isManual ? data.projeto_id : null,
      empresaId: isManual ? data.empresa_id : null,
      route: "/nova-ausencia",
      observacoes: isManual ? `lançamento manual (${data.manual_motivo})` : undefined,
    });


    // 5. hidratar snapshot de tipo/período pelo backend
    const [tipoRes, opcaoRes, userSnapshot] = await Promise.all([
      context.supabase.from("tipos_ausencia" as never).select("id, codigo, nome, ativo").eq("id", data.tipo_ausencia_id).maybeSingle(),
      context.supabase.from("opcoes_periodo_ausencia" as never).select("id, codigo, nome, quantidade_dias").eq("id", data.opcao_periodo_id).maybeSingle(),
      getSnapshot(context.supabase, context.userId),
    ]);
    const tipo = tipoRes.data as { codigo: string; nome: string; ativo: boolean } | null;
    const opcao = opcaoRes.data as { codigo: string; nome: string; quantidade_dias: number | null } | null;
    if (!tipo?.ativo) throw new Error("INVALID_PAYLOAD: tipo de ausência inexistente ou inativo");
    if (!opcao) throw new Error("INVALID_PAYLOAD: opção de período inexistente");

    const dias = opcao.quantidade_dias ?? 1;
    const dataFim = new Date(data.data_inicio + "T00:00:00");
    dataFim.setDate(dataFim.getDate() + Math.max(dias - 1, 0));

    const tipoBase =
      tipo.codigo.startsWith("ATESTADO") ? "ATESTADO"
      : tipo.codigo.startsWith("DECLARACAO") ? "DECLARACAO"
      : tipo.codigo.startsWith("FALTA") ? "FALTA"
      : tipo.codigo.startsWith("SUSPENSAO") ? "SUSPENSAO"
      : "OUTROS";

    const isAcidente = tipo.codigo === "ACIDENTE_TRABALHO";
    if (isAcidente) {
      if (!data.acidente_data || !data.acidente_hora || !data.acidente_local?.trim() || !data.acidente_descricao?.trim()) {
        throw new Error("INVALID_PAYLOAD: Acidente exige data, hora, local e descrição");
      }
    }

    const insertPayload = {
      // AUTOMATICO: empresa/projeto derivados do colaborador, NUNCA do cliente.
      // MANUAL: projeto/empresa informados, já validados pelo guard de escopo.
      empresa_id: gate.empresaId,
      projeto_id: gate.projetoId,
      ...(isManual
        ? manualColumns(data, gate.userId)
        : { origem_registro: "AUTOMATICO" as const, colaborador_id: data.colaborador_id }),
      tipo: tipoBase,

      tipo_detalhe: tipo.nome,
      dias_label: opcao.nome,
      tipo_ausencia_id: data.tipo_ausencia_id,
      opcao_periodo_id: data.opcao_periodo_id,
      motivo: data.motivo,
      data_inicio: data.data_inicio,
      data_fim: dataFim.toISOString().slice(0, 10),
      localidade: data.localidade,
      loja_codigo_nome: data.loja_codigo_nome,
      cid: data.cid && data.cid.trim() ? data.cid.trim().toUpperCase() : null,
      acidente_trabalho_trajeto: data.acidente_trabalho_trajeto,
      arquivo_url: data.arquivo_url ?? null,
      arquivo_nome: data.arquivo_nome ?? null,
      arquivo_mime: data.arquivo_mime ?? null,
      arquivo_tamanho: data.arquivo_tamanho ?? null,
      arquivo_criado_por: data.arquivo_url ? gate.userId : null,
      arquivo_criado_em: data.arquivo_url ? new Date().toISOString() : null,
      
      // Novos campos de horário para comparecimento parcial
      horario_inicio: data.horario_inicio ?? null,
      horario_fim: data.horario_fim ?? null,

      // Novos campos de autoria imutável
      criado_por_usuario_id: context.userId,
      autor_nome_snapshot: userSnapshot?.nome,
      autor_email_snapshot: userSnapshot?.email,
      autor_papel_snapshot: userSnapshot?.papel,
      status_documental: "ATIVO",

      // Auditoria Forense - Etapa 2 e 3
      operacao_origem: "WEB",
      operacao_ip: meta.ip,
      operacao_user_agent: meta.userAgent,
      operacao_sistema_operacional: meta.os,
      operacao_navegador: meta.browser,
      operacao_dispositivo_tipo: meta.deviceType,
      operacao_timestamp_utc: new Date().toISOString(),

      ...(isAcidente ? {
        acidente_data: data.acidente_data,
        acidente_hora: data.acidente_hora,
        acidente_local: data.acidente_local?.trim() ?? null,
        acidente_descricao: data.acidente_descricao?.trim() ?? null,
        acidente_atendimento_medico: data.acidente_atendimento_medico ?? null,
        acidente_houve_afastamento: data.acidente_houve_afastamento ?? null,
        acidente_dias_afastamento_inicial: data.acidente_dias_afastamento_inicial != null ? parseInt(String(data.acidente_dias_afastamento_inicial)) || 0 : null,
        acidente_cat_emitida: data.acidente_cat_emitida ?? null,
        acidente_observacoes: data.acidente_observacoes?.trim() ?? null,
      } : {}),
    };

    // Auditoria Forense - Etapa 1
    const hash = calculateIntegrityHash(insertPayload);
    (insertPayload as any).hash_integridade = hash;
    (insertPayload as any).hash_atual = hash;
    (insertPayload as any).hash_anterior = null;



    // 6. Hardening P0: Validação Antecipada de Conflito (Ignora EXCLUIDO/CANCELADO)
    const conflitos = await checkConflitosSeguro(context.supabase, {
      colaborador_id: isManual ? undefined : data.colaborador_id,
      data_inicio: data.data_inicio,
      data_fim: data.data_inicio,
      tipo: tipoBase,
      origem_registro: isManual ? "MANUAL" : "AUTOMATICO",
      manual_matricula: isManual ? (data as any).manual_matricula || undefined : undefined,
      empresa_id: gate.empresaId || undefined
    });



    if (conflitos.length > 0) {
      const conf = conflitos[0];
      await logger("CHECK_CONFLICT", `Conflito detectado com protocolo ${conf.protocolo}`, "DUPLICITY", "P2");
      throw new Error(`CONFLICT: Já existe um lançamento de ${conf.tipo} para este período (Protocolo: ${conf.protocolo}).`);
    }

    // 7. mutação — RLS + trigger de supervisor continuam ativos como 2ª camada
    //
    // MANUAL: o colaborador informado à mão é persistido (find-or-create por
    // matrícula normalizada dentro da empresa) e a ausência nasce vinculada a
    // ele — tudo na MESMA transação da RPC (rollback total em qualquer falha).
    let rowId: string;
    let protocolo: string | null = null;
    let colaboradorId: string | null = null;
    let colaboradorCriado = false;


    if (isManual) {
      // Determinar o supervisor responsável:
      // - Supervisor logado: ele mesmo.
      // - Coordenador: usa o ID selecionado na tela (que o servidor revalida na RPC).
      const supervisorUsuarioId = data.manual_supervisor_usuario_id || null;


      const manualCols = manualColumns(data, gate.userId);
      const { data: res, error } = await context.supabase.rpc(
        "registrar_ausencia_com_colaborador_manual",
        {
          _colaborador: {
            empresa_id: gate.empresaId,
            projeto_id: gate.projetoId,
            matricula: manualCols.manual_matricula,
            nome_completo: manualCols.manual_nome,
            telefone: manualCols.manual_telefone,
            whatsapp: manualCols.manual_whatsapp,
            email: manualCols.manual_email,
            supervisor_nome: manualCols.manual_supervisor_nome,
            supervisor_telefone: manualCols.manual_supervisor_telefone,
            supervisor_usuario_id: supervisorUsuarioId,
          },
          _ausencia: insertPayload,
        } as never,
      );
      if (error) {
        // As mensagens de hardening ("Já está vinculado a outro projeto/supervisor") 
        // são capturadas aqui pela RPC e formatadas pelo ausenciaDbError.
        throw ausenciaDbError(error, "rpc_manual", gate.correlationId);
      }


      const out = (res ?? {}) as {
        colaborador_id?: string; colaborador_criado?: boolean;
        ausencia_id?: string; protocolo?: string | null;
      };
      if (!out.ausencia_id) throw new Error("CONFLICT: falha ao registrar a ausência");
      rowId = out.ausencia_id;
      protocolo = out.protocolo ?? null;
      colaboradorId = out.colaborador_id ?? null;
      colaboradorCriado = !!out.colaborador_criado;

      if (colaboradorCriado && colaboradorId) {
        await audit(context.supabase, "COLABORADOR_CRIADO" as never, colaboradorId, gate.correlationId,
          null,
          {
            origem: "formulario_ausencia_manual",
            matricula: manualCols.manual_matricula,
            empresa_id: gate.empresaId,
            projeto_id: gate.projetoId,
            supervisor_usuario_id: supervisorUsuarioId,
          },
          "colaborador criado automaticamente a partir do lançamento manual de ausência",
          gate.empresaId, gate.projetoId,
        );
      }
    } else {
      const { data: row, error } = await context.supabase
        .from("ausencias")
        .insert(insertPayload as never)
        .select("id, empresa_id, projeto_id, protocolo, status")
        .single();
      if (error) {
        await logger("CREATE_ABSENCE", error, "DATABASE", "P1");
        throw ausenciaDbError(error, "insert_ausencia", gate.correlationId);
      }

      rowId = row.id as string;
      protocolo = (row.protocolo as string | null) ?? null;
      colaboradorId = data.colaborador_id;
    }

    await audit(context.supabase, "AUSENCIA_CRIADA", rowId, gate.correlationId,
      null,
      {
        origem_registro: isManual ? "MANUAL" : "AUTOMATICO",
        colaborador_id: colaboradorId,
        ...(isManual
          ? {
              manual_motivo: data.manual_motivo,
              manual_motivo_detalhe: data.manual_motivo_detalhe ?? null,
              manual_nome: data.manual_nome,
              manual_matricula: data.manual_matricula,
              colaborador_criado_automaticamente: colaboradorCriado,
            }
          : {}),
        tipo: tipoBase, tipo_detalhe: tipo.nome, dias,
        data_inicio: insertPayload.data_inicio, data_fim: insertPayload.data_fim,
        cid: insertPayload.cid, protocolo,
      },
      isManual
        ? `criação (preenchimento manual — motivo: ${data.manual_motivo})`
        : "criação",
      gate.empresaId, gate.projetoId,
      context.userId,
    );


    // 8. Notificações
    await enfileirarNotificacoesAusencia({
      supabase: context.supabase,
      ausenciaId: rowId,
      evento: "AUSENCIA_CRIADA",
      correlationId: gate.correlationId,
      userId: gate.userId,
    });

      return {
        id: rowId,
        protocolo,
        colaborador_id: colaboradorId,
        colaborador_criado: colaboradorCriado,
        correlation_id: gate.correlationId,
      };
    } catch (err: any) {
      // ETAPA 7 — HARDENING CONTRA NOVOS ÓRFÃOS
      // Se houver arquivo_url e a criação da ausência falhou, tentamos remover o objeto órfão.
      if (data.arquivo_url) {
        console.warn(`[P0-ORPHAN-PREVENTION] Falha na criação da ausência (Server). Tentando remover objeto órfão: ${data.arquivo_url}. Motivo da falha: ${err instanceof Error ? err.message : String(err)}`);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.storage.from("atestados").remove([data.arquivo_url]);
        } catch (storageErr) {
          console.error("[P0-ORPHAN-PREVENTION] Exceção ao remover objeto órfão:", storageErr);
        }
      }

      if (err.message?.includes("CONFLICT") || err.message?.includes("INVALID_PAYLOAD")) {
        throw err;
      }

      const { logAppError } = await import("./observability.server");
      return logAppError({
        traceId,
        userId: context.userId,
        module: "ausencias",
        operation: "createAusencia",
        category: "UNKNOWN",
        severity: "P1"
      }, err);
    }
  });




// ==================== UPDATE ====================
const updatePayloadSchema = z.discriminatedUnion("origem_registro", [
  autoPayloadSchema.extend({ id: uuid }),
  manualPayloadSchema.extend({ id: uuid }),
]);

/**
 * Reatribui o processamento de uma ausência para o usuário logado.
 */
export const reatribuirProcessamentoAdm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      ausencia_id: uuid,
      responsavel_anterior_id: uuid,
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("reatribuir_processamento_ausencia", {
      _ausencia_id: data.ausencia_id,
      _responsavel_anterior_id: data.responsavel_anterior_id,
    });
    if (error) throw error;
    return res as { success: boolean; novo_responsavel_nome: string };
  });

export const updateAusencia = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return updatePayloadSchema.parse(data); } catch (e) { throw toInvalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const isManual = data.origem_registro === "MANUAL";
    const request = getRequest();
    const meta = resolveOperationMetadata(request);

    // Carrega registro atual — para gate por colaborador ATUAL, não pelo enviado.
    const { data: current, error: loadErr } = await context.supabase
      .from("ausencias")
      .select("id, empresa_id, projeto_id, colaborador_id, origem_registro, status, tipo, tipo_detalhe, dias, motivo, cid, data_inicio, data_fim, localidade, loja_codigo_nome, acidente_trabalho_trajeto, arquivo_url, arquivo_nome, arquivo_mime, arquivo_tamanho, hash_integridade")
      .eq("id", data.id)
      .maybeSingle();
    if (loadErr) throw new Error(`RESOURCE_NOT_FOUND: ${loadErr.message}`);
    if (!current) throw new Error("RESOURCE_NOT_FOUND: ausência não encontrada");
    if (current.status === "LANCADO") throw new Error("CONFLICT: registro já foi lançado e não pode ser alterado");
    // Origem é imutável — evita converter manual↔automático e burlar escopo.
    if ((current.origem_registro ?? "AUTOMATICO") !== data.origem_registro) {
      throw new Error("INVALID_PAYLOAD: a origem do registro não pode ser alterada");
    }
    // Muda de colaborador? bloqueia — evita bypass de escopo.
    if (!isManual && data.colaborador_id !== current.colaborador_id) {
      throw new Error("INVALID_PAYLOAD: colaborador não pode ser alterado após criação");
    }
    // Manual: empresa/projeto também são imutáveis após a criação.
    if (isManual && (data.projeto_id !== current.projeto_id || data.empresa_id !== current.empresa_id)) {
      throw new Error("INVALID_PAYLOAD: empresa/projeto não podem ser alterados após criação");
    }

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateAbsence,
      colaboradorId: isManual ? null : (current.colaborador_id as string),
      projetoId: isManual ? (current.projeto_id as string) : null,
      route: "/nova-ausencia",
    });


    const [tipoRes, opcaoRes] = await Promise.all([
      context.supabase.from("tipos_ausencia" as never).select("codigo, nome, ativo").eq("id", data.tipo_ausencia_id).maybeSingle(),
      context.supabase.from("opcoes_periodo_ausencia" as never).select("codigo, nome, quantidade_dias").eq("id", data.opcao_periodo_id).maybeSingle(),
    ]);
    const tipo = tipoRes.data as { codigo: string; nome: string; ativo: boolean } | null;
    const opcao = opcaoRes.data as { codigo: string; nome: string; quantidade_dias: number | null } | null;
    if (!tipo?.ativo) throw new Error("INVALID_PAYLOAD: tipo inválido");
    if (!opcao) throw new Error("INVALID_PAYLOAD: opção de período inválida");

    const dias = opcao.quantidade_dias ?? 1;
    const dataFim = new Date(data.data_inicio + "T00:00:00");
    dataFim.setDate(dataFim.getDate() + Math.max(dias - 1, 0));
    const tipoBase =
      tipo.codigo.startsWith("ATESTADO") ? "ATESTADO"
      : tipo.codigo.startsWith("DECLARACAO") ? "DECLARACAO"
      : tipo.codigo.startsWith("FALTA") ? "FALTA"
      : tipo.codigo.startsWith("SUSPENSAO") ? "SUSPENSAO"
      : "OUTROS";

    const isAcidenteU = tipo.codigo === "ACIDENTE_TRABALHO";
    if (isAcidenteU) {
      if (!data.acidente_data || !data.acidente_hora || !data.acidente_local?.trim() || !data.acidente_descricao?.trim()) {
        throw new Error("INVALID_PAYLOAD: Acidente exige data, hora, local e descrição");
      }
    }

    // Em registros manuais os dados digitados continuam editáveis enquanto PENDENTE.
    const manualUpdate = isManual
      ? (() => {
          const { manual_registrado_por: _p, manual_registrado_em: _e, ...rest } =
            manualColumns(data, gate.userId);
          return rest;
        })()
      : {};

    const updatePayload = {
      ...manualUpdate,
      tipo: tipoBase,

      tipo_detalhe: tipo.nome,
      dias_label: opcao.nome,
      tipo_ausencia_id: data.tipo_ausencia_id,
      opcao_periodo_id: data.opcao_periodo_id,
      motivo: data.motivo,
      data_inicio: data.data_inicio,
      data_fim: dataFim.toISOString().slice(0, 10),
      localidade: data.localidade,
      loja_codigo_nome: data.loja_codigo_nome,
      cid: data.cid && data.cid.trim() ? data.cid.trim().toUpperCase() : null,
      acidente_trabalho_trajeto: data.acidente_trabalho_trajeto,
      horario_inicio: data.horario_inicio ?? null,
      horario_fim: data.horario_fim ?? null,
      arquivo_url: data.arquivo_url ?? current.arquivo_url,
      arquivo_nome: data.arquivo_nome ?? current.arquivo_nome,
      arquivo_mime: data.arquivo_mime ?? current.arquivo_mime,
      arquivo_tamanho: data.arquivo_tamanho ?? current.arquivo_tamanho,
      // Novos campos de autoria
      atualizado_por_usuario_id: context.userId,
      atualizado_em: new Date().toISOString(),

      // Auditoria Forense - Etapa 1, 2 e 3
      operacao_origem: "WEB",
      operacao_ip: meta.ip,
      operacao_user_agent: meta.userAgent,
      operacao_sistema_operacional: meta.os,
      operacao_navegador: meta.browser,
      operacao_dispositivo_tipo: meta.deviceType,
      operacao_timestamp_utc: new Date().toISOString(),

      ...(isAcidenteU ? {
        acidente_data: data.acidente_data,
        acidente_hora: data.acidente_hora,
        acidente_local: data.acidente_local?.trim() ?? null,
        acidente_descricao: data.acidente_descricao?.trim() ?? null,
        acidente_atendimento_medico: data.acidente_atendimento_medico ?? null,
        acidente_houve_afastamento: data.acidente_houve_afastamento ?? null,
        acidente_dias_afastamento_inicial: data.acidente_dias_afastamento_inicial != null ? parseInt(String(data.acidente_dias_afastamento_inicial)) || 0 : null,
        acidente_cat_emitida: data.acidente_cat_emitida ?? null,
        acidente_observacoes: data.acidente_observacoes?.trim() ?? null,
      } : {}),
    };

    // Auditoria Forense - Etapa 1
    const newHash = calculateIntegrityHash(updatePayload, current.hash_integridade);
    (updatePayload as any).hash_integridade = newHash;
    (updatePayload as any).hash_atual = newHash;
    (updatePayload as any).hash_anterior = current.hash_integridade;

    // Auditoria Forense - Etapa 4 (Field-Level Audit)
    const fieldsToAudit = [
      'tipo_ausencia_id', 'opcao_periodo_id', 'motivo', 'data_inicio', 'data_fim',
      'localidade', 'loja_codigo_nome', 'cid', 'acidente_trabalho_trajeto'
    ];
    
    const audits = [];
    const snapshot = await getSnapshot(context.supabase, context.userId);
    
    for (const field of fieldsToAudit) {
      const oldVal = (current as any)[field];
      const newVal = (updatePayload as any)[field];
      
      if (oldVal !== newVal) {
        audits.push({
          ausencia_id: data.id,
          campo: field,
          valor_anterior: oldVal,
          valor_novo: newVal,
          responsavel_usuario_id: context.userId,
          responsavel_nome: snapshot?.nome,
          responsavel_papel: snapshot?.papel,
          correlation_id: gate.correlationId
        });
      }
    }

    if (audits.length > 0) {
      await context.supabase.from("ausencia_field_audit").insert(audits);
    }



    const { error } = await context.supabase
      .from("ausencias")
      .update(updatePayload as never)
      .eq("id", data.id)
      .eq("status", "PENDENTE");
    if (error) {
      throw ausenciaDbError(error, "update_ausencia", gate.correlationId);
    }

    await audit(context.supabase, "AUSENCIA_EDITADA", data.id, gate.correlationId,
      { tipo: current.tipo, tipo_detalhe: current.tipo_detalhe, motivo: current.motivo, cid: current.cid, data_inicio: current.data_inicio, data_fim: current.data_fim, localidade: current.localidade, loja_codigo_nome: current.loja_codigo_nome, acidente_trabalho_trajeto: current.acidente_trabalho_trajeto },
      { tipo: tipoBase, tipo_detalhe: tipo.nome, motivo: updatePayload.motivo, cid: updatePayload.cid, data_inicio: updatePayload.data_inicio, data_fim: updatePayload.data_fim, localidade: updatePayload.localidade, loja_codigo_nome: updatePayload.loja_codigo_nome, acidente_trabalho_trajeto: updatePayload.acidente_trabalho_trajeto },
      "edição",
      gate.empresaId, gate.projetoId,
      context.userId,
    );


    // 8. Notificações (apenas se houver mudança relevante)
    const mudancaRelevante = 
      current.data_inicio !== updatePayload.data_inicio ||
      current.data_fim !== updatePayload.data_fim ||
      current.tipo_detalhe !== updatePayload.tipo_detalhe;

    if (mudancaRelevante) {
      await enfileirarNotificacoesAusencia({
        supabase: context.supabase,
        ausenciaId: data.id,
        evento: "AUSENCIA_RETIFICADA",
        correlationId: gate.correlationId,
        userId: gate.userId,
      });
    }

    return { ok: true, correlation_id: gate.correlationId };

  });

// ==================== DELETE (Lógica) ====================
const deleteSchema = z.object({
  id: uuid,
  categoria_motivo: z.string().min(1),
  motivo: z.string().min(1),
  is_error_manual: z.boolean().optional(),
});

export const deleteAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return deleteSchema.parse(data); } catch (e) { throw toInvalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current, error: fetchErr } = await context.supabase
      .from("ausencias")
      .select("id, colaborador_id, empresa_id, projeto_id, status, protocolo, data_inicio, data_fim")
      .eq("id", data.id)
      .maybeSingle();
    
    if (fetchErr) throw new Error(`DATABASE_ERROR: ${fetchErr.message}`);
    if (!current) throw new Error("RESOURCE_NOT_FOUND: ausência não encontrada");

    // Permissão: super_admin ou rh
    const { data: userRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const roles = userRoles?.map(r => r.role) ?? [];
    if (!roles.includes("super_admin") && !roles.includes("rh")) {
      throw new Error("FORBIDDEN: Apenas RH e Super Admin podem excluir lançamentos.");
    }

    const correlationId = `EXC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Chamar RPC de exclusão segura
    const { data: res, error: rpcErr } = await context.supabase.rpc("excluir_ausencia_segura" as any, {
      p_ausencia_id: data.id,
      p_categoria_motivo: data.categoria_motivo,
      p_motivo: data.motivo,
      p_is_error_manual: data.is_error_manual ?? null
    });

    if (rpcErr) {
      throw ausenciaDbError(rpcErr, "delete_ausencia", correlationId);
    }

    // Notificar os envolvidos
    try {
      await enfileirarNotificacoesAusencia({
        supabase: context.supabase,
        ausenciaId: data.id,
        evento: "AUSENCIA_EXCLUIDA",
        correlationId: correlationId,
        userId: context.userId,
      });
    } catch (notifErr) {
      console.error("[Notificação de Exclusão] Falha não impeditiva:", notifErr);
    }

    return { ok: true, correlation_id: correlationId };
  });

// ==================== STATUS ====================
export const alterarStatusAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return z.object({
        id: uuid,
        status: z.enum(["PENDENTE", "LANCADO"]),
      }).parse(data);
    } catch (e) { throw toInvalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("ausencias")
      .select("id, colaborador_id, projeto_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("RESOURCE_NOT_FOUND: ausência não encontrada");
    if (current.status === data.status) throw new Error("CONFLICT: status já é o solicitado");

    // Alterar status é uma edição — exige ausencia.editar + escopo
    // (colaborador quando automático; projeto quando manual).
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateAbsence,
      colaboradorId: (current.colaborador_id as string | null) ?? null,
      projetoId: current.colaborador_id ? null : (current.projeto_id as string),
      route: "/ausencias",
    });


    const isLancando = data.status === "LANCADO";
    const updatePayload = {
      status: data.status,
      ...(isLancando ? {
        lancado_por_usuario_id: context.userId,
        lancado_em: new Date().toISOString(),
      } : {})
    };

    const { error } = await context.supabase
      .from("ausencias")
      .update(updatePayload as never)
      .eq("id", data.id);
    if (error) {
      throw ausenciaDbError(error, "status_ausencia", gate.correlationId);
    }

    await audit(context.supabase, "AUSENCIA_STATUS_ALTERADO", data.id, gate.correlationId,
      { status: current.status }, { status: data.status },
      `status: ${current.status} → ${data.status}`,
      gate.empresaId ?? undefined, gate.projetoId ?? undefined,
      context.userId,
    );

    return { ok: true, correlation_id: gate.correlationId };
  });

/**
 * ETAPA 6: Nova Ação — Alterar status de processamento administrativo interno.
 * Somente RH, Compliance e Super Admin.
 */
export const processarAusenciaInterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const uuid = z.string().uuid();
    return z.object({
      ausencia_id: uuid,
      novo_status: z.enum(["AGUARDANDO", "EM_PROCESSAMENTO", "PROCESSADO"]),
      observacao: z.string().trim().max(1000).nullable().optional(),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    // Validação de Papel (RH, Compliance, Admin)
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const userRoles = roles?.map(r => r.role) ?? [];
    const hasAccess = userRoles.some(r => ["super_admin", "rh", "compliance"].includes(r));

    if (!hasAccess) {
      throw new Error("FORBIDDEN: Acesso negado. Somente RH, Compliance ou Admin podem alterar o processamento.");
    }

    const { error } = await context.supabase.rpc("processar_ausencia", {
      _ausencia_id: data.ausencia_id,
      _novo_status: data.novo_status as StatusProcessamento,
      _observacao: data.observacao ?? undefined,
    });


    if (error) {
       throw error; 
    }

    return { success: true };
  });

/**
 * FASE 2: Iniciar processamento administrativo com trava de concorrência.
 */
export const iniciarProcessamentoAdm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({ ausencia_id: uuid }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("iniciar_processamento_ausencia", {
      _ausencia_id: data.ausencia_id,
    });
    if (error) throw error;
    return res as { success: boolean; status: string };
  });

/**
 * FASE 2: Iniciar processamento de um GRUPO de ausências (Colaborador + Projeto).
 * Transacional: Tenta assumir todas as elegíveis que ainda estão em AGUARDANDO.
 */
export const iniciarProcessamentoGrupoAdm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({ 
      colaborador_id: uuid.nullable().optional(),
      colaborador_matricula: z.string().optional(),
      projeto_id: uuid 
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    // Busca registros elegíveis do grupo
    let query = context.supabase
      .from("ausencias")
      .select("id")
      .eq("projeto_id", data.projeto_id)
      .eq("status_processamento", "AGUARDANDO");

    if (data.colaborador_id) {
      query = query.eq("colaborador_id", data.colaborador_id);
    } else if (data.colaborador_matricula) {
      query = query.eq("manual_matricula", data.colaborador_matricula);
    } else {
      throw new Error("Colaborador não identificado para o grupo.");
    }

    const { data: pendentes, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!pendentes || pendentes.length === 0) {
      return { success: false, message: "Nenhuma pendência disponível para este grupo." };
    }

    const resultados = [];
    for (const p of pendentes) {
      const { data: res, error } = await context.supabase.rpc("iniciar_processamento_ausencia", {
        _ausencia_id: p.id,
      });
      const typedRes = res as unknown as { success: boolean; status: string } | null;
      if (!error && typedRes?.success) {
        resultados.push(p.id);
      }
    }

    return { 
      success: resultados.length > 0, 
      count: resultados.length,
      total: pendentes.length 
    };
  });

/**
 * FASE 2: Concluir processamento administrativo.
 */
export const concluirProcessamentoAdm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      ausencia_id: uuid,
      observacao: z.string().trim().max(1000).nullable().optional(),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("concluir_processamento_ausencia", {
      _ausencia_id: data.ausencia_id,
      _observacao: data.observacao ?? undefined,
    });
    if (error) throw error;
    return res as { success: boolean; status: string };
  });

/**
 * FASE 2: Obter KPIs da Central de Processamento.
 */
export const getCentralProcessamentoKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Validação de Papel (Centralizado)
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const userRoles = roles?.map(r => r.role) ?? [];
    const hasAccess = userRoles.some(r => ["super_admin", "rh", "compliance"].includes(r));

    if (!hasAccess) {
      throw new Error("FORBIDDEN: Acesso negado. Apenas usuários do RH, Compliance ou Super Admin podem acessar a Central de Processamento.");
    }

    const { data: kpis, error } = await context.supabase.rpc("get_processamento_kpis");
    if (error) throw error;
    return kpis as {
      backlog: number;
      em_processamento: number;
      processados_hoje: number;
      fora_sla: number;
    };
  });

/**
 * Detecta conflitos de ausência (sobreposição entre falta e atestado).
 */
export const checkConflitosAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      colaborador_id: uuid.nullable().optional(),
      data_inicio: iso,
      data_fim: iso,
      tipo: z.enum(["FALTA", "ATESTADO", "DECLARACAO", "SUSPENSAO", "OUTROS"]),
      origem_registro: z.enum(["AUTOMATICO", "MANUAL"]),
      manual_matricula: z.string().nullable().optional(),
      empresa_id: uuid.nullable().optional(),
      projeto_id: uuid.nullable().optional(),
      _supervisor_id: uuid.nullable().optional(),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: conflitos, error } = await context.supabase.rpc("detectar_conflitos_ausencia", {
      _colaborador_id: data.colaborador_id || (null as any),
      _data_inicio: data.data_inicio,
      _data_fim: data.data_fim,
      _tipo: data.tipo,
      _origem_registro: data.origem_registro,
      _manual_matricula: data.manual_matricula || (null as any),
      _empresa_id: data.empresa_id || (null as any),
      _projeto_id: data.projeto_id || (null as any),
      _supervisor_id: (data as any)._supervisor_id || (null as any),
    } as any);


    if (error) throw error;
    return (conflitos || []) as Array<{
      id: string;
      tipo: string;
      data_inicio: string;
      data_fim: string;
      registrado_por: string;
      registrado_em: string;
      protocolo: string | null;
      status: string;
      registrado_por_nome: string | null;
    }>;
  });

/**
 * Substitui uma ausência em conflito por uma nova.
 */
export const substituirAusenciaConflito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      ausencia_id_antiga: uuid,
      dados_nova_ausencia: z.any(), // Reutiliza o payload de createAusencia
      motivo_substituicao: z.string().trim().min(5).max(500),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    // Validação de permissão simplificada: a RPC já roda com SECURITY DEFINER
    // e revalida escopo internamente se necessário (via triggers), 
    // mas aqui garantimos que o usuário pode criar ausências.
    await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createAbsence,
      route: "/nova-ausencia",
      observacoes: "substituição de conflito",
    });

    const { data: novaId, error } = await context.supabase.rpc("substituir_ausencia_conflito", {
      _ausencia_id_antiga: data.ausencia_id_antiga,
      _dados_nova_ausencia: data.dados_nova_ausencia,
      _motivo_substituicao: data.motivo_substituicao,
    });

    if (error) throw ausenciaDbError(error, "insert_ausencia");
    return { id: novaId as string };
  });

/**
 * KPIs de Conversão para o Dashboard.
 */
export const getAusenciaConversoesKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      data_inicio: iso,
      data_fim: iso,
      empresa_id: uuid.optional(),
      projeto_id: uuid.optional(),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: stats, error } = await context.supabase.rpc("get_ausencia_conversoes_stats", {
      _data_inicio: data.data_inicio,
      _data_fim: data.data_fim,
      _empresa_id: data.empresa_id || null,
      _projeto_id: data.projeto_id || null,
    } as any);


    if (error) throw error;
    return (stats?.[0] || { total_conversoes: 0, tempo_medio_conversao_horas: 0 }) as {
      total_conversoes: number;
      tempo_medio_conversao_horas: number;
    };
  });





/**
 * ETAPA 6: Registrar Contestação de Ausência.
 */
export const contestarAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      ausencia_id: uuid,
      motivo: z.string().trim().min(5).max(100),
      descricao: z.string().trim().min(10).max(1000),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    // Escopo: quem pode ver a ausência pode contestar? 
    // O requisito diz: RH, Compliance, Super Admin, Supervisor e Coordenador responsável.
    // Vamos usar o gate de leitura da ausência para validar se o usuário tem vínculo.
    const { data: current } = await context.supabase
      .from("ausencias")
      .select("id, colaborador_id, projeto_id, empresa_id, status, protocolo")
      .eq("id", data.ausencia_id)
      .maybeSingle();
      
    if (!current) throw new Error("RESOURCE_NOT_FOUND: ausência não encontrada");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.viewAbsence, // Se pode ver, pode solicitar contestação
      colaboradorId: (current.colaborador_id as string | null) ?? null,
      projetoId: current.colaborador_id ? null : (current.projeto_id as string),
    });

    // 1. Criar a contestação
    const { data: contestacao, error: contestErr } = await context.supabase
      .from("ausencia_contestacoes")
      .insert({
        ausencia_id: data.ausencia_id,
        solicitante_usuario_id: context.userId,
        motivo: data.motivo,
        descricao: data.descricao,
        status: "ABERTA",
      } as any)
      .select("id")
      .single();

    if (contestErr) throw contestErr;

    // 2. Marcar ausência como contestada
    await context.supabase
      .from("ausencias")
      .update({ status_documental: "CONTESTADO" } as any)
      .eq("id", data.ausencia_id);

    // 3. Auditoria
    await audit(context.supabase, "CONTESTACAO_ABERTA", data.ausencia_id, gate.correlationId,
      null, { contestacao_id: contestacao.id, motivo: data.motivo },
      `contestação aberta: ${data.motivo}`,
      gate.empresaId, gate.projetoId,
      context.userId,
    );

    return { success: true, id: contestacao.id };
  });

/**
 * ETAPA 7: Resolver Contestação e Corrigir Lançamento.
 */
export const resolverContestacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z.object({
      contestacao_id: uuid,
      status: z.enum(["PROCEDENTE", "IMPROCEDENTE"]),
      acao: z.enum(["CANCELAR", "RETIFICAR", "MANTER"]),
      justificativa: z.string().trim().min(10).max(1000),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    // Apenas RH, Compliance ou Admin podem resolver
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const userRoles = roles?.map(r => r.role) ?? [];
    const hasAccess = userRoles.some(r => ["super_admin", "rh", "compliance"].includes(r));

    if (!hasAccess) {
      throw new Error("FORBIDDEN: Apenas RH, Compliance ou Admin podem resolver contestações.");
    }

    const { data: contest, error: loadErr } = await context.supabase
      .from("ausencia_contestacoes")
      .select("*, ausencias(*)")
      .eq("id", data.contestacao_id)
      .maybeSingle();

    if (loadErr || !contest) throw new Error("RESOURCE_NOT_FOUND: contestação não encontrada");

    const aus = contest.ausencias as any;
    
    // 1. Atualizar a contestação
    await context.supabase
      .from("ausencia_contestacoes")
      .update({
        status: data.status === "PROCEDENTE" ? "CORRIGIDA" : "IMPROCEDENTE",
        resolvido_em: new Date().toISOString(),
        resolvido_por: context.userId,
      } as any)
      .eq("id", data.contestacao_id);

    // 2. Aplicar ação na ausência
    let novoStatusDoc = "ATIVO";
    if (data.status === "PROCEDENTE") {
      if (data.acao === "CANCELAR") novoStatusDoc = "CANCELADO";
      else if (data.acao === "RETIFICAR") novoStatusDoc = "RETIFICADO";
    }

    await context.supabase
      .from("ausencias")
      .update({ 
        status_documental: novoStatusDoc,
        ...(data.acao === "CANCELAR" ? { status: "PENDENTE" } : {}) // Reset status if cancelled? Or maybe we need a dedicated CANCELADO status.
      } as any)
      .eq("id", aus.id);

    // 3. Auditoria
    await audit(context.supabase, "CONTESTACAO_RESOLVIDA", aus.id, crypto.randomUUID(),
      { status_anterior: contest.status }, 
      { status_novo: data.status, acao: data.acao, justificativa: data.justificativa },
      `contestação resolvida: ${data.status} (${data.acao})`,
      aus.empresa_id, aus.projeto_id,
      context.userId,
    );

    // 4. Notificar (Etapa 8)
    if (novoStatusDoc === "CANCELADO" || novoStatusDoc === "RETIFICADO") {
       await enfileirarNotificacoesAusencia({
        supabase: context.supabase,
        ausenciaId: aus.id,
        evento: "AUSENCIA_RETIFICADA",
        correlationId: crypto.randomUUID(),
        userId: context.userId,
      });
    }

    return { success: true };
  });
