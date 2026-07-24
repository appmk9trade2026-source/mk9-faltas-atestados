// Colaboradores — Server Functions com hardening RBAC Fase 3 (Onda 2).
//
// Gate:
//  • create: escopo por PROJETO (require_permission valida se supervisor tem o projeto)
//  • update: escopo por COLABORADOR (deriva projeto). Transferências (empresa_id/projeto_id
//    mudam) exigem escopo em AMBOS os projetos: origem e destino.
//  • toggle: escopo por COLABORADOR.
//  • import bulk: exige colaborador.criar; a RPC underlying valida coerência empresa↔projeto.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";

const uuid = z.string().uuid();

const baseSchema = z.object({
  empresa_id: uuid,
  projeto_id: uuid,
  matricula: z.string().trim().min(1).max(50),
  nome_completo: z.string().trim().min(2).max(150),
  telefone: z.string().trim().max(20).nullable().optional(),
  whatsapp: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().max(150).nullable().optional(),
  supervisor_nome: z.string().trim().max(150).nullable().optional(),
  supervisor_telefone: z.string().trim().max(20).nullable().optional(),
  supervisor_email: z.string().trim().max(150).nullable().optional(),
  supervisor_usuario_id: uuid.nullable().optional(),
  ativo: z.boolean(),
});

function invalidPayload(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
}

function mapSupabaseError(msg: string): Error {
  if (/row-level security|permission denied|not authorized/i.test(msg)) {
    return new Error("COLLABORATOR_SCOPE_DENIED: bloqueado por política de acesso");
  }
  if (/colaboradores_empresa_matricula_uidx|duplicate|unique/i.test(msg)) {
    return new Error("CONFLICT: já existe um colaborador com esta matrícula nesta empresa");
  }
  if (/não pertence à empresa/i.test(msg)) {
    return new Error("INVALID_PAYLOAD: o projeto selecionado não pertence à empresa informada");
  }
  if (/empresa está inativa|empresa inativa/i.test(msg)) {
    return new Error("CONFLICT: a empresa está inativa");
  }
  if (/projeto está inativo|projeto inativo/i.test(msg)) {
    return new Error("CONFLICT: o projeto está inativo");
  }
  return new Error(`CONFLICT: ${msg}`);
}

async function audit(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  acao:
    | "COLABORADOR_CRIADO"
    | "COLABORADOR_EDITADO"
    | "COLABORADOR_ATIVADO"
    | "COLABORADOR_DESATIVADO"
    | "COLABORADOR_TRANSFERIDO"
    | "COLABORADORES_IMPORTADOS",
  registroId: string | null,
  correlationId: string,
  antes: unknown,
  depois: unknown,
  observacoes: string,
  empresaId: string | null,
  projetoId: string | null,
) {
  try {
    await supabase.rpc("log_audit_event", {
      _modulo: "colaboradores",
      _acao: acao as never,
      _entidade: "Colaborador",
      _registro_id: registroId,
      _empresa_id: empresaId ?? null,
      _projeto_id: projetoId ?? null,
      _antes: (antes ?? null) as never,
      _depois: (depois ?? null) as never,
      _sucesso: true,
      _observacoes: `[corr=${correlationId}] ${observacoes}`,
      _origem: "server",
    } as never);
  } catch { /* best-effort */ }
}

function normalizePayload(input: z.infer<typeof baseSchema>) {
  const digits = (v: string | null | undefined) => (v ? v.replace(/\D+/g, "") : null);
  const trim = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const lower = (v: string | null | undefined) => {
    const t = trim(v);
    return t ? t.toLowerCase() : null;
  };
  return {
    empresa_id: input.empresa_id,
    projeto_id: input.projeto_id,
    matricula: input.matricula.trim(),
    nome_completo: input.nome_completo.trim(),
    telefone: digits(input.telefone),
    whatsapp: digits(input.whatsapp),
    email: lower(input.email),
    supervisor_nome: trim(input.supervisor_nome),
    supervisor_telefone: digits(input.supervisor_telefone),
    supervisor_email: lower(input.supervisor_email),
    supervisor_usuario_id: input.supervisor_usuario_id ?? null,
    ativo: input.ativo,
  };
}

/**
 * Resolve supervisor_usuario_id via e-mail quando o UI não forneceu.
 * Chave oficial: supervisor_email → profiles.email (papel supervisor) → profiles.id.
 * Nunca cria usuários. Nunca sobrescreve um ID explicitamente informado.
 */
async function resolveSupervisorFromEmail(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  payload: ReturnType<typeof normalizePayload>,
): Promise<ReturnType<typeof normalizePayload>> {
  if (payload.supervisor_usuario_id || !payload.supervisor_email) return payload;
  try {
    const { data } = await supabase.rpc("resolve_supervisor_usuario_id", {
      _email: payload.supervisor_email,
    } as never);
    if (data) return { ...payload, supervisor_usuario_id: data as string };
  } catch { /* best-effort — não bloqueia o salvamento */ }
  return payload;
}


// ==================== CREATE ====================
export const createColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return baseSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    // Escopo pelo PROJETO — cobre supervisor (tem o projeto) e admin.
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createEmployee,
      projetoId: data.projeto_id,
      route: "/colaboradores",
    });

    const payload = await resolveSupervisorFromEmail(context.supabase, normalizePayload(data));
    const { data: row, error } = await context.supabase
      .from("colaboradores")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase, "COLABORADOR_CRIADO", row.id as string, gate.correlationId,
      null, payload, "criação", data.empresa_id, data.projeto_id);
    return { id: row.id as string, correlation_id: gate.correlationId };
  });

