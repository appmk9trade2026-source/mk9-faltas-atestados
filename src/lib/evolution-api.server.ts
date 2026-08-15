import { classifyEvolutionError, isEvolutionAccepted } from "./whatsapp-worker";

/**
 * Normaliza o número de telefone para o formato esperado pela Evolution API
 * (Apenas dígitos, sem o prefixo +)
 */
export function normalizeEvolutionNumber(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

export async function sendEvolutionText(args: {
  baseUrl: string;
  apiKey: string;
  instance: string;
  telefone: string;
  texto: string;
  idempotencyKey: string;
  timeoutMs: number;
}): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; status: number | null; message: string }> {
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
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
    
    if (!isEvolutionAccepted(res.status)) {
      const msg = (parsed && (parsed.message || parsed.error)) || raw || `HTTP ${res.status}`;
      console.error(`[EVOLUTION_API_ERROR] status=${res.status} response=${raw.slice(0, 200)}`);
      return { ok: false, status: res.status, message: String(msg).slice(0, 500) };
    }
    const providerMessageId =
      parsed?.key?.id ?? parsed?.messageId ?? parsed?.id ?? parsed?.data?.key?.id ?? null;
    return { ok: true, providerMessageId };
  } catch (err: any) {
    const status = err?.name === "AbortError" ? 408 : null;
    return { ok: false, status, message: (err?.message ?? "network error").slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}