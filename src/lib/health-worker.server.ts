import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as crypto from "crypto";
import { sendEvolutionText } from "./evolution-api.server";
import { classifyEvolutionError } from "./whatsapp-worker";


const WORKER_CONFIG = {
  BATCH_SIZE: 5,
  MAX_ATTEMPTS: 5,
  TIMEOUT_MS: 15000,
  LOCK_TIMEOUT_MINUTES: 5,
  BASE_DELAY_SECONDS: 30
};

/**
 * Worker Server-Side para Processamento da Outbox (Etapa 7)
 */
export async function processNotificationOutbox(dryRun: boolean = false) {
  const now = new Date().toISOString();
  const lockId = crypto.randomUUID();

  try {
    // 1. Adquirir lock para itens PENDING ou RETRY elegíveis
    // Usamos uma estratégia de lock por tempo/processo para evitar concorrência
    const { data: items, error: lockError } = await supabaseAdmin
      .from("operational_notification_outbox")
      .update({
        status: "PROCESSING",
        locked_at: now,
        locked_by: lockId,
        updated_at: now
      })
      .in("status", ["PENDING", "RETRY"])
      .lte("next_attempt_at", now)
      .is("locked_at", null)
      .select("*, alert:operational_alerts(status, severity)")
      .limit(WORKER_CONFIG.BATCH_SIZE);

    if (lockError) throw lockError;
    if (!items || items.length === 0) return { processed: 0 };
    
    // 2. Carregar Configuração Global (Etapa 8)
    const { data: config } = await supabaseAdmin
      .from("operational_notification_config")
      .select("*")
      .single();

    const results = await Promise.all(items.map(item => processSingleItem(item, config, dryRun)));

    return {
      processed: items.length,
      results
    };
  } catch (err) {
    console.error("[NOTIFICATION_WORKER_CRITICAL_FAILURE]", err);
    throw err;
  }
}

