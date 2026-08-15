// RBAC Fase 3 — guards para server functions.
//
// Uso:
//   const gate = await requirePermission({
//     ctx, permission: "ausencia.criar",
//     colaboradorId, route: "/nova-ausencia",
//   });
//   // gate.correlationId disponível para auditoria da operação
//
// O guard chama a RPC `public.require_permission`, que:
//   - valida auth.uid();
//   - valida has_permission(uid, code);
//   - se colaboradorId: deriva projeto/empresa e valida escopo;
//   - se projetoId/empresaId: valida escopo direto;
//   - registra tentativas negadas em audit_logs.
//
// Sempre relança erros com formato "<CODE>: <mensagem>" — parseRbacError
// no frontend converte em mensagem amigável.
function normalizeError(err) {
    const msg = err instanceof Error
        ? err.message
        : typeof err === "string"
            ? err
            : err?.message ?? "Falha desconhecida";
    const hint = err?.hint;
    const hasCode = /^[A-Z_]+:/.test(msg);
    const finalMsg = hasCode ? msg : `PERMISSION_DENIED: ${msg}`;
    const e = new Error(finalMsg);
    if (hint)
        e.hint = hint;
    throw e;
}
/**
 * Porta única de autorização para server functions.
 * Sempre relança erros codificados; consumidores devem deixar o erro subir.
 */
export async function requirePermission(params) {
    const { ctx, permission } = params;
    const correlationId = params.correlationId ?? crypto.randomUUID();
    const { data, error } = await ctx.supabase.rpc("require_permission", {
        _code: permission,
        _rota: params.route ?? null,
        _empresa_id: params.empresaId ?? null,
        _projeto_id: params.projetoId ?? null,
        _colaborador_id: params.colaboradorId ?? null,
        _correlation_id: correlationId,
        _observacoes: params.observacoes ?? null,
    });
    if (error)
        normalizeError(error);
    const payload = (data ?? {});
    return {
        ok: true,
        userId: payload.user_id ?? ctx.userId,
        correlationId: payload.correlation_id ?? correlationId,
        permission,
        empresaId: payload.empresa_id ?? null,
        projetoId: payload.projeto_id ?? null,
    };
}
/** Açúcar sintático — mesmo comportamento com escopo apenas de empresa. */
export function requireCompanyScope(ctx, permission, empresaId, opts) {
    return requirePermission({ ctx, permission, empresaId, ...opts });
}
export function requireProjectScope(ctx, permission, projetoId, opts) {
    return requirePermission({ ctx, permission, projetoId, ...opts });
}
export function requireCollaboratorScope(ctx, permission, colaboradorId, opts) {
    return requirePermission({ ctx, permission, colaboradorId, ...opts });
}
