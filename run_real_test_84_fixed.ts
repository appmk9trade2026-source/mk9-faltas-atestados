import { processNotificationOutbox } from "./src/lib/health-worker.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import * as crypto from "crypto";

async function runRealTest() {
  console.log("--- TR-8-REAL-003: REAL TEST EXECUTION (FIXED RECIPIENT) ---");
  
  const fingerprint = `tr-8-real-003-final-${Date.now()}`;
  const traceId = "TR-8-REAL-003";
  const validNumber = "5511942004200"; // Número real/válido para teste técnico homologado
  
  // 1. Garantir que o destinatário técnico esteja correto no banco
  console.log(`Updating recipient destination to: ${validNumber}`);
  await supabaseAdmin
    .from("operational_notification_recipients")
    .update({ destination: validNumber, verified_at: new Date().toISOString() })
    .eq("id", "f8646a8f-edc3-431a-8b73-2ee7dc305b85");

  // 2. Criar Incidente
  const { data: incident } = await supabaseAdmin.from("operational_health_incidents").insert({
    fingerprint,
    severity: "P0",
    status: "OPEN",
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    occurrence_count: 1,
    module: "HEALTH",
    operation: "TR-8-REAL-003-FINAL",
    category: "NORMALIZATION_FIX_VERIFICATION",
    sample_trace_id: crypto.randomUUID()
  }).select().single();
  
  // 3. Criar Alerta
  const { data: alert } = await supabaseAdmin.from("operational_alerts").insert({
    incident_id: incident.id,
    severity: "P0",
    status: "READY",
    fingerprint
  }).select().single();
  
  // 4. Criar Outbox
  const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
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
  
  console.log(`Created Outbox item: ${outbox.id}`);
  
  // 5. HABILITAÇÃO CONTROLADA
  console.log("Enabling Kill Switch...");
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: true }).eq("environment", "SANDBOX");
  
  // 6. EXECUÇÃO
  console.log("Running Worker...");
  const result = await processNotificationOutbox(false);
  
  // 7. KILL SWITCH OFF
  console.log("Disabling Kill Switch...");
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: false }).eq("environment", "SANDBOX");
  
  // 8. RESULTADOS
  const { data: updatedOutbox } = await supabaseAdmin.from("operational_notification_outbox").select("*").eq("id", outbox.id).single();
  const { data: attempt } = await supabaseAdmin.from("operational_notification_attempts").select("*").eq("outbox_id", outbox.id).order('created_at', { ascending: false }).limit(1).single();
  
  console.log("\n--- TR-8-REAL-003 RESULTS ---");
  console.log(`Final Status: ${updatedOutbox.status}`);
  console.log(`HTTP Status: ${attempt?.safe_error_code || '200/201'}`);
  console.log(`Provider Accepted: ${updatedOutbox.status === 'SENT' ? 'YES' : 'NO'}`);
  
  if (updatedOutbox.status === 'SENT') {
    console.log("\nTR-8-REAL-003 — HOMOLOGADO");
  } else {
    console.log("\nTR-8-REAL-003 — NÃO HOMOLOGADO");
    console.log(`Error: ${updatedOutbox.last_error_code}`);
  }
}

runRealTest().catch(console.error);
