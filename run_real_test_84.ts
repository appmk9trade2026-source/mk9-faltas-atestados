import { processNotificationOutbox } from "./src/lib/health-worker.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import * as crypto from "crypto";

async function runRealTest() {
  console.log("--- TR-8-REAL-003: REAL TEST EXECUTION ---");
  
  const fingerprint = `tr-8-real-003-${Date.now()}`;
  const traceId = "TR-8-REAL-003";
  
  // 1. Criar Incidente
  const { data: incident, error: incError } = await supabaseAdmin.from("operational_health_incidents").insert({
    fingerprint,
    severity: "P0",
    status: "OPEN",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    occurrence_count: 1,
    module: "HEALTH",
    operation: "TR-8-REAL-003",
    category: "NORMALIZATION_FIX_VERIFICATION",
    sample_trace_id: crypto.randomUUID()
  }).select().single();
  
  if (incError) {
    console.error("Error creating incident:", incError);
    return;
  }
  
  // 2. Criar Alerta
  const { data: alert, error: alertError } = await supabaseAdmin.from("operational_alerts").insert({
    incident_id: incident.id,
    severity: "P0",
    status: "READY",
    fingerprint
  }).select().single();

  if (alertError) {
    console.error("Error creating alert:", alertError);
    return;
  }
  
  // 3. Criar Outbox
  const { data: outbox, error: outError } = await supabaseAdmin.from("operational_notification_outbox").insert({
    incident_id: incident.id,
    alert_id: alert.id,
    channel: "WHATSAPP",
    severity: "P0",
    fingerprint,
    idempotency_key: crypto.randomUUID(),
    status: "PENDING",
    next_attempt_at: new Date().toISOString(),
    metadata: { trace_id: traceId }
  }).select().single();
  
  if (outError) {
    console.error("Error creating outbox:", outError);
    return;
  }
  
  console.log(`Created Outbox item: ${outbox.id}`);
  
  // 4. HABILITAÇÃO CONTROLADA - Kill Switch ON
  console.log("Enabling Kill Switch for TR-8-REAL-003...");
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: true }).eq("environment", "SANDBOX");
  
  // 5. EXECUÇÃO
  console.log("Running Worker for REAL SEND...");
  const result = await processNotificationOutbox(false);
  console.log("Worker execution finished.");
  
  // 6. KILL SWITCH IMEDIATAMENTE OFF
  console.log("Disabling Kill Switch...");
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: false }).eq("environment", "SANDBOX");
  
  // 7. CAPTURAR RESULTADO REAL
  const { data: updatedOutbox } = await supabaseAdmin.from("operational_notification_outbox").select("*").eq("id", outbox.id).single();
  const { data: attempt } = await supabaseAdmin.from("operational_notification_attempts").select("*").eq("outbox_id", outbox.id).order('created_at', { ascending: false }).limit(1).single();
  
  console.log("\n--- TR-8-REAL-003 RESULTS ---");
  console.log(`Final Status: ${updatedOutbox.status}`);
  console.log(`Last Error Code: ${updatedOutbox.last_error_code}`);
  console.log(`HTTP Status: ${attempt?.safe_error_code || '200/201'}`);
  console.log(`Provider Accepted: ${updatedOutbox.status === 'SENT' ? 'YES' : 'NO'}`);
  console.log(`Provider Message ID: ${updatedOutbox.provider_message_id || 'N/A'}`);
  
  if (updatedOutbox.status === 'SENT') {
    console.log("\nTR-8-REAL-003 — HOMOLOGADO (Accepted by Provider)");
  } else {
    console.log("\nTR-8-REAL-003 — NÃO HOMOLOGADO");
    if (updatedOutbox.last_error_code === 'HTTP_400_PAYLOAD') {
      console.log("CAUSA RAIZ (NORMALIZAÇÃO) AINDA PRESENTE.");
    }
  }
}

runRealTest().catch(console.error);
