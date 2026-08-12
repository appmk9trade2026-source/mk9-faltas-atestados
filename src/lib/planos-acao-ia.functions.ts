import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrubString } from "./assistente/sanitize.server";

const API_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const suggestionInputSchema = z.object({
  tipo_alvo: z.enum(["PROJETO", "SUPERVISOR", "COLABORADOR"]),
  projeto_nome: z.string().optional(),
  supervisor_nome: z.string().optional(),
  colaborador_nome: z.string().optional(),
  problema_identificado: z.string().min(5),
});

export const gerarSugestaoPlanoAcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => suggestionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada.");
    }

    const { tipo_alvo, projeto_nome, supervisor_nome, colaborador_nome, problema_identificado } = data;
    
    // Sanitização de segurança (remover PII/CID do problema se houver)
    const problemaLimpo = scrubString(problema_identificado);

    const prompt = `Você é um gestor de RH especialista em planos de ação.
Ajude a elaborar um plano de ação profissional e prático.

Contexto:
- Alvo: ${tipo_alvo}
${projeto_nome ? `- Projeto: ${projeto_nome}` : ""}
${supervisor_nome ? `- Supervisor: ${supervisor_nome}` : ""}
${colaborador_nome ? `- Colaborador: ${colaborador_nome}` : ""}
- Problema Identificado: ${problemaLimpo}

REGRAS:
1. Retorne EXCLUSIVAMENTE um JSON com as chaves: "titulo", "problema_revisado", "meta", "indicador_sucesso", "acao_proposta".
2. "titulo": Crie um título profissional e curto para o plano.
3. "problema_revisado": Reescreva o problema de forma profissional e objetiva (máx 300 caracteres).
4. "meta": Defina uma meta mensurável e temporal (ex: "Reduzir X em Y% nos próximos 30 dias").
5. "indicador_sucesso": Defina como o resultado será mensurado (ex: "Percentual mensal de faltas").
4. "acao_proposta": Liste 3 a 5 ações práticas e executáveis.
5. Tom profissional, sem saudações ou preâmbulos.

JSON:`;

    const response = await fetch(API_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você responde apenas em JSON válido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[gerarSugestaoPlanoAcao] AI Gateway error:", errorText);
      throw new Error("Falha ao consultar assistente de IA.");
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    try {
      return JSON.parse(content);
    } catch (e) {
      console.error("[gerarSugestaoPlanoAcao] Failed to parse AI response:", content);
      throw new Error("Resposta da IA em formato inválido.");
    }
  });
