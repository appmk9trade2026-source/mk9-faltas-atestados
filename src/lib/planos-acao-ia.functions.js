import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrubString } from "./assistente/sanitize.server";
const API_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODEL = "google/gemini-2.0-flash-001";
async function callAiWithFallback(params) {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!lovableKey) {
        throw new Error("LOVABLE_API_KEY não configurada.");
    }
    const started = Date.now();
    let usedFallback = false;
    let lastError = null;
    // 1. Tentativa com Lovable AI Gateway
    try {
        console.log(`[AI] Calling Lovable Gateway (${params.traceName})...`);
        const response = await fetch(API_GATEWAY_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${lovableKey}`,
                "Content-Type": "application/json",
                ...(params.traceName ? { "x-lovable-trace": params.traceName } : {})
            },
            body: JSON.stringify({
                model: PRIMARY_MODEL,
                messages: params.messages,
                temperature: params.temperature,
                ...(params.jsonMode ? { response_format: { type: "json_object" } } : {})
            }),
        });
        if (response.ok) {
            const result = await response.json();
            return {
                content: result.choices?.[0]?.message?.content,
                provider: "lovable",
                model: PRIMARY_MODEL,
                latencyMs: Date.now() - started,
                fallback_used: false
            };
        }
        lastError = { status: response.status, text: await response.text() };
        console.warn(`[AI] Lovable Gateway error: ${lastError.status}`, lastError.text);
    }
    catch (err) {
        lastError = err;
        console.warn("[AI] Lovable Gateway fetch failure:", err.message);
    }
    // 2. Fallback elegível para OpenRouter
    const isEligibleForFallback = !lastError ||
        lastError.status === 429 ||
        (lastError.status >= 500 && lastError.status <= 599) ||
        lastError.name === "AbortError" ||
        lastError.message?.includes("fetch");
    if (isEligibleForFallback && openRouterKey) {
        console.log("[AI] Starting OpenRouter Fallback...");
        usedFallback = true;
        try {
            const response = await fetch(OPENROUTER_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${openRouterKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://mk9-faltas-atestados.lovable.app",
                    "X-Title": "CRM MK9"
                },
                body: JSON.stringify({
                    model: FALLBACK_MODEL,
                    messages: params.messages,
                    temperature: params.temperature,
                    ...(params.jsonMode ? { response_format: { type: "json_object" } } : {})
                }),
            });
            if (response.ok) {
                const result = await response.json();
                return {
                    content: result.choices?.[0]?.message?.content,
                    provider: "openrouter",
                    model: FALLBACK_MODEL,
                    latencyMs: Date.now() - started,
                    fallback_used: true
                };
            }
            const frText = await response.text();
            console.error("[AI] OpenRouter Fallback failed:", response.status, frText);
        }
        catch (err) {
            console.error("[AI] OpenRouter Fallback fetch failure:", err.message);
        }
    }
    // Se chegou aqui, ambos falharam ou não era elegível
    if (lastError?.status === 401)
        throw new Error("Erro de autenticação no provedor de IA.");
    if (lastError?.status === 429)
        throw new Error("Limite de requisições da IA atingido. Tente em breve.");
    throw new Error("Não foi possível gerar a sugestão com IA agora. Você pode continuar preenchendo o plano manualmente.");
}
const suggestionInputSchema = z.object({
    tipo_alvo: z.enum(["PROJETO", "SUPERVISOR", "COLABORADOR"]),
    projeto_id: z.string().uuid(),
    supervisor_usuario_id: z.string().uuid().nullable().optional(),
    colaborador_id: z.string().uuid().nullable().optional(),
    problema_identificado: z.string().min(5),
});
export const gerarSugestaoPlanoAcao = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .validator((data) => suggestionInputSchema.parse(data))
    .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
        throw new Error("LOVABLE_API_KEY não configurada.");
    }
    const { tipo_alvo, projeto_id, supervisor_usuario_id, colaborador_id, problema_identificado } = data;
    // 1. Coletar contexto operacional real (minimizado/agregado)
    // Janela de 30 dias
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const trintaDiasAtrasIso = trintaDiasAtras.toISOString().split('T')[0];
    // Janela anterior para comparação (60 a 30 dias atrás)
    const sessentaDiasAtras = new Date();
    sessentaDiasAtras.setDate(sessentaDiasAtras.getDate() - 60);
    const sessentaDiasAtrasIso = sessentaDiasAtras.toISOString().split('T')[0];
    let query = supabase
        .from("ausencias")
        .select("id, data_inicio, tipo_ausencia_nome, colaborador_id, projeto_id")
        .gte("data_inicio", sessentaDiasAtrasIso);
    if (tipo_alvo === "PROJETO") {
        query = query.eq("projeto_id", projeto_id);
    }
    else if (tipo_alvo === "SUPERVISOR" && supervisor_usuario_id) {
        const { data: colabs } = await supabase
            .from("colaboradores")
            .select("id")
            .eq("supervisor_usuario_id", supervisor_usuario_id);
        const colabIds = colabs?.map(c => c.id) || [];
        if (colabIds.length > 0) {
            query = query.in("colaborador_id", colabIds);
        }
        else {
            query = query.eq("colaborador_id", "00000000-0000-0000-0000-000000000000");
        }
    }
    else if (tipo_alvo === "COLABORADOR" && colaborador_id) {
        query = query.eq("colaborador_id", colaborador_id);
    }
    const { data: ausencias, error: ausenciasErr } = await query;
    if (ausenciasErr) {
        console.error("[gerarSugestaoPlanoAcao] Erro ao buscar ausências:", ausenciasErr);
    }
    // Processar métricas (sem dados médicos)
    const atuais = ausencias?.filter(a => a.data_inicio >= trintaDiasAtrasIso) || [];
    const anteriores = ausencias?.filter(a => a.data_inicio < trintaDiasAtrasIso) || [];
    const totalAtuais = atuais.length;
    const totalAnteriores = anteriores.length;
    const variacao = totalAnteriores > 0 ? ((totalAtuais - totalAnteriores) / totalAnteriores) * 100 : 0;
    // Tipos recorrentes (agregado)
    const tiposContagem = {};
    atuais.forEach(a => {
        const nome = a.tipo_ausencia_nome || "Outros";
        tiposContagem[nome] = (tiposContagem[nome] || 0) + 1;
    });
    // Planos anteriores (contexto de efetividade)
    const { data: planosAnteriores } = await supabase
        .from("planos_acao")
        .select("titulo, status, resultado_alcancado, progresso")
        .eq("projeto_id", projeto_id)
        .eq("tipo_alvo", tipo_alvo)
        .order('created_at', { ascending: false })
        .limit(3);
    // 2. Sanitização do input do usuário
    const problemaLimpo = scrubString(problema_identificado);
    // 3. Montar Prompt Estruturado
    const prompt = `Você é um gestor de RH especialista em análise operacional e planos de ação.
Sua tarefa é sugerir uma Meta (SMART), Indicador de Sucesso e Ações Propostas com base no histórico operacional REAL fornecido.

CONTEXTO OPERACIONAL (Últimos 30 dias):
- Alvo: ${tipo_alvo}
- Total de Ausências: ${totalAtuais}
- Período anterior (30-60 dias): ${totalAnteriores}
- Variação: ${variacao.toFixed(1)}%
- Tipos recorrentes: ${Object.entries(tiposContagem).map(([n, c]) => `${n} (${c})`).join(", ")}
${planosAnteriores && planosAnteriores.length > 0 ? `- Planos Anteriores: ${planosAnteriores.map(p => `${p.titulo} (${p.status})`).join("; ")}` : ""}

PROBLEMA IDENTIFICADO PELO USUÁRIO:
"${problemaLimpo}"

REGRAS ESTRITAS:
1. Retorne EXCLUSIVAMENTE um JSON com: "titulo", "meta", "indicador_sucesso", "acao_proposta", "prazo_sugerido_dias", "justificativa".
2. "meta": Deve ser SMART (Específica, Mensurável, Atingível, Relevante e Temporal). Ex: "Reduzir ausências de ${totalAtuais} para no máximo ${Math.max(1, Math.round(totalAtuais * 0.7))} nos próximos 30 dias".
3. "indicador_sucesso": Como medir? Ex: "Taxa semanal de ausências do projeto".
4. "acao_proposta": Liste 3 a 4 ações práticas e proporcionais ao problema.
5. "prazo_sugerido_dias": Número (ex: 30, 45, 60).
6. NÃO invente números que não existam no contexto operacional fornecido.
7. Se não houver histórico suficiente para uma meta quantitativa, indique na justificativa e sugira uma meta qualitativa de acompanhamento.
8. NUNCA mencione dados médicos ou CIDs.

JSON:`;
    const aiResult = await callAiWithFallback({
        messages: [
            { role: "system", content: "Você é um assistente que responde exclusivamente em JSON." },
            { role: "user", content: prompt }
        ],
        temperature: 0.2,
        jsonMode: true,
        traceName: "gerarSugestaoPlanoAcao"
    });
    const content = aiResult.content;
    if (!content) {
        console.error("[gerarSugestaoPlanoAcao] Empty AI response content");
        throw new Error("A IA retornou uma resposta vazia.");
    }
    try {
        return JSON.parse(content);
    }
    catch (e) {
        console.error("[gerarSugestaoPlanoAcao] Failed to parse AI response content:", content);
        throw new Error("Resposta da IA em formato inválido.");
    }
});
export const gerarResumoGerencialIA = createServerFn({ method: "POST" })
    .validator((data) => z.object({
    planos: z.array(z.any())
}).parse(data))
    .middleware([requireSupabaseAuth])
    .handler(async ({ data: input }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey)
        throw new Error("LOVABLE_API_KEY não configurada.");
    const resumoDados = input.planos.map((p) => ({
        titulo: p.titulo,
        projeto: p.projeto?.nome,
        status: p.status,
        situacao: p.situacao,
        progresso: p.progresso,
        prazo: p.prazo
    }));
    const prompt = `Você é um analista gerencial especialista em RH e indicadores operacionais. 
Sua tarefa é fornecer um resumo executivo CURTO (máximo 4 frases) sobre o status dos planos de ação da equipe.

Foque em:
1. Quantos planos precisam de atenção imediata (atrasados ou em situação crítica).
2. Tendências gerais de progresso (estão avançando ou estagnados?).
3. Recomendações diretas de prioridade para o gestor.

Dados dos Planos: ${JSON.stringify(resumoDados)}

Regras de Tom:
- Profissional, direto e acionável.
- Não use saudações.
- Se houver muitos atrasados, use um tom de alerta.

Retorne apenas o texto do resumo.`;
    const aiResult = await callAiWithFallback({
        messages: [
            { role: "user", content: prompt }
        ],
        temperature: 0.3,
        traceName: "gerarResumoGerencialIA"
    });
    return aiResult.content || "Sem resumo disponível no momento.";
});
