// Camada de abstração do provedor de IA. Padrão: Lovable AI Gateway.
// Não acoplar o Assistente a um único fornecedor — todas as chamadas passam
// por este helper e podem ser roteadas para outro backend sem tocar no
// orquestrador.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown; // JSON Schema
  };
};

export type CompletionChoice = {
  finish_reason?: string;
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
};

export type CompletionResponse = {
  choices?: CompletionChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export type CallOptions = {
  model?: string;
  temperature?: number;
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  timeoutMs?: number;
  jsonMode?: boolean;
};

export type CallResult = {
  raw: CompletionResponse;
  latencyMs: number;
  model: string;
};

export class AiProviderError extends Error {
  constructor(
    public code: "rate_limit" | "credits_exhausted" | "timeout" | "unavailable" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export async function callChat(
  messages: ChatMessage[],
  opts: CallOptions = {},
): Promise<CallResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new AiProviderError("unavailable", "LOVABLE_API_KEY ausente");

  const model = opts.model ?? DEFAULT_MODEL;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);

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

    if (res.status === 429) throw new AiProviderError("rate_limit", "Provedor com rate limit");
    if (res.status === 402) throw new AiProviderError("credits_exhausted", "Créditos esgotados");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AiProviderError("unavailable", `Gateway ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as CompletionResponse;
    return { raw: data, latencyMs: Date.now() - started, model };
  } catch (err) {
    if (err instanceof AiProviderError) throw err;
    if ((err as { name?: string })?.name === "AbortError") {
      throw new AiProviderError("timeout", "Provedor demorou demais");
    }
    throw new AiProviderError("unavailable", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
