import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// Mock de sanitização de PII
const sanitizeContent = (text: string) => {
  return text
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[CPF-REDACTED]")
    .replace(/\d{11}/g, "[CPF-REDACTED]")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL-REDACTED]");
};

export const summarizeTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Buscar Ticket e Mensagens
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*, support_messages(*)')
      .eq('id', data.ticketId)
      .single();

    if (ticketError || !ticket) throw new Error("Ticket not found");

    // 2. IA (Simulação de chamada ao Gateway)
    // No ambiente Lovable, aqui usaríamos o ai_gateway para processamento real.
    const summary = `RESUMO DO CHAMADO (GERADO POR IA)\n\n• Problema: ${ticket.subject}\n• Módulo: ${ticket.source_route || 'Não informado'}\n• Contexto: O solicitante relata que ${ticket.description.slice(0, 100)}...\n• Histórico: ${(ticket.support_messages || []).length} mensagens trocadas.\n• Safe Code: ${ticket.safe_code || 'Nenhum vinculado'}`;

    // 3. Auditoria
    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: user.id,
      event_type: 'AI_SUMMARY_REQUESTED',
      metadata: { action: 'summarize' }
    } as any);

    return { summary };
  });

export const suggestDiagnosis = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', data.ticketId)
      .single();

    // Buscar Base de Conhecimento relacionada
    const { data: articles } = await supabase
      .from('support_knowledge_articles')
      .select('title, summary')
      .eq('status', 'PUBLISHED')
      .limit(3);

    const diagnosis = {
      symptom: ticket?.description.slice(0, 100),
      evidence: ticket?.safe_code ? `Safe Code ${ticket.safe_code} detectado.` : "Ausência de Safe Code técnico.",
      hypothesis: "Provável instabilidade ou falha de validação no fluxo de origem.",
      confidence: "MEDIUM",
      relatedArticles: articles?.map(a => a.title) || []
    };

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: user.id,
      event_type: 'AI_DIAGNOSIS_SUGGESTED'
    } as any);

    return diagnosis;
  });

export const suggestReply = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const reply = "Olá! Identificamos sua solicitação. Com base nas evidências técnicas, estamos encaminhando para a fila de processamento prioritário. Por favor, aguarde a atualização de status no portal.";

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: user.id,
      event_type: 'AI_REPLY_SUGGESTED'
    } as any);

    return { reply };
  });
