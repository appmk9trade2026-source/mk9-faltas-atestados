import { processNotificationOutbox } from "./src/lib/health-worker.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import * as crypto from "crypto";

async function runDryRun() {
  console.log("--- DRY RUN TR-8-REAL-003 ---");
  
  const fingerprint = `dry-run-${Date.now()}`;
  const traceId = "TR-8-REAL-003-DRY";
  
  // 1. Criar Incidente
  const { data: incident, error: incError } = await supabaseAdmin.from("operational_health_incidents").insert({
    fingerprint,
    severity: "P0",
    status: "OPEN",
    first_occurrence: new Date().toISOString(),
    last_occurrence: new Date().toISOString(),
    occurrence_count: 1,
    title: "Dry Run Notification Normalization Test",
    technical_details: "Test for 8.4"
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
    next_attempt_at: new Date().toISOString(), // Garantir que está elegível
    metadata: { trace_id: traceId }
  }).select().single();
  
  if (outError) {
    console.error("Error creating outbox:", outError);
    return;
  }
  
  console.log(`Created Outbox item: ${outbox.id}`);
  
  // 4. Habilitar Kill Switch temporariamente
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: true }).eq("environment", "SANDBOX");
  
  console.log("Running Worker in DRY RUN mode...");
  const result = await processNotificationOutbox(true);
  console.log("Result:", JSON.stringify(result, null, 2));
  
  // 5. Restaurar Kill Switch OFF
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: false }).eq("environment", "SANDBOX");
  
  // 6. Verificar resultado
  const { data: updatedOutbox } = await supabaseAdmin.from("operational_notification_outbox").select("*").eq("id", outbox.id).single();
  console.log(`Final Status: ${updatedOutbox.status}`);
  console.log(`Last Error: ${updatedOutbox.last_error_code}`);
  
  if (updatedOutbox.status === 'SENT' && updatedOutbox.last_error_code === 'DRY_RUN_PASSED') {
    console.log("DRY RUN SUCCESSFUL.");
  } else {
    console.log("DRY RUN FAILED.");
  }
}

runDryRun().catch(console.error);
