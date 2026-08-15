import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LogContext } from "./observability.server";

/**
 * Configurações de Alerta (Etapa 6)
 */
const ALERT_CONFIG = {
  P0: { cooldown_minutes: 15, persistence_required: false as const },
  P1: { cooldown_minutes: 60, persistence_required: true as const, min_occurrences: 3, min_users: 2 },
  GLOBAL_RATE_LIMIT_PER_HOUR: 10
};

/**
 * Filtros de incidentes - NÃO criar incidentes para erros esperados.
 */
const IGNORED_CATEGORIES = ["VALIDATION", "AUTH"];
const IGNORED_MESSAGES = [
  "Já existe um lançamento",
  "Já existe ausência ativa",
  "Protocolo em duplicidade",
  "Permission denied", // RLS normal
  "Not found",
  "JWT expired"
];

/**
 * Calcula o fingerprint determinístico e sanitizado.
 */
function calculateFingerprint(context: LogContext, error: any): string {
  const safeErrorCode = error?.code || "NO_CODE";
  const components = [
    context.module,
    context.operation,
    context.stage || "unknown",
    context.category,
    safeErrorCode
  ];
  
  const rawString = components.join("|").toLowerCase();
  return Buffer.from(rawString).toString('base64');
}

/**
 * Engine de Avaliação de Alerta (Etapa 6)
 */
async function evaluateOperationalAlert(incidentId: string, context: LogContext) {
  try {
    const { data: incident } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("*")
      .eq("id", incidentId)
      .single();

    if (!incident) return;

    // 1. Somente P0 e P1 geram alertas
    if (incident.severity !== "P0" && incident.severity !== "P1") return;

    // 2. Buscar alerta existente ou criar novo ciclo
    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", incident.fingerprint)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const config = incident.severity === "P0" ? ALERT_CONFIG.P0 : ALERT_CONFIG.P1;

    // 3. Rate Limit Global (Anti-Flood)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { count: recentReadyAlerts } = await supabaseAdmin
      .from("operational_alerts")
      .select("*", { count: "exact", head: true })
      .eq("status", "READY")
      .gte("last_alerted_at", oneHourAgo);

    if ((recentReadyAlerts || 0) >= ALERT_CONFIG.GLOBAL_RATE_LIMIT_PER_HOUR) {
      await logAlertDecision(incidentId, incident.fingerprint, incident.severity, "SUPPRESSED", "RATE_LIMIT", context.traceId);
      return;
    }

    // 4. Lógica de Cooldown
    if (alert && alert.status !== "CLOSED") {
      const nextEligible = alert.next_eligible_at ? new Date(alert.next_eligible_at) : null;
      if (nextEligible && now < nextEligible) {
        await supabaseAdmin
          .from("operational_alerts")
          .update({
            alert_count: Number(alert.alert_count) + 1,
            last_evaluated_at: now.toISOString(),
            decision_reason: "COOLDOWN",
            status: "SUPPRESSED"
          })
          .eq("id", alert.id);
        return;
      }
    }

    // 5. Lógica de Persistência (P1)
    if (config.persistence_required) {
      const p1Config = config as typeof ALERT_CONFIG.P1;
      const isPersistent = 
        Number(incident.occurrence_count) >= (p1Config.min_occurrences || 0) || 
        Number(incident.affected_users_count) >= (p1Config.min_users || 0);

      if (!isPersistent) {
        await logAlertDecision(incidentId, incident.fingerprint, incident.severity, "PENDING", "LOW_OCCURRENCE", context.traceId);
        return;
      }
    }

    // 6. Decisão Final: READY ou ESCALATED
    let status: "READY" | "ESCALATED" = "READY";
    let escalationLevel = alert ? alert.escalation_level : 1;

    if (alert && alert.alert_count > 5) {
      status = "ESCALATED";
      escalationLevel++;
    }

    const nextEligibleDate = new Date(now.getTime() + config.cooldown_minutes * 60 * 1000);

    if (alert && alert.status !== "CLOSED") {
      await supabaseAdmin
        .from("operational_alerts")
        .update({
          status,
          decision_reason: status === "ESCALATED" ? "PERSISTENCE_HIGH" : "THRESHOLD_MET",
          alert_count: Number(alert.alert_count) + 1,
          last_alerted_at: now.toISOString(),
          last_evaluated_at: now.toISOString(),
          next_eligible_at: nextEligibleDate.toISOString(),
          escalation_level: escalationLevel,
          sample_trace_id: context.traceId
        })
        .eq("id", alert.id);
    } else {
      await supabaseAdmin
        .from("operational_alerts")
        .insert({
          incident_id: incidentId,
          fingerprint: incident.fingerprint,
          severity: incident.severity,
          status,
          decision_reason: "INITIAL_DETECTION",
          alert_count: 1,
          last_alerted_at: now.toISOString(),
          next_eligible_at: nextEligibleDate.toISOString(),
          sample_trace_id: context.traceId
        });
    }

  } catch (err) {
    console.error("[ALERT_ENGINE_FAILURE]", err);
  }
}

