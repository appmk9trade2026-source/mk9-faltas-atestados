// Server functions públicas do Assistente Inteligente do CRM MK9.
// Todas requerem usuário autenticado; o RLS aplica-se ao Supabase de contexto.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
async function carregarRoles(supabase, userId) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return (data ?? []).map((r) => r.role);
}
// ---------- Listar conversas ----------
export const listarConversasAssistente = createServerFn({ method: "GET" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
    const { data, error } = await context.supabase
        .from("ai_conversations")
        .select("id, titulo, empresa_id, projeto_id, created_at, updated_at, archived_at")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(50);
    if (error)
        throw new Error(error.message);
    return { conversas: data ?? [] };
});
// ---------- Criar conversa ----------
export const criarConversaAssistente = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({
    titulo: z.string().trim().min(1).max(120).optional(),
    empresa_id: z.string().uuid().optional(),
    projeto_id: z.string().uuid().optional(),
}).parse(d))
    .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
        .from("ai_conversations")
        .insert({
        user_id: context.userId,
        titulo: data.titulo ?? "Nova conversa",
        empresa_id: data.empresa_id ?? null,
        projeto_id: data.projeto_id ?? null,
    })
        .select("id, titulo, created_at, updated_at")
        .single();
    if (error)
        throw new Error(error.message);
    return row;
});
// ---------- Arquivar conversa ----------
export const arquivarConversaAssistente = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
    .handler(async ({ context, data }) => {
    const { error } = await context.supabase
        .from("ai_conversations")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", data.id);
    if (error)
        throw new Error(error.message);
    return { ok: true };
});
// ---------- Renomear ----------
export const renomearConversaAssistente = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({ id: z.string().uuid(), titulo: z.string().trim().min(1).max(120) }).parse(d))
    .handler(async ({ context, data }) => {
    const { error } = await context.supabase
        .from("ai_conversations")
        .update({ titulo: data.titulo })
        .eq("id", data.id);
    if (error)
        throw new Error(error.message);
    return { ok: true };
});
// ---------- Listar mensagens ----------
export const listarMensagensAssistente = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
    .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
        .from("ai_messages")
        .select("id, role, content, structured_content, status, latency_ms, created_at")
        .eq("conversation_id", data.conversation_id)
        .order("created_at", { ascending: true })
        .limit(200);
    if (error)
        throw new Error(error.message);
    return { mensagens: rows ?? [] };
});
// ---------- Enviar pergunta (executa modelo + ferramentas) ----------
export const perguntarAoAssistente = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({
    conversation_id: z.string().uuid(),
    pergunta: z.string().trim().min(1).max(2000),
}).parse(d))
    .handler(async ({ context, data }) => {
    // Rate limit
    const rlRes = await context.supabase.rpc("ai_assistente_consumir_rate_limit", {
        _user_id: context.userId,
    });
    const rl = (rlRes.data ?? {});
    if (!rl.permitido) {
        throw new Error(rl.motivo === "rate_limit"
            ? `Limite de perguntas por hora atingido (${rl.limite ?? 0}). Tente novamente após ${rl.janela_reset ?? "próxima janela"}.`
            : "Sem permissão para usar o Assistente.");
    }
    // Verifica ownership da conversa
    const conv = await context.supabase
        .from("ai_conversations")
        .select("id, titulo")
        .eq("id", data.conversation_id)
        .maybeSingle();
    if (conv.error || !conv.data)
        throw new Error("Conversa não encontrada.");
    const roles = await carregarRoles(context.supabase, context.userId);
    // Persiste a mensagem do usuário
    const { data: userMsg, error: uErr } = await context.supabase
        .from("ai_messages")
        .insert({
        conversation_id: data.conversation_id,
        role: "USER",
        content: data.pergunta,
        status: "COMPLETED",
    })
        .select("id, created_at")
        .single();
    if (uErr)
        throw new Error(uErr.message);
    // Cria placeholder do assistant
    const { data: aRow, error: aErr } = await context.supabase
        .from("ai_messages")
        .insert({
        conversation_id: data.conversation_id,
        role: "ASSISTANT",
        content: "",
        status: "PROCESSING",
    })
        .select("id")
        .single();
    if (aErr)
        throw new Error(aErr.message);
    // Busca histórico recente para contexto
    const histRes = await context.supabase
        .from("ai_messages")
        .select("role, content, created_at")
        .eq("conversation_id", data.conversation_id)
        .in("role", ["USER", "ASSISTANT"])
        .neq("id", aRow.id)
        .order("created_at", { ascending: true })
        .limit(20);
    const historico = (histRes.data ?? []).map((m) => ({
        role: (m.role === "USER" ? "user" : "assistant"),
        content: String(m.content ?? ""),
    }));
    try {
        const { orquestrar } = await import("@/lib/assistente/orchestrator.server");
        const out = await orquestrar(context.supabase, context.userId, roles, data.pergunta, historico);
        await context.supabase
            .from("ai_messages")
            .update({
            content: out.content,
            structured_content: out.structured,
            status: "COMPLETED",
            model_identifier: out.model,
            provider_identifier: "lovable-ai-gateway",
            input_tokens: out.inputTokens,
            output_tokens: out.outputTokens,
            latency_ms: out.latencyMs,
        })
            .eq("id", aRow.id);
        // Atualiza título se ainda for genérico
        if (!conv.data.titulo || /nova conversa/i.test(conv.data.titulo)) {
            const titulo = data.pergunta.slice(0, 80);
            await context.supabase.from("ai_conversations").update({ titulo }).eq("id", data.conversation_id);
        }
        // Auditoria (best-effort)
        await context.supabase.rpc("log_audit_event", {
            _modulo: "assistente",
            _acao: "PERGUNTAR",
            _entidade: "AiMessage",
            _entidade_id: aRow.id,
            _observacoes: `tools=${out.toolCalls.map((t) => t.name).join(",")}; tokens=${out.inputTokens}/${out.outputTokens}`,
        }).then(() => { }, () => { });
        return {
            user_message_id: userMsg.id,
            assistant_message_id: aRow.id,
            content: out.content,
            structured_json: JSON.stringify(out.structured),
            rate_limit: { limite: rl.limite ?? null, restantes: rl.restantes ?? null, janela_reset: rl.janela_reset ?? null },
            model: out.model,
            latency_ms: out.latencyMs,
        };
    }
    catch (e) {
        const msg = e.message;
        await context.supabase
            .from("ai_messages")
            .update({
            content: `Erro: ${msg}`,
            status: "FAILED",
            error_code: /rate_limit/i.test(msg) ? "rate_limit" : "orchestrator_error",
        })
            .eq("id", aRow.id);
        throw new Error(msg);
    }
});
// ---------- Feedback ----------
export const registrarFeedbackAssistente = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({
    message_id: z.string().uuid(),
    rating: z.enum(["UP", "DOWN"]),
    motivo: z.string().max(120).optional(),
    comentario: z.string().max(1000).optional(),
}).parse(d))
    .handler(async ({ context, data }) => {
    const { error } = await context.supabase
        .from("ai_feedback")
        .upsert({
        message_id: data.message_id,
        user_id: context.userId,
        rating: data.rating,
        motivo: data.motivo ?? null,
        comentario: data.comentario ?? null,
    }, { onConflict: "message_id,user_id" });
    if (error)
        throw new Error(error.message);
    return { ok: true };
});
