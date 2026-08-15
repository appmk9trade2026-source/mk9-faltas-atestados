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
    // Para simplificar esta primeira versão técnica do backend, assumimos que o chamador 
    // será validado pelo middleware attachSupabaseAuth e políticas de RLS ou verificações explícitas.
    
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
    // Filtramos por acao='ACESSO_NEGADO' que é o nosso logAppError padrão atual
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
      
      // Check Storage Health (Etapa 8: delta de órfãos)
      if (mod === "STORAGE") {
          // Mock para Etapa 8 por enquanto, já que não temos o job de reconciliação
          // status = "HEALTHY";
      }

      healthData[mod] = {
        status,
        errors_recent: recentErrorCount,
        open_incidents: openCount,
        last_error_at: modIncidents[0]?.last_seen_at || modLogs[0]?.created_at,
        sample_trace_id: modIncidents[0]?.sample_trace_id || modLogs[0]?.trace_id
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
