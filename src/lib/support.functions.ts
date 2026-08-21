import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Database } from "@/integrations/supabase/types";
import { getRelatedArticles, createArticleFromTicket } from "./knowledge.functions";

export { getRelatedArticles, createArticleFromTicket };

export const markMessagesAsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const db = context.supabase;

    const { error } = await db
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('ticket_id', data.ticketId)
      .neq('sender_user_id', userId)
      .is('read_at', null);

    if (error) throw new Error(error.message);
    return { success: true };
  });



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
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid(),
    category: z.string(),
    summary: z.string().min(10),
    internalNotes: z.string().optional()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const db = context.supabase;

    // 1. Verificar autorização
    const { data: userRole } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!userRole || (userRole.role !== 'rh' && userRole.role !== 'super_admin')) {
      throw new Error("Apenas atendentes autorizados podem resolver chamados.");
    }

    // 2. Verificar se o ticket existe e escopo (se for RH, deve estar atribuído ou livre para Admin)
    const { data: ticket, error: fetchError } = await db
      .from('support_tickets')
      .select('status, assigned_user_id')
      .eq('id', data.ticketId)
      .single();

    if (fetchError || !ticket) {
      throw new Error("Chamado não encontrado.");
    }

    if (ticket.status === 'RESOLVIDO') {
      return ticket; // Idempotência básica
    }

    // 3. Atualizar ticket
    const { data: updatedTicket, error } = await db
      .from('support_tickets')
      .update({
        status: 'RESOLVIDO',
        resolution_category: data.category,
        resolution_summary: data.summary,
        resolution_internal_notes: data.internalNotes,
        resolved_at: new Date().toISOString(),
        resolved_by: userId, // Identidade derivada server-side
        sla_status: 'CONCLUIDO',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.ticketId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 4. Auditoria
    await db.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: userId,
      event_type: 'TICKET_RESOLVED'
    });

    return updatedTicket;
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
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const db = context.supabase;

    const { data: roles } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!roles) throw new Error("User has no role assigned");

    // Validação server-side da categoria por perfil
    const available = getAvailableCategories(roles.role);
    const canonicalCategory = (SUPPORT_CATEGORIES[data.category as SupportCategory] ? data.category : LEGACY_CATEGORY_MAP[data.category]) as SupportCategory;
    
    if (!available.includes(canonicalCategory)) {
      throw new Error(`Categoria "${data.category}" não permitida para o seu perfil.`);
    }

    const { data: ticket, error } = await db
      .from('support_tickets')
      .insert({
        ...data,
        category: canonicalCategory, // Salva o valor canônico
        protocol: 'PENDING',
        requester_user_id: userId,
        requester_role: roles.role,
        status: 'ABERTO'
      } as any)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await db.from('support_ticket_events').insert({
      ticket_id: ticket.id,
      actor_user_id: userId,
      event_type: 'TICKET_CREATED'
    });

    return ticket;
  });

export const getTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const db = context.supabase;

    const { data: roles } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!roles) throw new Error("User has no role assigned");

    let query = db
      .from('support_tickets')
      .select('*');

    // Regra de visibilidade baseada no papel
    if (roles.role !== 'super_admin' && roles.role !== 'rh') {
      // Supervisor só vê os próprios tickets
      query = query.eq('requester_user_id', userId);
    }

    const { data: tickets, error } = await query.order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Fetch requester profiles manually to avoid schema cache join issues
    const requesterIds = [...new Set(tickets.map(t => t.requester_user_id).filter((id): id is string => !!id))];
    const assignedIds = [...new Set(tickets.map(t => t.assigned_user_id).filter((id): id is string => !!id))];
    const allProfileIds = [...new Set([...requesterIds, ...assignedIds])];

    const { data: profiles } = await db
      .from('profiles')
      .select('id, email')
      .in('id', allProfileIds);

    const profileMap = (profiles || []).reduce((acc: Record<string, any>, p) => {
      acc[p.id] = p;
      return acc;
    }, {});

    const data = tickets.map(t => ({
      ...t,
      requester: t.requester_user_id ? profileMap[t.requester_user_id] : null,
      assigned: t.assigned_user_id ? profileMap[t.assigned_user_id] : null
    }));
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
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid(),
    message: z.string().min(1),
    messageType: z.enum(['TEXTO', 'SISTEMA', 'ANEXO'] as const).default('TEXTO')
  }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const db = context.supabase;

    // 1. Validar autorização (pode participar do ticket?)
    const { data: ticket, error: ticketError } = await db
      .from('support_tickets')
      .select('requester_user_id, assigned_user_id')
      .eq('id', data.ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error("Chamado não encontrado ou acesso negado.");
    }

    // 2. Verificar papéis
    const { data: userRole } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const isRequester = ticket.requester_user_id === userId;
    const isAssigned = ticket.assigned_user_id === userId;
    const isAdmin = userRole?.role === 'super_admin';
    const isRH = userRole?.role === 'rh';

    // Regra: Solicitante ou Atendente Atribuído ou Admin podem enviar mensagem.
    // RH não atribuído é bloqueado para manter integridade da fila (conforme RLS).
    if (!isRequester && !isAssigned && !isAdmin) {
      throw new Error("Você não tem permissão para enviar mensagens neste chamado.");
    }

    const { data: msg, error: msgError } = await db
      .from('support_messages')
      .insert({
        ticket_id: data.ticketId,
        sender_user_id: userId,
        message: data.message,
        message_type: data.messageType
      })
      .select()
      .single();

    if (msgError) throw new Error(msgError.message);

    // 3. Auditoria
    await db.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: userId,
      event_type: 'MESSAGE_SENT'
    });

    // 4. Atualizar timestamp do ticket
    await db
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', data.ticketId);

    return msg;
  });

export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    ticketId: z.string().uuid()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const db = context.supabase;

    const { data: roles } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!roles) throw new Error("User has no role assigned");
    
    // Apenas RH e Super Admin podem assumir tickets
    if (roles.role !== 'rh' && roles.role !== 'super_admin') {
      throw new Error("Apenas atendentes autorizados podem assumir chamados.");
    }

    // Verificar concorrência (somente um assume)
    const { data: ticket, error } = await db
      .from('support_tickets')
      .update({
        assigned_user_id: userId,
        assigned_role: roles.role,
        status: 'EM_ATENDIMENTO',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.ticketId)
      .is('assigned_user_id', null)
      .select()
      .maybeSingle();

    if (error || !ticket) {
      throw new Error("Este chamado já foi assumido por outro atendente ou não está mais disponível.");
    }

    await db.from('support_ticket_events').insert({
      ticket_id: data.ticketId,
      actor_user_id: userId,
      event_type: 'TICKET_ASSIGNED',
      new_value: userId
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const db = context.supabase;

    // First, find all tickets where the user is either the requester or the assigned agent
    const { data: tickets, error: ticketError } = await db
      .from('support_tickets')
      .select('id')
      .or(`requester_user_id.eq.${userId},assigned_user_id.eq.${userId}`);

    if (ticketError) {
      console.error("Error fetching tickets for unread count:", ticketError);
      return 0;
    }

    if (!tickets || tickets.length === 0) return 0;

    const ticketIds = tickets.map(t => t.id);

    // Count unread messages in those tickets that were NOT sent by the current user
    const { count, error } = await db
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .neq('sender_user_id', userId)
      .in('ticket_id', ticketIds);

    if (error) {
      console.error("Error fetching unread messages count:", error);
      return 0;
    }

    return count || 0;
  });





