import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
async function assertRole(ctx, role) {
    const { data } = await ctx.supabase.rpc("has_role", {
        _user_id: ctx.userId,
        _role: role,
    });
    return data === true;
}
async function assertAdminAccess(ctx) {
    if (await assertRole(ctx, "super_admin"))
        return { role: "super_admin" };
    if (await assertRole(ctx, "compliance"))
        return { role: "compliance" };
    if (await assertRole(ctx, "rh"))
        return { role: "rh" };
    throw new Error("Sem permissão para acessar o módulo WhatsApp Admin.");
}
// -------------------------------------------------------------------------
// Health check — pure DB reads, no external calls.
// -------------------------------------------------------------------------
export const getWhatsappHealth = createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
    await assertAdminAccess(context);
    const supabase = context.supabase;
    const [providerRes, lastExecRes, stuckRes, dlqRes, execAggRes] = await Promise.all([
        supabase
            .from("whatsapp_provider_config")
            .select("enabled, modo, provider, webhook_enabled, timeout_ms, max_tentativas, retry_base_segundos, retry_max_segundos, batch_size")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase
            .from("whatsapp_worker_execucoes")
            .select("execution_id, status, inicio, fim, duracao_ms, worker")
            .order("inicio", { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase
            .from("whatsapp_outbox")
            .select("id", { count: "exact", head: true })
            .eq("status", "PROCESSANDO")
            .lt("locked_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
        supabase
            .from("whatsapp_outbox")
            .select("id", { count: "exact", head: true })
            .eq("status", "FALHOU_DEFINITIVO")
            .gte("falhou_em", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase
            .from("whatsapp_worker_execucoes")
            .select("duracao_ms")
            .not("duracao_ms", "is", null)
            .order("inicio", { ascending: false })
            .limit(20),
    ]);
    const provider = providerRes.data;
    const lastExec = lastExecRes.data;
    const stuckCount = stuckRes.count ?? 0;
    const dlqCount = dlqRes.count ?? 0;
    const durations = (execAggRes.data ?? [])
        .map((r) => r.duracao_ms)
        .filter((n) => typeof n === "number");
    const avgMs = durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;
    const now = Date.now();
    const lastExecAgeMin = lastExec?.inicio
        ? Math.round((now - new Date(lastExec.inicio).getTime()) / 60000)
        : null;
    const workerOk = lastExecAgeMin != null && lastExecAgeMin < 5;
    return {
        provider: {
            enabled: !!provider?.enabled,
            modo: provider?.modo ?? "DESATIVADO",
            provider: provider?.provider ?? "EVOLUTION_API",
            webhook_enabled: !!provider?.webhook_enabled,
        },
        worker: {
            ok: workerOk,
            last_execution_id: lastExec?.execution_id ?? null,
            last_status: lastExec?.status ?? null,
            last_worker: lastExec?.worker ?? null,
            last_started_at: lastExec?.inicio ?? null,
            last_finished_at: lastExec?.fim ?? null,
            age_minutes: lastExecAgeMin,
            avg_duration_ms: avgMs,
        },
        queue: {
            stuck_over_10min: stuckCount,
            dead_letter_last_24h: dlqCount,
        },
    };
});
// -------------------------------------------------------------------------
// Provider configuration — read only, sensitive fields are already absent
// from the columns exposed here.
// -------------------------------------------------------------------------
export const getWhatsappProviderConfig = createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
    await assertAdminAccess(context);
    const { data } = await context.supabase
        .from("whatsapp_provider_config")
        .select("provider, enabled, modo, instance_name, base_url_public_label, timeout_ms, max_tentativas, retry_base_segundos, retry_max_segundos, batch_size, webhook_enabled, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    return data;
});
// -------------------------------------------------------------------------
// Dead-letter requeue — super_admin only.
// -------------------------------------------------------------------------
export const requeueDeadLetter = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((input) => {
    if (!input?.outboxId || typeof input.outboxId !== "string") {
        throw new Error("outboxId inválido.");
    }
    return input;
})
    .handler(async ({ data, context }) => {
    const isSuper = await assertRole(context, "super_admin");
    if (!isSuper)
        throw new Error("Apenas Super Admin pode reenfileirar mensagens.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readErr } = await supabaseAdmin
        .from("whatsapp_outbox")
        .select("id, status, tentativas, max_tentativas")
        .eq("id", data.outboxId)
        .maybeSingle();
    if (readErr)
        throw readErr;
    if (!existing)
        throw new Error("Mensagem não encontrada.");
    if (existing.status !== "FALHOU_DEFINITIVO") {
        throw new Error("Somente mensagens em Falha Definitiva podem ser reenfileiradas.");
    }
    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
        .from("whatsapp_outbox")
        .update({
        status: "PENDENTE",
        tentativas: 0,
        proxima_tentativa_em: now,
        locked_at: null,
        locked_by: null,
        ultimo_erro_codigo: null,
        ultimo_erro_resumido: null,
        falhou_em: null,
    })
        .eq("id", data.outboxId);
    if (updErr)
        throw updErr;
    // Append-only evento operacional (não altera worker/webhook).
    await supabaseAdmin.from("whatsapp_outbox_eventos").insert({
        outbox_id: data.outboxId,
        evento: "REENFILEIRADO_ADMIN",
        status_anterior: "FALHOU_DEFINITIVO",
        status_novo: "PENDENTE",
        metadata_segura: { origem: "admin_panel", usuario_id: context.userId },
    });
    // Auditoria (best effort).
    await supabaseAdmin.from("audit_logs").insert({
        modulo: "whatsapp_admin",
        acao: "WHATSAPP_REENFILEIRADO",
        entidade: "whatsapp_outbox",
        registro_id: data.outboxId,
        sucesso: true,
        origem: "admin_panel",
        usuario_id: context.userId,
        observacoes: "Reenfileiramento manual via painel administrativo.",
    });
    return { ok: true };
});
// -------------------------------------------------------------------------
// Admin-action audit logger (view Dead Letter, exports).
// -------------------------------------------------------------------------
export const logWhatsappAdminEvent = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((input) => {
    if (!["WHATSAPP_DEAD_LETTER_VISUALIZADA", "WHATSAPP_EXPORT_OUTBOX", "WHATSAPP_EXPORT_EXECUCOES"].includes(input?.acao)) {
        throw new Error("Ação inválida.");
    }
    return input;
})
    .handler(async ({ data, context }) => {
    await assertAdminAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
        modulo: "whatsapp_admin",
        acao: data.acao,
        entidade: "whatsapp_admin",
        registro_id: data.registro_id ?? null,
        sucesso: true,
        origem: "admin_panel",
        usuario_id: context.userId,
        observacoes: data.observacoes ?? null,
    });
    return { ok: true };
});
