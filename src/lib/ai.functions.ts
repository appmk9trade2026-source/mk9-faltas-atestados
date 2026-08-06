import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callOpenRouter(
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não está configurada no servidor.");
  }
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://crm-mk9.lovable.app",
      "X-Title": "CRM MK9 — Ausências",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

/** CID → motivo sugerido em pt-BR (1-2 frases neutras, sem diagnóstico definitivo). */
export const suggestMotivoFromCID = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cid: z.string().trim().min(2).max(10) }).parse(d),
  )
  .handler(async ({ data }) => {
    const cid = data.cid.toUpperCase().replace(/\s+/g, "");
    const text = await callOpenRouter([
      {
        role: "system",
        content:
          "Você é um assistente de RH brasileiro. Dado um código CID-10, escreva 1 frase curta (máx. 250 caracteres) em pt-BR descrevendo, de forma neutra e sem diagnóstico definitivo, o motivo provável do afastamento (por exemplo: 'Afastamento por quadro respiratório agudo compatível com o CID informado.'). Não repita o código. Não inclua conselhos médicos. Apenas o texto final, sem aspas.",
      },
      { role: "user", content: `CID: ${cid}` },
    ]);
    return { motivo: text.replace(/^["']|["']$/g, "").slice(0, 500) };
  });

/** Compliance Score do texto do Motivo (0-100 + label + feedback curto). */
export const scoreCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ motivo: z.string().max(2000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const motivo = data.motivo.trim();
    if (motivo.length < 5) {
      return { score: 0, label: "Aguardando texto", feedback: "" };
    }
    const raw = await callOpenRouter(
      [
        {
          role: "system",
          content:
            'Você avalia motivos de ausência de colaboradores para conformidade com a CLT brasileira. Retorne EXCLUSIVAMENTE JSON com o formato: {"score": <inteiro 0-100>, "label": "Baixo"|"Médio"|"Alto", "feedback": "<1 frase curta em pt-BR>"}. Critérios: clareza, objetividade, adequação legal, ausência de dados médicos sensíveis desnecessários, coerência.',
        },
        { role: "user", content: `Motivo: """${motivo}"""` },
      ],
      { json: true, temperature: 0.1 },
    );
    try {
      const parsed = JSON.parse(raw) as {
        score?: number;
        label?: string;
        feedback?: string;
      };
      const score = Math.max(
        0,
        Math.min(100, Math.round(Number(parsed.score) || 0)),
      );
      return {
        score,
        label: String(parsed.label || (score >= 75 ? "Alto" : score >= 45 ? "Médio" : "Baixo")),
        feedback: String(parsed.feedback || "").slice(0, 240),
      };
    } catch {
      return { score: 0, label: "Erro", feedback: "Não foi possível analisar." };
    }
  });

/** Reescreve o motivo de forma clara e adequada à CLT (máx. 500 caracteres). */
export const improveMotivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ motivo: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = await callOpenRouter([
      {
        role: "system",
        content:
          "Você atua exclusivamente como assistente de redação profissional. Sua função é melhorar a clareza, ortografia, gramática e organização do texto, tornando-o mais profissional. É terminantemente proibido: citar CLT, leis ou normas; afirmar descontos salariais, advertências, suspensões ou punições; criar consequências ou justificativas; e alterar fatos originais (datas, horários, quantidades, nomes, matrículas ou protocolos). Preserve integralmente o significado informado pelo usuário. Retorne apenas o texto final revisado, sem preâmbulos e sem aspas.",
      },
      { role: "user", content: data.motivo },
    ]);
    return { motivo: text.replace(/^["']|["']$/g, "").slice(0, 500) };
  });
