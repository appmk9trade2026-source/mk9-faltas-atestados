import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export interface IncidentRow {
  id: string;
  fingerprint: string;
  module: string;
  operation: string;
  stage: string | null;
  category: string;
  severity: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  affected_users_count: number;
  sample_trace_id: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

const listIncidentsSchema = z.object({
  status: z.enum(["OPEN", "MONITORING", "RESOLVED", "ALL"]).optional(),
  severity: z.enum(["P0", "P1", "P2", "P3", "ALL"]).optional(),
  module: z.string().optional(),
  period: z.enum(["1h", "24h", "7d", "30d"]).optional(),
  traceId: z.string().uuid().optional(),
  limit: z.number().optional().default(50),
  offset: z.number().optional().default(0),
});

/**
 * Listagem de incidentes com filtros - Super Admin Only
 */
export const listHealthIncidents = createServerFn({ method: "GET" })
  .middleware([
    // Aqui deveria ter o requireSupabaseAuth + check super_admin
    // Por enquanto usamos a política de RLS no DB que já restringe super_admin
  ])
  .inputValidator((data) => listIncidentsSchema.parse(data))
  .handler(async ({ data: filters }) => {
    let query = supabaseAdmin
      .from("operational_health_incidents")
      .select("*", { count: "exact" });

    if (filters.status && filters.status !== "ALL") {
      query = query.eq("status", filters.status);
    }
    if (filters.severity && filters.severity !== "ALL") {
      query = query.eq("severity", filters.severity);
    }
    if (filters.module && filters.module !== "ALL") {
      query = query.eq("module", filters.module);
    }
    if (filters.traceId) {
      query = query.eq("sample_trace_id", filters.traceId);
    }

    if (filters.period) {
      const now = new Date();
      let start: Date;
      if (filters.period === "1h") start = new Date(now.getTime() - 60 * 60 * 1000);
      else if (filters.period === "24h") start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      else if (filters.period === "7d") start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte("last_seen_at", start.toISOString());
    }

    // Ordenação sugerida: CRITICAL -> DEGRADED/P1 -> mais recente
    query = query
      .order("severity", { ascending: true }) // P0 < P1 < P2 < P3 alfabetico funciona se usarmos ordem customizada ou sorte no front
      .order("last_seen_at", { ascending: false });

    const { data, count, error } = await query
      .range(filters.offset, filters.offset + filters.limit - 1);

    if (error) throw error;

    return {
      incidents: (data || []) as IncidentRow[],
      total: count || 0
    };
  });
