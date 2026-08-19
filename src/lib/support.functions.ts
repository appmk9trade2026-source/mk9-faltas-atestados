import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { getRelatedArticles, createArticleFromTicket } from "./knowledge.functions";

export { getRelatedArticles, createArticleFromTicket };


// Tipos baseados no banco
export type SupportPriority = Database['public']['Enums']['support_priority'];
export type SupportStatus = Database['public']['Enums']['support_status'];
export type SupportMessageType = Database['public']['Enums']['support_message_type'];
export type SupportSLAStatus = Database['public']['Enums']['support_sla_status'];

export const SUPPORT_CATEGORIES = {
  AUSENCIA: "Problema com Ausência",
  RETIFICACAO: "Problema com Retificação",
  OCORRENCIA_PONTO: "Problema com Ocorrência de Ponto",
  PROCESSAMENTO_INTERNO: "Processamento Interno",
  ACESSO_PERMISSAO: "Problema de Acesso / Permissão",
  ERRO_SISTEMA: "Erro no Sistema",
  DUVIDA_ORIENTACAO: "Dúvida / Orientação",
  OUTRO: "Outro"
} as const;

export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

// Mapeamento de categorias legadas (para manter compatibilidade com banco que tem strings literais)
export const LEGACY_CATEGORY_MAP: Record<string, SupportCategory> = {
  "Problema em Ausência": "AUSENCIA",
  "Retificação": "RETIFICACAO",
  "Ocorrência de Ponto": "OCORRENCIA_PONTO",
  "Processamento Interno": "PROCESSAMENTO_INTERNO",
  "Acesso / Permissão": "ACESSO_PERMISSAO",
  "Erro no Sistema": "ERRO_SISTEMA",
  "Outro": "OUTRO"
};

export const getCategoryLabel = (cat: string) => {
  const canonical = (SUPPORT_CATEGORIES[cat as SupportCategory] ? cat : LEGACY_CATEGORY_MAP[cat]) as SupportCategory;
  return SUPPORT_CATEGORIES[canonical] || cat;
};

export const getAvailableCategories = (role: string | null) => {
  const base = [
    "AUSENCIA",
    "RETIFICACAO",
    "OCORRENCIA_PONTO",
    "ACESSO_PERMISSAO",
    "ERRO_SISTEMA",
    "DUVIDA_ORIENTACAO",
    "OUTRO"
  ] as SupportCategory[];

  if (role === 'super_admin' || role === 'rh') {
    return [...base, "PROCESSAMENTO_INTERNO"] as SupportCategory[];
  }

  return base;
};

export const isAIEnabled = async () => {
  // Em produção, isso viria de uma tabela de configurações ou feature flag
  return process.env['SUPPORT_AI_ENABLED'] !== 'false';
};

export const getSupportStats = createServerFn({ method: "GET" })

  .handler(async () => {
    const { data, error } = await supabase
      .from('support_dashboard_kpis')
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data;
  });

export const getTicketsByModule = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('category, status');
      
    if (error) throw new Error(error.message);
    
    const counts = data.reduce((acc: Record<string, number>, curr) => {
      const module = curr.category || 'Outros';
      acc[module] = (acc[module] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  });


export const resolveTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid(),
    category: z.string(),
    summary: z.string().min(10),
    internalNotes: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update({
        status: 'RESOLVIDO',
        resolution_category: data.category,
        resolution_summary: data.summary,
        resolution_internal_notes: data.internalNotes,
        resolved_at: new Date().toISOString(),
        sla_status: 'CONCLUIDO',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.ticketId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: user.id,
      event_type: 'TICKET_RESOLVED'
    });

    return ticket;
  });

export const reopenTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update({
        status: 'ABERTO',
        resolved_at: null,
        reopened_at: new Date().toISOString(),
        sla_status: 'NO_PRAZO',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.ticketId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: user.id,
      event_type: 'TICKET_REOPENED'
    });

    return ticket;
  });



export const createTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    category: z.string(),
    priority: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const),
    subject: z.string().min(5),
    description: z.string().min(10),
    source_route: z.string().optional(),
    related_entity_type: z.string().optional(),
    related_entity_id: z.string().uuid().optional(),
    related_protocol: z.string().optional(),
    safe_code: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roles) throw new Error("User has no role assigned");

    // Validação server-side da categoria por perfil
    const available = getAvailableCategories(roles.role);
    const canonicalCategory = (SUPPORT_CATEGORIES[data.category as SupportCategory] ? data.category : LEGACY_CATEGORY_MAP[data.category]) as SupportCategory;
    
    if (!available.includes(canonicalCategory)) {
      throw new Error(`Categoria "${data.category}" não permitida para o seu perfil.`);
    }

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        ...data,
        category: canonicalCategory, // Salva o valor canônico
        protocol: 'PENDING',
        requester_user_id: user.id,
        requester_role: roles.role,
        status: 'ABERTO'
      } as any)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await supabase.from('support_ticket_events').insert({
      ticket_id: ticket.id,
      actor_user_id: user.id,
      event_type: 'TICKET_CREATED'
    });

    return ticket;
  });

export const getTickets = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        requester:requester_user_id(id, email),
        assigned:assigned_user_id(id, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  });

export const getTicketMessages = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: messages, error } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', data.ticketId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return messages;
  });

export const sendMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid(),
    message: z.string().min(1),
    messageType: z.enum(['TEXTO', 'SISTEMA', 'ANEXO'] as const).default('TEXTO')
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: msg, error } = await supabase
      .from('support_messages')
      .insert({
        ticket_id: data.ticketId,
        sender_user_id: user.id,
        message: data.message,
        message_type: data.messageType
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Atualizar timestamp do ticket
    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', data.ticketId);

    return msg;
  });

export const assignTicket = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roles) throw new Error("User has no role assigned");

    // Verificar concorrência (somente um assume)
    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update({
        assigned_user_id: user.id,
        assigned_role: roles.role,
        status: 'EM_ATENDIMENTO',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.ticketId)
      .is('assigned_user_id', null)
      .select()
      .single();

    if (error || !ticket) {
      throw new Error("Este chamado já foi assumido por outro atendente.");
    }

    await supabase.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: user.id,
      event_type: 'TICKET_ASSIGNED',
      new_value: user.id
    });

    return ticket;
  });

export const getAgentMetrics = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from('support_tickets')
      .select('status, assigned_user_id, resolved_at, created_at')
      .eq('assigned_user_id', user.id);

    if (error) throw new Error(error.message);

    const resolved = data.filter(t => t.status === 'RESOLVIDO').length;
    const pending = data.filter(t => t.status === 'EM_ATENDIMENTO').length;
    
    return {
      resolved,
      pending,
      total: data.length
    };
  });

export const getUnreadSupportCount = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('requester_user_id', user.id)
      .in('status', ['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO']);

    if (error) return 0;
    return count || 0;
  });


