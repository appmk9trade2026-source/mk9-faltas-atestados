// Camada de abstração do provedor de IA. Padrão: Lovable AI Gateway.
// Não acoplar o Assistente a um único fornecedor — todas as chamadas passam
// por este helper e podem ser roteadas para outro backend sem tocar no
// orquestrador.
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const DEFAULT_MODEL = "google/gemini-2.5-flash";
export class AiProviderError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "AiProviderError";
    }
}
export async function callChat(messages, opts = {}) {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey)
        throw new AiProviderError("unavailable", "LOVABLE_API_KEY ausente");
    const model = opts.model ?? DEFAULT_MODEL;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25000);
    try {
        const res = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
                model,
                messages,
                temperature: opts.temperature ?? 0.2,
                ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
                ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
            }),
        });
        if (res.status === 429)
            throw new AiProviderError("rate_limit", "Provedor com rate limit");
        if (res.status === 402)
            throw new AiProviderError("credits_exhausted", "Créditos esgotados");
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new AiProviderError("unavailable", `Gateway ${res.status}: ${body.slice(0, 200)}`);
        }
        const data = (await res.json());
        return { raw: data, latencyMs: Date.now() - started, model };
    }
    catch (err) {
        if (err instanceof AiProviderError)
            throw err;
        if (err?.name === "AbortError") {
            throw new AiProviderError("timeout", "Provedor demorou demais");
        }
        throw new AiProviderError("unavailable", err.message);
    }
    finally {
        clearTimeout(timer);
    }
}
