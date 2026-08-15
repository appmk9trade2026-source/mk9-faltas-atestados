import { isEvolutionAccepted } from "./whatsapp-worker";
/**
 * Normaliza o número de telefone para o formato esperado pela Evolution API
 * (Apenas dígitos, sem o prefixo +)
 */
export function normalizeEvolutionNumber(telefone) {
    return telefone.replace(/\D/g, "");
}
export async function checkEvolutionNumber(args) {
    // Endpoint: GET {BASE}/chat/whatsappNumber/{instance}?number={number}
    const normalizedNumber = normalizeEvolutionNumber(args.telefone);
    const url = `${args.baseUrl.replace(/\/+$/, "")}/chat/whatsappNumber/${encodeURIComponent(args.instance)}?number=${normalizedNumber}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                apikey: args.apiKey,
                "content-type": "application/json",
            },
            signal: controller.signal,
        });
        const raw = await res.text();
        let parsed = null;
        try {
            parsed = raw ? JSON.parse(raw) : null;
        }
        catch { /* ignore */ }
        if (res.status === 200 || res.status === 201) {
            // Formato esperado v2: { "exists": true, "jid": "...", "number": "..." }
            // ou se for um array ou objeto aninhado dependendo da versao
            const exists = !!(parsed?.exists || (Array.isArray(parsed) && parsed[0]?.exists));
            return { ok: true, exists };
        }
        // Em v2.3.7, se o endpoint retornar 404, não podemos assumir que o número não existe,
        // pois pode ser um erro de rota na API (Cannot GET).
        if (res.status === 404 && raw.includes("Cannot GET")) {
            return { ok: false, status: 404, message: "CHECK_ENDPOINT_UNAVAILABLE" };
        }
        // Se for 400 ou 404 (sem ser erro de rota), geralmente significa que o numero nao existe
        if (res.status === 400 || res.status === 404) {
            return { ok: true, exists: false };
        }
        // Se não for nenhum dos anteriores e a rota base falhou com 404/Cannot GET,
        // a versão pode não suportar o mecanismo de check.
        if (res.status === 404 || res.status === 405) {
            return { ok: false, status: res.status, message: "CHECK_NOT_SUPPORTED" };
        }
        return { ok: false, status: res.status, message: raw.slice(0, 200) };
    }
    catch (err) {
        const status = err?.name === "AbortError" ? 408 : null;
        return { ok: false, status, message: (err?.message ?? "network error").slice(0, 500) };
    }
    finally {
        clearTimeout(timer);
    }
}
export async function sendEvolutionText(args) {
    // Endpoint da Evolution API v2 estável para envio de texto:
    //   POST {BASE}/message/sendText/{instance}
    //   headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" }
    //   body: { number, text, options?: { delay, presence } }
    const url = `${args.baseUrl.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(args.instance)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    // Normalização P0: Garantir apenas dígitos no destinatário
    const normalizedNumber = normalizeEvolutionNumber(args.telefone);
    try {
        // A Evolution API requer o número com o sufixo @s.whatsapp.net em algumas versões
        // ou simplesmente o número para outras. O erro 400 anterior indicou que o JID
        // gerado internamente não existia. Vamos testar o formato mais compatível.
        const payload = {
            number: normalizedNumber,
            text: args.texto
        };
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                apikey: args.apiKey,
                "x-idempotency-key": args.idempotencyKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        const raw = await res.text();
        let parsed = null;
        try {
            parsed = raw ? JSON.parse(raw) : null;
        }
        catch { /* ignore */ }
        if (!isEvolutionAccepted(res.status)) {
            const msg = (parsed && (parsed.message || parsed.error)) || raw || `HTTP ${res.status}`;
            console.error(`[EVOLUTION_API_ERROR] status=${res.status} response=${raw.slice(0, 200)}`);
            return { ok: false, status: res.status, message: String(msg).slice(0, 500) };
        }
        const providerMessageId = parsed?.key?.id ?? parsed?.messageId ?? parsed?.id ?? parsed?.data?.key?.id ?? null;
        return { ok: true, providerMessageId };
    }
    catch (err) {
        const status = err?.name === "AbortError" ? 408 : null;
        return { ok: false, status, message: (err?.message ?? "network error").slice(0, 500) };
    }
    finally {
        clearTimeout(timer);
    }
}
