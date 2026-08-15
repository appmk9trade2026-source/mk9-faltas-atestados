import { processNotificationOutbox } from "./src/lib/health-worker.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function runDryRun() {
  console.log("--- DRY RUN TR-8-REAL-003 ---");
  
  // 1. Garantir que o Kill Switch esteja OFF para o Dry Run (Fail-Closed logic)
  // No worker.server.ts:68, se kill_switch_enabled for false, ele retorna SUPPRESSED.
  // Mas para o teste manual 8.4, o usuário quer ver o fluxo de normalização no log ou comportamento.
  // O processNotificationOutbox(true) marca como SENT se o dryRun for true.
  
  // Criar fixture para o Dry Run
  const fingerprint = `dry-run-${Date.now()}`;
  const traceId = "TR-8-REAL-003-DRY";
  
  const { data: incident } = await supabaseAdmin.from("operational_health_incidents").insert({
    fingerprint,
    severity: "P0",
    status: "OPEN",
    first_occurrence: new Date().toISOString(),
    last_occurrence: new Date().toISOString(),
    occurrence_count: 1,
    title: "Dry Run Notification Normalization Test",
    technical_details: "Test for 8.4"
  }).select().single();
  
  const { data: alert } = await supabaseAdmin.from("operational_alerts").insert({
    incident_id: incident.id,
    severity: "P0",
    status: "READY",
    fingerprint
  }).select().single();
  
  const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
    incident_id: incident.id,
    alert_id: alert.id,
    channel: "WHATSAPP",
    severity: "P0",
    fingerprint,
    idempotency_key: crypto.randomUUID(),
    status: "PENDING",
    metadata: { trace_id: traceId }
  }).select().single();
  
  console.log(`Created Outbox item: ${outbox.id}`);
  
  // Habilitar Kill Switch temporariamente para o Dry Run não ser suprimido
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: true }).eq("environment", "SANDBOX");
  
  console.log("Running Worker in DRY RUN mode...");
  const result = await processNotificationOutbox(true);
  console.log("Result:", JSON.stringify(result, null, 2));
  
  // Restaurar Kill Switch OFF
  await supabaseAdmin.from("operational_notification_config").update({ kill_switch_enabled: false }).eq("environment", "SANDBOX");
  
  // Verificar resultado no banco
  const { data: updatedOutbox } = await supabaseAdmin.from("operational_notification_outbox").select("*").eq("id", outbox.id).single();
  console.log(`Final Status (should be SENT): ${updatedOutbox.status}`);
  console.log(`Last Error (should be DRY_RUN_PASSED): ${updatedOutbox.last_error_code}`);
}

runDryRun().catch(console.error);