async function processSingleItem(item: any, config: any, dryRun: boolean) {
  const start = new Date();
  let resultStatus: "SUCCESS" | "TRANSIENT_FAILURE" | "PERMANENT_FAILURE" = "SUCCESS";
  let safeErrorCode = null;
  let providerMessageId = null;

  try {
    // 1. Fail-Closed & Kill Switch (Etapa 8)
    if (!config || config.environment === 'DISABLED' || !config.kill_switch_enabled) {
      const reason = !config ? "MISSING_CONFIG" : 
                    config.environment === 'DISABLED' ? "ENVIRONMENT_DISABLED" : 
                    "KILL_SWITCH_OFF";
      
      await finalizeItem(item.id, "PENDING", item.attempt_count, `SUPPRESSED_${reason}`);
      return { id: item.id, status: "SUPPRESSED", reason };
    }

    // 2. Verificar se o incidente ainda é válido (Etapa 7.7)
    const { data: incident } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("status")
      .eq("id", item.incident_id)
      .single();

    if (incident?.status === "RESOLVED") {
      await finalizeItem(item.id, "CANCELLED", 0, "INCIDENT_RESOLVED_BEFORE_DELIVERY");
      return { id: item.id, status: "CANCELLED" };
    }

    // 3. Mapear Destinatários Técnicos (Etapa 8.7 Fallback)
    const { data: recipients } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .eq("channel", item.channel)
      .eq("environment", config.environment)
      .eq("active", true);

    const filtered = (recipients as any[] || []).filter(r => {
      const isVerified = r.verified_at !== null;
      const isAdminVerified = r.admin_verified === true && r.provider_check_capability === 'NOT_SUPPORTED';
      return isVerified || isAdminVerified;
    });

    // Guardrail P0: Em SANDBOX, apenas is_test_recipient
    const eligibleRecipients = config.environment === 'SANDBOX' 
      ? filtered.filter(r => (r as any).is_test_recipient)
      : filtered;

    if (eligibleRecipients.length === 0) {
      await finalizeItem(item.id, "FAILED", item.attempt_count, "NO_VERIFIED_RECIPIENTS");
      return { id: item.id, status: "FAILED", reason: "NO_VERIFIED_RECIPIENTS" };
    }

    // P1 continua sem envio externo (Etapa 8)
    if (item.severity === "P1") {
       await finalizeItem(item.id, "CANCELLED", item.attempt_count, "P1_EXTERNAL_DISABLED");
       return { id: item.id, status: "CANCELLED", reason: "P1_EXTERNAL_DISABLED" };
    }

    // 4. Modo DRY RUN ou Envio Real (Etapa 8)
    if (dryRun) {
      await finalizeItem(item.id, "SENT", item.attempt_count + 1, "DRY_RUN_PASSED");
      return { id: item.id, status: "DRY_RUN_PASSED" };
    }

    // 5. Dispatcher de Provedor (WHATSAPP)
    // O envio real usa a Evolution API configurada via env vars
    const response = await realProviderSend(item, recipients);
    
    if (response.success) {
      resultStatus = "SUCCESS";
      providerMessageId = (response as any).id;
    } else {
      resultStatus = (response as any).permanent ? "PERMANENT_FAILURE" : "TRANSIENT_FAILURE";
      safeErrorCode = (response as any).errorCode;
    }

  } catch (err: any) {
    console.error("[NOTIFICATION_WORKER_ITEM_ERROR]", err);
    resultStatus = "TRANSIENT_FAILURE";
    safeErrorCode = err?.name === "AbortError" ? "TIMEOUT" : "INTERNAL_ERROR";
  }

  // 4. Registrar Tentativa
  await supabaseAdmin.from("operational_notification_attempts").insert({
    outbox_id: item.id,
    attempt_number: item.attempt_count + 1,
    started_at: start.toISOString(),
    finished_at: new Date().toISOString(),
    result: resultStatus,
    safe_error_code: safeErrorCode,
    provider_message_id: providerMessageId
  });

  // 5. Finalizar ou Agendar Retry
  if (resultStatus === "SUCCESS") {
    await finalizeItem(item.id, "SENT", item.attempt_count + 1, null, providerMessageId || undefined);
  } else if (resultStatus === "PERMANENT_FAILURE" || item.attempt_count + 1 >= item.max_attempts) {
    await finalizeItem(item.id, "FAILED", item.attempt_count + 1, safeErrorCode || null);
  } else {
    // Backoff Exponencial
    const delay = WORKER_CONFIG.BASE_DELAY_SECONDS * Math.pow(2, item.attempt_count);
    const nextAttempt = new Date(Date.now() + delay * 1000).toISOString();
    
    await supabaseAdmin
      .from("operational_notification_outbox")
      .update({
        status: "RETRY",
        attempt_count: item.attempt_count + 1,
        next_attempt_at: nextAttempt,
        last_error_code: safeErrorCode,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);
  }


  return { id: item.id, status: resultStatus };
}

async function finalizeItem(id: string, status: string, attempts: number, error: string | null, providerId?: string) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("operational_notification_outbox")
    .update({
      status,
      attempt_count: attempts,
      sent_at: status === "SENT" ? now : null,
      failed_at: status === "FAILED" ? now : null,
      last_error_code: error,
      provider_message_id: providerId,
      locked_at: null,
      locked_by: null,
      updated_at: now
    })
    .eq("id", id);
}

/**
 * Envio real via Evolution API (Etapa 8 - Go-Live)
 */
async function realProviderSend(item: any, recipients: any[]) {
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  if (!baseUrl || !apiKey || !instanceName) {
    return { success: false, permanent: true, errorCode: "MISSING_SECRETS" };
  }

  // 1. Construir a mensagem técnica (PII Guardrail)
  const traceId = item.metadata?.trace_id || "N/A";
  const message = `🚨 P0 INCIDENT [${item.fingerprint}] | Severity: ${item.severity} | Trace: ${traceId}`;

  // 2. Disparar para todos os destinatários técnicos elegíveis
  // Em produção, poderíamos otimizar, mas para o Go-Live P0, enviamos sequencialmente
  // para garantir rastreabilidade.
  let lastResult = { success: true, id: null as string | null };

  for (const recipient of recipients) {
    const telefone = recipient.destination; // Corrigido de .phone/.address para .destination conforme schema verificado
    if (!telefone) continue;

    const res = await sendEvolutionText({
      baseUrl,
      apiKey,
      instance: instanceName,
      telefone,
      texto: message,
      idempotencyKey: `${item.idempotency_key}:${recipient.id}`,
      timeoutMs: WORKER_CONFIG.TIMEOUT_MS
    });

    if (!res.ok) {
      const cls = classifyEvolutionError(res.status, res.message);
      return { 
        success: false, 
        permanent: cls.kind === "DEFINITIVA", 
        errorCode: cls.codigo 
      };
    }
    
    lastResult = { success: true, id: res.providerMessageId };
  }

  return lastResult;
}
