// ============================================================================
// FASE 4 · Helpers puros do Webhook Evolution API (parsing/mapping/idempotência).
// Sem side effects. Testado por tests/unit/whatsapp-webhook.test.ts.
// ============================================================================
export const STATUS_PRECEDENCIA = {
    PENDENTE: 0,
    PROCESSANDO: 1,
    FALHOU_TEMPORARIO: 2,
    ENVIADO: 3,
    ENTREGUE: 4,
    LIDO: 5,
    FALHOU_DEFINITIVO: 6,
    CANCELADO: 7,
};
export function podeEvoluir(atual, novo) {
    const a = STATUS_PRECEDENCIA[atual];
    const n = STATUS_PRECEDENCIA[novo];
    if (a === undefined || n === undefined)
        return false;
    return n > a;
}
/**
 * Mapeia códigos da Evolution API para os status internos.
 * Retorna null quando o status não é conhecido/suportado (deve gerar WEBHOOK_IGNORADO).
 */
export function mapEvolutionStatus(raw) {
    if (raw === undefined || raw === null)
        return null;
    const s = String(raw).trim().toUpperCase();
    switch (s) {
        case "SENT":
        case "SERVER_ACK":
        case "PENDING":
        case "ENVIADO":
            return "ENVIADO";
        case "DELIVERED":
        case "DELIVERY_ACK":
        case "ENTREGUE":
            return "ENTREGUE";
        case "READ":
        case "PLAYED":
        case "LIDO":
            return "LIDO";
        case "FAILED":
        case "ERROR":
        case "FALHOU":
        case "FALHOU_DEFINITIVO":
            return "FALHOU_DEFINITIVO";
        default:
            return null;
    }
}
/**
 * Extrai apenas o mínimo necessário do payload Evolution. Nunca retorna PII.
 */
export function parseEvolutionPayload(body) {
    const b = body ?? {};
    const data = b.data ?? b.message ?? b;
    const instance = b.instance ?? b.instanceName ?? data?.instance ?? data?.instanceName ?? null;
    const providerMessageId = data?.key?.id ??
        data?.keyId ??
        b.messageId ??
        data?.messageId ??
        data?.id ??
        null;
    const rawStatus = data?.status ??
        b.status ??
        data?.update?.status ??
        b.event ??
        null;
    const status = mapEvolutionStatus(rawStatus);
    const codigo = data?.errorCode ?? b.errorCode ?? null;
    const mensagem = (() => {
        const raw = data?.errorMessage ?? b.errorMessage ?? null;
        return raw ? String(raw).slice(0, 200) : null;
    })();
    return {
        instance: instance ? String(instance).slice(0, 128) : null,
        providerMessageId: providerMessageId ? String(providerMessageId).slice(0, 256) : null,
        status,
        codigo: codigo ? String(codigo).slice(0, 64) : null,
        mensagem,
    };
}
export function idempotencyKey(instance, providerMessageId, status) {
    return `evolution:${instance ?? "-"}:${providerMessageId}:${status}`;
}
export function timingSafeEqualStr(a, b) {
    if (typeof a !== "string" || typeof b !== "string")
        return false;
    if (a.length !== b.length)
        return false;
    let out = 0;
    for (let i = 0; i < a.length; i++)
        out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
}
