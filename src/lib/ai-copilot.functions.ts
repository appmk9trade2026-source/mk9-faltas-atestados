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

    // 2. Sanitizar contexto
    const context = sanitizeContent(
      `Subject: ${ticket.subject}\nDescription: ${ticket.description}\n` +
      (ticket.support_messages || []).map((m: any) => `${m.sender_role}: ${m.content}`).join('\n')
    );

    // 3. IA (Simulação de chamada ao Gateway)
    const summary = `RESUMO DO CHAMADO\n\nProblema: ${ticket.subject}\nMódulo: ${ticket.source_route || 'N/A'}\nSafe Code: ${ticket.safe_code || 'N/A'}\n\nO usuário relata dificuldade em processar a solicitação. Já houve interações.`;

    // 4. Auditoria
    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      event_type: 'AI_SUMMARY_REQUESTED',
      created_by: user.id,
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
      evidence: "Safe Code detectado no histórico.",
      hypothesis: "Provável instabilidade no RPC de processamento.",
      confidence: "MEDIUM",
      relatedArticles: articles?.map(a => a.title) || []
    };

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      event_type: 'AI_DIAGNOSIS_SUGGESTED',
      created_by: user.id
    } as any);

    return diagnosis;
  });

export const suggestReply = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const reply = "Olá! Identificamos que sua solicitação de ausência já foi processada pelo RH. Por esse motivo, a retificação não está disponível via sistema. Caso precise de ajustes, recomendamos entrar em contato com seu gestor direto.";

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      event_type: 'AI_REPLY_SUGGESTED',
      created_by: user.id
    } as any);

    return { reply };
  });
