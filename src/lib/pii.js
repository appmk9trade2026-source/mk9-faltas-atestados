// Utilitários de mascaramento de dados sensíveis (PII).
//
// Regra geral: nunca expor CID, diagnóstico, telefone completo, tokens ou
// secrets em telas ou exportações. Este módulo centraliza a redação para
// que o Histórico, os Alertas e os Relatórios apliquem sempre a mesma
// política.
const CID_ALLOWED = ["super_admin", "compliance"];
const PROVIDER_ID_ALLOWED = ["super_admin"];
export function canViewMedical(roles) {
    if (!roles)
        return false;
    return CID_ALLOWED.some((r) => roles.includes(r));
}
export function canViewProviderMessageId(roles) {
    if (!roles)
        return false;
    return PROVIDER_ID_ALLOWED.some((r) => roles.includes(r));
}
/**
 * Mascara um telefone preservando DDI + DDD + últimos 4 dígitos.
 * Ex.: "+5511987654321" -> "+55 (11) *****-4321"
 */
export function maskPhone(raw) {
    if (!raw)
        return "—";
    const digits = raw.replace(/\D+/g, "");
    if (digits.length < 8)
        return "*******";
    const last4 = digits.slice(-4);
    const rest = digits.slice(0, -4);
    // Brasil: DDI 55 opcional + DDD 2
    if (digits.length >= 12 && digits.startsWith("55")) {
        const ddd = digits.slice(2, 4);
        return `+55 (${ddd}) *****-${last4}`;
    }
    if (digits.length >= 10) {
        const ddd = digits.slice(0, 2);
        return `(${ddd}) *****-${last4}`;
    }
    return `${"*".repeat(rest.length)}-${last4}`;
}
const SENSITIVE_KEYS = new Set([
    "cid",
    "diagnostico",
    "diagnóstico",
    "observacoes_medicas",
    "observações_médicas",
    "telefone",
    "telefone_whatsapp",
    "whatsapp",
    "supervisor_telefone",
    "cpf",
    "arquivo_url",
    "senha",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "secret",
    "authorization",
]);
const PHONE_KEYS = new Set([
    "telefone",
    "telefone_whatsapp",
    "whatsapp",
    "supervisor_telefone",
]);
/**
 * Redige um payload JSONB (antes/depois) removendo dados sensíveis conforme
 * o perfil. Percorre recursivamente objetos e arrays.
 */
export function redactPayload(value, roles) {
    const seeCid = canViewMedical(roles);
    return walk(value, seeCid);
}
function walk(value, seeCid) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.map((v) => walk(v, seeCid));
    if (typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const key = k.toLowerCase();
            if (PHONE_KEYS.has(key)) {
                out[k] = typeof v === "string" ? maskPhone(v) : walk(v, seeCid);
                continue;
            }
            if (SENSITIVE_KEYS.has(key)) {
                if (key === "cid" && seeCid) {
                    out[k] = walk(v, seeCid);
                }
                else if (key === "cpf" && typeof v === "string") {
                    out[k] = maskCpf(v);
                }
                else {
                    out[k] = "[oculto]";
                }
                continue;
            }
            out[k] = walk(v, seeCid);
        }
        return out;
    }
    return null;
}
export function maskCpf(raw) {
    const d = raw.replace(/\D+/g, "");
    if (d.length !== 11)
        return "***";
    return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`;
}
