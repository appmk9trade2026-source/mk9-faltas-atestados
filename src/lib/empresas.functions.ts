// Empresas — Server Functions com hardening RBAC Fase 3 (Onda 2).
//
// TODAS as mutações de empresa passam por aqui. Nunca chame
// supabase.from("empresas").insert/update direto do client.
//
// Ordem por Server Function:
//   1. auth (via requireSupabaseAuth)
//   2. PermissionCode (PERMISSION_MAP)
//   3. public.require_permission (has_permission + audit + correlation_id)
//   4. Regra de negócio
//   5. Mutação (RLS como 2ª camada)
//   6. Auditoria dedicada com correlation_id

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";

const uuid = z.string().uuid();

const empresaBaseSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  cnpj: z.string().trim().max(20).nullable().optional(),
  descricao: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean(),
});

function invalidPayload(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
}

function mapSupabaseError(msg: string): Error {
  if (/row-level security|permission denied|not authorized/i.test(msg)) {
    return new Error("PERMISSION_DENIED: bloqueado por política de acesso");
  }
  if (/duplicate|unique/i.test(msg)) {
    return new Error("CONFLICT: já existe uma empresa com este nome");
  }
  return new Error(`CONFLICT: ${msg}`);
}

async function audit(
  supabase: import("@/lib/rbac/guards.server").MiddlewareContext["supabase"],
  acao: "EMPRESA_CRIADA" | "EMPRESA_EDITADA" | "EMPRESA_ATIVADA" | "EMPRESA_DESATIVADA",
  registroId: string | null,
  correlationId: string,
  antes: unknown,
  depois: unknown,
  observacoes: string,
  empresaId: string | null,
) {
  try {
    await supabase.rpc("log_audit_event", {
      _modulo: "empresas",
      _acao: acao as never,
      _entidade: "Empresa",
      _registro_id: registroId,
      _empresa_id: empresaId ?? null,
      _antes: (antes ?? null) as never,
      _depois: (depois ?? null) as never,
      _sucesso: true,
      _observacoes: `[corr=${correlationId}] ${observacoes}`,
      _origem: "server",
    } as never);
  } catch { /* auditoria best-effort */ }
}

// ==================== CREATE ====================
export const createEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return empresaBaseSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createCompany,
      route: "/configuracoes/empresas",
    });
    const payload = {
      nome: data.nome.trim(),
      cnpj: data.cnpj?.trim() ? data.cnpj.trim() : null,
      descricao: data.descricao?.trim() ? data.descricao.trim() : null,
      ativo: data.ativo,
    };
    const { data: row, error } = await context.supabase
      .from("empresas")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw mapSupabaseError(error.message);
    await audit(context.supabase, "EMPRESA_CRIADA", row.id as string, gate.correlationId,
      null, payload, "criação", row.id as string);
    return { id: row.id as string, correlation_id: gate.correlationId };
  });

// ==================== UPDATE ====================
const updateSchema = empresaBaseSchema.extend({ id: uuid });

export const updateEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try { return updateSchema.parse(data); } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current, error: loadErr } = await context.supabase
      .from("empresas")
      .select("id, nome, cnpj, descricao, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (loadErr) throw new Error(`RESOURCE_NOT_FOUND: ${loadErr.message}`);
    if (!current) throw new Error("RESOURCE_NOT_FOUND: empresa não encontrada");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateCompany,
      empresaId: data.id,
      route: "/configuracoes/empresas",
    });

    const payload = {
      nome: data.nome.trim(),
      cnpj: data.cnpj?.trim() ? data.cnpj.trim() : null,
      descricao: data.descricao?.trim() ? data.descricao.trim() : null,
      ativo: data.ativo,
    };
    const { error } = await context.supabase
      .from("empresas")
      .update(payload as never)
      .eq("id", data.id);
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase, "EMPRESA_EDITADA", data.id, gate.correlationId,
      current, payload, "edição", data.id);
    return { ok: true, correlation_id: gate.correlationId };
  });

// ==================== TOGGLE ATIVO ====================
export const setEmpresaAtiva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return z.object({ id: uuid, ativo: z.boolean() }).parse(data);
    } catch (e) { throw invalidPayload(e); }
  })
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("empresas")
      .select("id, ativo, nome")
      .eq("id", data.id)
      .maybeSingle();
    if (!current) throw new Error("RESOURCE_NOT_FOUND: empresa não encontrada");
    if (current.ativo === data.ativo) throw new Error("CONFLICT: status já é o solicitado");

    const gate = await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.updateCompany,
      empresaId: data.id,
      route: "/configuracoes/empresas",
    });

    const { error } = await context.supabase
      .from("empresas")
      .update({ ativo: data.ativo } as never)
      .eq("id", data.id);
    if (error) throw mapSupabaseError(error.message);

    await audit(context.supabase,
      data.ativo ? "EMPRESA_ATIVADA" : "EMPRESA_DESATIVADA",
      data.id, gate.correlationId,
      { ativo: current.ativo }, { ativo: data.ativo },
      `status: ${current.ativo ? "ativa" : "inativa"} → ${data.ativo ? "ativa" : "inativa"}`,
      data.id);

    return { ok: true, correlation_id: gate.correlationId };
  });
