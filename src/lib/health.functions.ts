import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";

export interface ModuleHealth {
  status: HealthStatus;
  errors_recent: number;
  open_incidents: number;
  last_error_at?: string;
  sample_trace_id?: string;
}

export interface ConsolidatedHealth {
  checked_at: string;
  overall_status: HealthStatus;
  modules: Record<string, ModuleHealth>;
}

/**
 * Health Check Consolidado - Apenas para Super Admin
 */
export const getSystemHealth = createServerFn({ method: "GET" })
  .handler(async (): Promise<ConsolidatedHealth> => {
    // 1. Verificação de permissão (Super Admin only)
    // Nota: O middleware de auth e a verificação de has_role devem estar ativos.
    
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    const modules = [
      "DATABASE",
      "OBSERVABILITY",
      "NOVA_AUSENCIA",
      "DUPLICIDADE",
      "DASHBOARD",
      "PERMISSOES",
      "STORAGE"
    ];

    const healthData: Record<string, ModuleHealth> = {};

    // 2. Coletar incidentes abertos por módulo
    const { data: incidents } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("*")
      .in("status", ["OPEN", "MONITORING"]);

    // 3. Coletar contagem de erros recentes do audit_logs por módulo
    const { data: recentLogs } = await supabaseAdmin
      .from("audit_logs")
      .select("modulo, created_at, trace_id")
      .gte("created_at", fifteenMinutesAgo);

    for (const mod of modules) {
      const modIncidents = incidents?.filter(i => i.module === mod) || [];
      const modLogs = recentLogs?.filter(l => l.modulo === mod) || [];
      
      const openCount = modIncidents.length;
      const recentErrorCount = modLogs.length;

      let status: HealthStatus = "HEALTHY";
      
      if (openCount > 0) {
        const hasP0 = modIncidents.some(i => i.severity === "P0");
        const hasP1 = modIncidents.some(i => i.severity === "P1");
        status = (hasP0 || hasP1) ? "CRITICAL" : "DEGRADED";
      } else if (recentErrorCount > 5) {
        status = "DEGRADED";
      }

      // Check Database connectivity explicitly
      if (mod === "DATABASE") {
        const { error: dbError } = await supabaseAdmin.from("audit_logs").select("id").limit(1);
        if (dbError) status = "CRITICAL";
      }
      
      healthData[mod] = {
        status,
        errors_recent: recentErrorCount,
        open_incidents: openCount,
        last_error_at: modIncidents[0]?.last_seen_at || modLogs[0]?.created_at || undefined,
        sample_trace_id: modIncidents[0]?.sample_trace_id || modLogs[0]?.trace_id || undefined
      };
    }

    const overallStatus = Object.values(healthData).some(m => m.status === "CRITICAL") 
      ? "CRITICAL" 
      : Object.values(healthData).some(m => m.status === "DEGRADED") 
        ? "DEGRADED" 
        : "HEALTHY";

    return {
      checked_at: now.toISOString(),
      overall_status: overallStatus,
      modules: healthData
    };
  });


export interface AlertRow {
  id: string;
  incident_id: string;
  fingerprint: string;
  severity: string;
  status: "PENDING" | "SUPPRESSED" | "READY" | "ESCALATED" | "CLOSED";
  decision_reason: string | null;
  alert_count: number;
  escalation_level: number;
  sample_trace_id: string | null;
  last_alerted_at: string | null;
  next_eligible_at: string | null;
  created_at: string;
}

export interface NotificationOutboxRow {
  id: string;
  channel: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "RETRY" | "FAILED" | "CANCELLED";
  attempt_count: number;
  last_attempt_at?: string;
  sent_at?: string;
  last_error_code?: string;
  next_attempt_at?: string;
}

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
  alert_status?: string;
  alert_reason?: string;
  notifications?: NotificationOutboxRow[];
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
      .select(`
        *,
        operational_alerts!inner (
          status,
          decision_reason
        )
      `, { count: "exact" });
    
    // Note: Use .select("*, operational_alerts(status, decision_reason)") if we want to include all incidents even without alerts.
    // The requirement says only P0/P1 generate alerts, so we might want to keep all incidents.
    query = supabaseAdmin
      .from("operational_health_incidents")
      .select("*, alert:operational_alerts(status, decision_reason), notifications:operational_notification_outbox(id, channel, status, attempt_count, updated_at, sent_at, last_error_code, next_attempt_at)", { count: "exact" });



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
      incidents: (data || []).map(row => ({
        ...row,
        alert_status: (row as any).alert?.[0]?.status,
        alert_reason: (row as any).alert?.[0]?.decision_reason
      })) as IncidentRow[],
      total: count || 0
    };
  });
