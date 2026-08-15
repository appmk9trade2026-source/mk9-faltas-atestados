import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as crypto from "crypto";


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
export async function processNotificationOutbox() {
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
      .select("*")
      .limit(WORKER_CONFIG.BATCH_SIZE);

    if (lockError) throw lockError;
    if (!items || items.length === 0) return { processed: 0 };

    const results = await Promise.all(items.map(item => processSingleItem(item)));

    return {
      processed: items.length,
      results
    };
  } catch (err) {
    console.error("[NOTIFICATION_WORKER_CRITICAL_FAILURE]", err);
    throw err;
  }
}

async function processSingleItem(item: any) {
  const start = new Date();
  let resultStatus: "SUCCESS" | "TRANSIENT_FAILURE" | "PERMANENT_FAILURE" = "SUCCESS";
  let safeErrorCode = null;
  let providerMessageId = null;

  try {
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

    // 3. Simular Dispatcher de Provedor (WHATSAPP)
    // Nesta etapa, implementamos a lógica de retry/backoff e auditoria
    // O envio real é delegado a um mock/provedor configurado
    const response = await mockProviderSend(item);
    
    if (response.success) {
      resultStatus = "SUCCESS";
      providerMessageId = response.id;
    } else {
      resultStatus = response.permanent ? "PERMANENT_FAILURE" : "TRANSIENT_FAILURE";
      safeErrorCode = response.errorCode;
    }

  } catch (err: any) {
    resultStatus = "TRANSIENT_FAILURE";
    safeErrorCode = "PROVIDER_TIMEOUT";
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
    await finalizeItem(item.id, "SENT", item.attempt_count + 1, null, providerMessageId);
  } else if (resultStatus === "PERMANENT_FAILURE" || item.attempt_count + 1 >= item.max_attempts) {
    await finalizeItem(item.id, "FAILED", item.attempt_count + 1, safeErrorCode);
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
 * Mock do Provedor de Notificações para Sandbox (Etapa 7.29)
 */
async function mockProviderSend(item: any) {
  // Simular latência de rede
  await new Promise(r => setTimeout(r, 500));

  // Simular falhas baseadas em metadados de teste para a suite de testes
  const testMode = item.metadata?.test_mode;
  
  if (testMode === "TIMEOUT") throw new Error("Timeout");
  if (testMode === "429") return { success: false, permanent: false, errorCode: "RATE_LIMIT" };
  if (testMode === "PERMANENT") return { success: false, permanent: true, errorCode: "INVALID_RECIPIENT" };

  return {
    success: true,
    id: `msg_${crypto.randomUUID().slice(0, 8)}`
  };
}
