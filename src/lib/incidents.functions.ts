import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const getIncidents = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from('support_incidents')
      .select('*, support_incident_tickets(count)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  });

export const getIncidentById = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: incident, error: incError } = await supabase
      .from('support_incidents')
      .select(`
        *,
        support_incident_tickets(
          *,
          support_tickets(*)
        )
      `)
      .eq('id', data.id)
      .single();

    if (incError) throw incError;
    return incident;
  });

export const confirmIncident = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ 
    id: z.string().uuid(),
    severity: z.enum(['P0', 'P1', 'P2', 'P3'])
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: incident, error } = await supabase
      .from('support_incidents')
      .update({
        status: 'CONFIRMED',
        severity: data.severity,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id
      } as any)
      .eq('id', data.id)
      .select()
      .single();

    if (error) throw error;

    // Audit Event
    await supabase.from('support_ticket_events').insert({
      ticket_id: null, // Evento de sistema/incidente
      actor_user_id: user.id,
      event_type: 'INCIDENT_CONFIRMED',
      metadata: { incident_id: data.id, severity: data.severity }
    } as any);

    return incident;
  });

export const resolveIncident = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ 
    id: z.string().uuid(),
    resolution_summary: z.string().min(10)
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: incident, error } = await supabase
      .from('support_incidents')
      .update({
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        description: data.resolution_summary // Reaproveitando campo ou adicionando metadados
      } as any)
      .eq('id', data.id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('support_ticket_events').insert({
      actor_user_id: user.id,
      event_type: 'INCIDENT_RESOLVED',
      metadata: { incident_id: data.id }
    } as any);

    return incident;
  });

export const runIncidentDetection = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Chamar RPC de detecção
    const { data: potentials, error: rpcError } = await supabase
      .rpc('detect_potential_incidents', {
        _window_minutes: 60,
        _threshold_potential: 3
      });

    if (rpcError) throw rpcError;

    const results = [];

    // 2. Para cada potencial, tentar criar incidente (deduplicado pelo fingerprint)
    for (const p of potentials || []) {
      const { data: incident, error: insError } = await supabase
        .from('support_incidents')
        .insert({
          title: `Possível Incidente: ${p.source_module}`,
          source_module: p.source_module,
          primary_safe_code: p.safe_code,
          incident_fingerprint: p.fingerprint,
          status: 'POTENTIAL',
          detection_source: 'DETERMINISTIC'
        } as any)
        .select()
        .single();

      if (insError && insError.code !== '23505') { // Ignorar duplicados
        console.error("Erro ao inserir incidente:", insError);
        continue;
      }

      if (incident) {
        results.push(incident);
        // 3. Vincular tickets recentes (simplificado para MVP)
        // Em uma implementação real, faríamos um join para buscar os IDs dos tickets
      }
    }

    return results;
  });
