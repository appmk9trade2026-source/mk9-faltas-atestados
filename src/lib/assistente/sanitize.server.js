// Sanitização adicional específica do Assistente. Reutiliza redactPayload de
// src/lib/pii.ts mas aplica uma política mais estrita: CID nunca vai ao
// provedor de IA, mesmo para super_admin. Também limpa qualquer texto livre
// que possa conter PII antes de entregar ao modelo.
import { redactPayload } from "@/lib/pii";
const CID_REGEX = /\b[A-Z]\d{2}(?:\.\d{1,2})?\b/g;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE_LONG_REGEX = /(?:\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g;
const TOKEN_LIKE_REGEX = /\b(?:sk|eyJ|Bearer|sb_secret|sb_publishable)[A-Za-z0-9._-]{10,}/g;
/** Redige dados vindos de uma tool antes de virar tool_result no prompt.
 *  Sempre esconde CID/observações médicas — mesmo para super_admin. */
export function sanitizeToolResult(value) {
    // Força política médica estrita para o modelo (roles=[]).
    const base = redactPayload(value, []);
    return scrubStrings(base);
}
function scrubStrings(v) {
    if (typeof v === "string")
        return scrubString(v);
    if (Array.isArray(v))
        return v.map(scrubStrings);
    if (v && typeof v === "object") {
        const out = {};
        for (const [k, val] of Object.entries(v))
            out[k] = scrubStrings(val);
        return out;
    }
    return v;
}
export function scrubString(s) {
    return s
        .replace(TOKEN_LIKE_REGEX, "[oculto]")
        .replace(CPF_REGEX, "[cpf]")
        .replace(PHONE_LONG_REGEX, "[telefone]")
        .replace(CID_REGEX, "[cid]");
}
/** Sanitiza a resposta textual do modelo antes de mostrar ao usuário. */
export function sanitizeAssistantText(s) {
    return scrubString(s);
}
/** Embala o JSON de resposta de uma tool em bloco delimitado com aviso
 *  anti-prompt-injection. */
export function wrapToolResult(toolName, payload) {
    const safe = sanitizeToolResult(payload);
    return `<data source="${toolName}">\n${JSON.stringify(safe)}\n</data>`;
}
