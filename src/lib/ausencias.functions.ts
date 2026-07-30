// Ausências — Server Functions com hardening RBAC Fase 3 (Onda 1).
//
// TODAS as mutações de ausência agora passam por aqui. Nunca chame
// supabase.from("ausencias").insert/update/delete direto do client.
//
// Ordem de decisão (por Server Function):
//   1. auth (via requireSupabaseAuth)
//   2. PermissionCode via PERMISSION_MAP
//   3. public.has_permission
//   4. escopo de colaborador (deriva projeto+empresa)
//   5. RLS (2ª camada)
//   6. Regra de negócio
//   7. Mutação
//   8. Auditoria com correlation_id

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";

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
  // Campos específicos de Acidente de Trabalho (opcionais no schema; obrigatoriedade
  // é revalidada no handler quando o tipo selecionado é ACIDENTE_TRABALHO).
  acidente_data: iso.nullable().optional(),
  acidente_hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  acidente_local: z.string().trim().max(200).nullable().optional(),
  acidente_descricao: z.string().trim().max(2000).nullable().optional(),
  acidente_atendimento_medico: z.boolean().nullable().optional(),
  acidente_houve_afastamento: z.boolean().nullable().optional(),
  acidente_dias_afastamento_inicial: z.number().int().min(0).max(3650).nullable().optional(),
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
  manual_nome: z.string().trim().min(3).max(150),
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

  // Permissão / RLS
  if (sqlstate === "42501" || /row-level security|permission denied|not authorized/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso");
  }

  if (/fora do seu escopo|não pertence à empresa informada|não está vinculado a você/i.test(msg)) {
    return new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso");
  }

  // Duplicidade (trigger trg_ausencias_bloqueia_duplicidade — SQLSTATE 23505)
  if (sqlstate === "23505" || /DUPLICIDADE_AUSENCIA/i.test(msg)) {
    const limpa = msg.replace(/^.*DUPLICIDADE_AUSENCIA:\s*/s, "").trim();
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
  acao: "AUSENCIA_CRIADA" | "AUSENCIA_EDITADA" | "AUSENCIA_EXCLUIDA" | "AUSENCIA_STATUS_ALTERADO",
  registroId: string | null,
  correlationId: string,
  antes: unknown,
  depois: unknown,
  observacoes: string,
  empresaId?: string | null,
  projetoId?: string | null,
) {
  try {
    await supabase.rpc("log_audit_event", {
      _modulo: "ausencias",
      _acao: acao as never,
      _entidade: "Ausência",
      _registro_id: registroId,
      _empresa_id: empresaId ?? null,
      _projeto_id: projetoId ?? null,
      _antes: (antes ?? null) as never,
      _depois: (depois ?? null) as never,
      _sucesso: true,
      _observacoes: `[corr=${correlationId}] ${observacoes}`,
      _origem: "server",
    } as never);
  } catch { /* auditoria não pode quebrar */ }
}

// ==================== CREATE ====================
export const createAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return basePayloadSchema.parse(data); } catch (e) { throw toInvalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const isManual = data.origem_registro === "MANUAL";
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
    const [tipoRes, opcaoRes] = await Promise.all([
      context.supabase.from("tipos_ausencia" as never).select("id, codigo, nome, ativo").eq("id", data.tipo_ausencia_id).maybeSingle(),
      context.supabase.from("opcoes_periodo_ausencia" as never).select("id, codigo, nome, quantidade_dias").eq("id", data.opcao_periodo_id).maybeSingle(),
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
      ...(isAcidente ? {
        acidente_data: data.acidente_data,
        acidente_hora: data.acidente_hora,
        acidente_local: data.acidente_local?.trim() ?? null,
        acidente_descricao: data.acidente_descricao?.trim() ?? null,
        acidente_atendimento_medico: data.acidente_atendimento_medico ?? null,
        acidente_houve_afastamento: data.acidente_houve_afastamento ?? null,
        acidente_dias_afastamento_inicial: data.acidente_dias_afastamento_inicial ?? null,
        acidente_cat_emitida: data.acidente_cat_emitida ?? null,
        acidente_observacoes: data.acidente_observacoes?.trim() ?? null,
      } : {}),
    };


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
      // Supervisor que lança assume a chave canônica do vínculo.
      // Coordenador: usa o Supervisor escolhido na tela — a RPC revalida no
      // servidor se ele pertence à coordenação (nunca confiar na lista suspensa).
      let supervisorUsuarioId: string | null = null;
      try {
        const { data: isSup } = await context.supabase.rpc("has_role", {
          _user_id: gate.userId, _role: "supervisor",
        } as never);
        if (isSup) supervisorUsuarioId = gate.userId;
      } catch { /* best-effort */ }
      if (!supervisorUsuarioId && data.manual_supervisor_usuario_id) {
        supervisorUsuarioId = data.manual_supervisor_usuario_id;
      }


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
        const msg = error.message || "";
        // Duplicidade e escopo têm precedência: a mensagem de duplicidade cita
        // "colaborador" e antes era engolida pelo ramo de falha de cadastro.
        const classificado = ausenciaDbError(error, "rpc_manual", gate.correlationId);
        if (
          !/DUPLICIDADE_AUSENCIA/i.test(msg) &&
          !classificado.message.startsWith("PROJECT_SCOPE_DENIED") &&
          /colaborador/i.test(msg) &&
          /salvar|inserir|insert|colaboradores/i.test(msg)
        ) {
          throw new Error("COLLABORATOR_SAVE_FAILED: Não foi possível salvar o colaborador. Revise os dados informados e tente novamente.");
        }
        throw classificado;
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
    );

    return {
      id: rowId,
      protocolo,
      colaborador_id: colaboradorId,
      colaborador_criado: colaboradorCriado,
      correlation_id: gate.correlationId,
    };
  });