async function logAlertDecision(
  incidentId: string, 
  fingerprint: string, 
  severity: string, 
  status: any, 
  reason: string, 
  traceId: string
) {
  // Tenta atualizar se já houver um registro pendente ou suprimido para o mesmo fingerprint
  const { data: existing } = await supabaseAdmin
    .from("operational_alerts")
    .select("id")
    .eq("fingerprint", fingerprint)
    .in("status", ["PENDING", "SUPPRESSED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("operational_alerts")
      .update({
        status,
        decision_reason: reason,
        last_evaluated_at: new Date().toISOString(),
        sample_trace_id: traceId,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin
      .from("operational_alerts")
      .insert({
        incident_id: incidentId,
        fingerprint,
        severity,
        status,
        decision_reason: reason,
        sample_trace_id: traceId
      });
  }
}

/**
 * Agrega um erro em um incidente operacional e avalia alertas.
 */
export async function aggregateIncident(context: LogContext, error: unknown) {
  // 1. Filtros
  if (IGNORED_CATEGORIES.includes(context.category)) return;
  
  const rawError = error as any;
  const message = rawError?.message || "";
  if (IGNORED_MESSAGES.some(msg => message.includes(msg))) return;

  // 2. Fingerprint
  const fingerprint = calculateFingerprint(context, rawError);

  try {
    let incidentId: string | null = null;

    // 3. Upsert atômico
    const result = await supabaseAdmin
      .from("operational_health_incidents")
      .select("id, occurrence_count, affected_users_count, metadata")
      .eq("fingerprint", fingerprint)
      .in("status", ["OPEN", "MONITORING"])
      .maybeSingle();

    const existing = result?.data;

    if (existing) {
      incidentId = existing.id;
      const newMetadata = existing.metadata as any;
      const affectedUsers = new Set(newMetadata.affected_users || []);
      if (context.userId) affectedUsers.add(context.userId);

      await supabaseAdmin
        .from("operational_health_incidents")
        .update({
          occurrence_count: Number(existing.occurrence_count) + 1,
          affected_users_count: affectedUsers.size,
          last_seen_at: new Date().toISOString(),
          sample_trace_id: context.traceId,
          metadata: { ...newMetadata, affected_users: Array.from(affectedUsers).slice(0, 100) },
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);
    } else {
      // Criar novo incidente
      const affectedUsers = context.userId ? [context.userId] : [];
      const { data: inserted } = await supabaseAdmin
        .from("operational_health_incidents")
        .insert({
          fingerprint,
          module: context.module,
          operation: context.operation,
          stage: context.stage,
          category: context.category,
          severity: context.severity,
          status: "OPEN",
          occurrence_count: 1,
          affected_users_count: affectedUsers.length,
          sample_trace_id: context.traceId,
          metadata: { affected_users: affectedUsers }
        })
        .select("id")
        .single();
      
      if (inserted) incidentId = inserted.id;
    }

    // 4. Avaliar Alerta (Etapa 6)
    if (incidentId) {
      await evaluateOperationalAlert(incidentId, context);
    }

  } catch (err) {
    console.error("[HEALTH_AGGREGATION_FAILURE]", err);
  }
}