// ==================== UPDATE ====================
const updateSchema = baseSchema.extend({ id: uuid });

export const updateColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return updateSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current, error: loadErr } = await context.supabase
      .from("colaboradores")
      .select("id, empresa_id, projeto_id, matricula, nome_completo, telefone, whatsapp, email, supervisor_nome, supervisor_telefone, supervisor_email, supervisor_usuario_id, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (loadErr) throw new Error(`RESOURCE_NOT_FOUND: ${loadErr.message}`);
    if (!current) throw new Error("RESOURCE_NOT_FOUND: colaborador não encontrado");

    // Escopo original — o supervisor precisa ter acesso ao registro atual.
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateEmployee,
      colaboradorId: data.id,
      route: "/colaboradores",
    });

    // Transferência: precisa também de escopo no PROJETO destino.
    const transferiuProjeto = data.projeto_id !== current.projeto_id;
    const transferiuEmpresa = data.empresa_id !== current.empresa_id;
    if (transferiuProjeto || transferiuEmpresa) {
      await requirePermission({
        ctx: context,
        permission: PERMISSION_MAP.updateEmployee,
        projetoId: data.projeto_id,
        route: "/colaboradores",
        correlationId: gate.correlationId,
      });
    }

    const payload = await resolveSupervisorFromEmail(context.supabase, normalizePayload(data));
    const { error } = await context.supabase
      .from("colaboradores")
      .update(payload as never)
      .eq("id", data.id);
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase, "COLABORADOR_EDITADO", data.id, gate.correlationId,
      current, payload, "edição", data.empresa_id, data.projeto_id);
    if (transferiuProjeto || transferiuEmpresa) {
      await audit(context.supabase, "COLABORADOR_TRANSFERIDO", data.id, gate.correlationId,
        { empresa_id: current.empresa_id, projeto_id: current.projeto_id },
        { empresa_id: data.empresa_id, projeto_id: data.projeto_id },
        `transferência de projeto/empresa`,
        data.empresa_id, data.projeto_id);
    }
    return { ok: true, correlation_id: gate.correlationId };
  });

// ==================== TOGGLE ATIVO ====================
export const setColaboradorAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return z.object({ id: uuid, ativo: z.boolean() }).parse(data);
    } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("colaboradores")
      .select("id, empresa_id, projeto_id, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("RESOURCE_NOT_FOUND: colaborador não encontrado");
    if (current.ativo === data.ativo) throw new Error("CONFLICT: status já é o solicitado");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateEmployee,
      colaboradorId: data.id,
      route: "/colaboradores",
    });

    const { error } = await context.supabase
      .from("colaboradores")
      .update({ ativo: data.ativo } as never)
      .eq("id", data.id);
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase,
      data.ativo ? "COLABORADOR_ATIVADO" : "COLABORADOR_DESATIVADO",
      data.id, gate.correlationId,
      { ativo: current.ativo }, { ativo: data.ativo },
      `status alterado`,
      current.empresa_id as string, current.projeto_id as string);
    return { ok: true, correlation_id: gate.correlationId };
  });

// ==================== IMPORT BULK ====================
const importRowSchema = z.object({
  linha: z.number().int().nullable().optional(),
  matricula: z.string().trim().min(1),
  nome_completo: z.string().trim().min(1),
  empresa: z.string().trim().min(1),
  projeto: z.string().trim().min(1),
  empresa_id: z.string().uuid().nullable().optional(),
  projeto_id: z.string().uuid().nullable().optional(),
  telefone: z.string().trim().nullable().optional(),
  whatsapp: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  supervisor_nome: z.string().trim().nullable().optional(),
  supervisor_telefone: z.string().trim().nullable().optional(),
  supervisor_email: z.string().trim().nullable().optional(),
  supervisor_usuario_id: z.string().uuid().nullable().optional(),
});

export const importColaboradoresBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return z.object({
        rows: z.array(importRowSchema).min(1).max(500),
        atualizar: z.boolean(),
      }).parse(data);
    } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createEmployee,
      route: "/colaboradores/importar",
    });

    const { data: result, error } = await context.supabase.rpc(
      "import_colaboradores_bulk",
      { _rows: data.rows as never, _atualizar: data.atualizar } as never,
    );
    if (error) throw mapSupabaseError(error.message);

    const r = (result ?? {}) as {
      inseridas?: number;
      atualizadas?: number;
      ignoradas?: number;
      erros?: number;
      supervisores_vinculados?: number;
      supervisores_pendentes?: number;
      pendencias_por_motivo?: Record<string, number>;
      detalhes?: Array<Record<string, string | number | null>>;
    };

    await audit(context.supabase, "COLABORADORES_IMPORTADOS", null, gate.correlationId,
      null,
      {
        inseridas: r.inseridas ?? 0,
        atualizadas: r.atualizadas ?? 0,
        ignoradas: r.ignoradas ?? 0,
        erros: r.erros ?? 0,
        total: data.rows.length,
        supervisores_vinculados: r.supervisores_vinculados ?? 0,
        supervisores_pendentes: r.supervisores_pendentes ?? 0,
        pendencias_por_motivo: r.pendencias_por_motivo ?? {},
      },
      `importação em lote (${data.atualizar ? "com" : "sem"} atualização)`,
      null, null);

    return { ...r, correlation_id: gate.correlationId };
  });