// ==================== UPDATE ====================
const updatePayloadSchema = z.discriminatedUnion("origem_registro", [
  autoPayloadSchema.extend({ id: uuid }),
  manualPayloadSchema.extend({ id: uuid }),
]);

export const updateAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return updatePayloadSchema.parse(data); } catch (e) { throw toInvalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const isManual = data.origem_registro === "MANUAL";
    // Carrega registro atual — para gate por colaborador ATUAL, não pelo enviado.
    const { data: current, error: loadErr } = await context.supabase
      .from("ausencias")
      .select("id, empresa_id, projeto_id, colaborador_id, origem_registro, status, tipo, tipo_detalhe, dias, motivo, cid, data_inicio, data_fim, localidade, loja_codigo_nome, acidente_trabalho_trajeto, arquivo_url, arquivo_nome, arquivo_mime, arquivo_tamanho")
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
      arquivo_url: data.arquivo_url ?? current.arquivo_url,
      arquivo_nome: data.arquivo_nome ?? current.arquivo_nome,
      arquivo_mime: data.arquivo_mime ?? current.arquivo_mime,
      arquivo_tamanho: data.arquivo_tamanho ?? current.arquivo_tamanho,
      ...(isAcidenteU ? {
        acidente_data: data.acidente_data,
        acidente_hora: data.acidente_hora,
        acidente_local: data.acidente_local?.trim() ?? null,
        acidente_descricao: data.acidente_descricao?.trim() ?? null,
        acidente_atendimento_medico: data.acidente_atendimento_medico ?? null,
        acidente_houve_afastamento: data.acidente_houve_afastamento ?? null,
        acidente_dias_afastamento_inicial: data.acidente_dias_afastamento_inicial ?? null,
        acidente_cat_emitida: data.acidente_cat_emitida ?? null,
        acidente_observacoes: data.acidente_observacoes?.trim() ?? null,
      } : {}),
    };


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
    );

    return { ok: true, correlation_id: gate.correlationId };
  });

// ==================== DELETE (soft) ====================
export const deleteAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return z.object({ id: uuid }).parse(data); } catch (e) { throw toInvalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("ausencias")
      .select("id, colaborador_id, empresa_id, projeto_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("RESOURCE_NOT_FOUND: ausência não encontrada");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.deleteAbsence,
      colaboradorId: (current.colaborador_id as string | null) ?? null,
      projetoId: current.colaborador_id ? null : (current.projeto_id as string),
      route: "/ausencias",
    });


    const { error } = await context.supabase.from("ausencias").delete().eq("id", data.id);
    if (error) {
      throw ausenciaDbError(error, "delete_ausencia", gate.correlationId);
    }

    await audit(context.supabase, "AUSENCIA_EXCLUIDA", data.id, gate.correlationId,
      current, null, "exclusão",
      gate.empresaId, gate.projetoId,
    );
    return { ok: true, correlation_id: gate.correlationId };
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


    const { error } = await context.supabase
      .from("ausencias")
      .update({ status: data.status } as never)
      .eq("id", data.id);
    if (error) {
      throw ausenciaDbError(error, "status_ausencia", gate.correlationId);
    }

    await audit(context.supabase, "AUSENCIA_STATUS_ALTERADO", data.id, gate.correlationId,
      { status: current.status }, { status: data.status },
      `status: ${current.status} → ${data.status}`,
      gate.empresaId, gate.projetoId,
    );
    return { ok: true, correlation_id: gate.correlationId };
  });
