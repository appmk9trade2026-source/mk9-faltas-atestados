import { isEvolutionAccepted } from "./whatsapp-worker";

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
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: args.apiKey,
        "x-idempotency-key": args.idempotencyKey,
      },
      body: JSON.stringify({ number: args.telefone, text: args.texto }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
    
    if (!isEvolutionAccepted(res.status)) {
      const msg = (parsed && (parsed.message || parsed.error)) || raw || `HTTP ${res.status}`;
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
