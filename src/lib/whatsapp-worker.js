// ============================================================================
// FASE 3 · Worker WhatsApp (lógica pura, testável)
// ============================================================================
/**
 * Espelha as regras da Fase 3:
 *  - Temporário: timeout, 408, 429, 5xx, network, instância desconectada
 *  - Definitivo: 400 payload/template, 401 persistente, 404 instância inexistente,
 *    422 telefone inválido
 */
export function classifyEvolutionError(status, message) {
    const msg = (message ?? "").slice(0, 500);
    if (status === null) {
        return { kind: "TEMPORARIA", codigo: "NETWORK", mensagem: msg || "Falha de rede" };
    }
    if (status === 408)
        return { kind: "TEMPORARIA", codigo: "TIMEOUT", mensagem: msg };
    if (status === 429)
        return { kind: "TEMPORARIA", codigo: "HTTP_429", mensagem: msg };
    if (status >= 500 && status < 600) {
        return { kind: "TEMPORARIA", codigo: `HTTP_${status}`, mensagem: msg };
    }
    if (status === 401)
        return { kind: "DEFINITIVA", codigo: "HTTP_401", mensagem: msg };
    if (status === 404)
        return { kind: "DEFINITIVA", codigo: "HTTP_404_INSTANCE", mensagem: msg };
    if (status === 400)
        return { kind: "DEFINITIVA", codigo: "HTTP_400_PAYLOAD", mensagem: msg };
    if (status === 422)
        return { kind: "DEFINITIVA", codigo: "HTTP_422_TELEFONE", mensagem: msg };
    if (status >= 200 && status < 300) {
        return { kind: "TEMPORARIA", codigo: "UNEXPECTED_OK_AS_ERROR", mensagem: msg };
    }
    // 4xx desconhecido: trata como definitivo para não ficar em loop.
    return { kind: "DEFINITIVA", codigo: `HTTP_${status}`, mensagem: msg };
}
/**
 * Renderização de template com placeholders {{var}}.
 * - Ignora chaves ausentes (substitui por string vazia).
 * - Restringe as variáveis a `variaveisPermitidas` (por privacidade LGPD do
 *   payload do colaborador). Chaves fora da lista são ignoradas.
 */
export function renderTemplate(conteudo, payload, variaveisPermitidas) {
    const permitidas = new Set(variaveisPermitidas ?? []);
    return conteudo.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
        if (permitidas.size > 0 && !permitidas.has(key))
            return "";
        const val = payload[key];
        if (val === null || val === undefined)
            return "";
        return String(val);
    });
}
/**
 * Backoff exponencial com jitter (50%..150%), com teto. Mantido em sincronia
 * com public.whatsapp_calc_backoff no banco (usado apenas em testes).
 */
export function calcBackoffSeconds(tentativas, baseSeg, maxSeg, jitter = Math.random()) {
    const base = Math.max(1, baseSeg);
    const max = Math.max(base, maxSeg);
    const expo = Math.min(max, base * Math.pow(2, Math.max(0, tentativas - 1)));
    const j = 0.5 + jitter; // 0.5..1.5
    return Math.min(max, Math.max(1, Math.round(expo * j)));
}
/** Retorna true quando a mensagem deve ser tratada como aceita pelo provedor. */
export function isEvolutionAccepted(status) {
    return status >= 200 && status < 300;
}
