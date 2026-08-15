import { processNotificationOutbox } from "./src/lib/health-worker.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function main() {
  console.log("--- FASE A: DRY RUN TR-8-REAL-004 ---");
  
  // 1. Criar Fixture de Teste
  const traceId = "TR-8-REAL-004-DRY";
  const { data: incident, error: incError } = await supabaseAdmin
    .from("operational_health_incidents")
    .insert({
      fingerprint: "TEST_FINGERPRINT_85",
      severity: "P0",
      status: "OPEN",
      module: "INFRA",
      operation: "HEALTH_CHECK",
      category: "SYSTEM",
      metadata: { trace_id: traceId }
    })
    .select()
    .single();

  if (incError) throw incError;

  const { data: alert, error: alertError } = await supabaseAdmin
    .from("operational_alerts")
    .insert({
      incident_id: incident.id,
      severity: "P0",
      status: "READY"
    })
    .select()
    .single();

  if (alertError) throw alertError;

  const { data: outbox, error: outError } = await supabaseAdmin
    .from("operational_notification_outbox")
    .insert({
      incident_id: incident.id,
      alert_id: alert.id,
      channel: "WHATSAPP",
      severity: "P0",
      fingerprint: "TEST_FINGERPRINT_85",
      status: "PENDING",
      idempotency_key: `idemp-${traceId}-${Date.now()}`,
      metadata: { trace_id: traceId },
      next_attempt_at: new Date().toISOString()
    })
    .select()
    .single();

  if (outError) throw outError;

  // 2. Executar Dry Run
  console.log(`Fixture criada: Incident=${incident.id}, Outbox=${outbox.id}`);
  const result = await processNotificationOutbox(true);
  
  console.log("Resultado Dry Run:", JSON.stringify(result, null, 2));

  // 3. Verificar status final do item na outbox
  const { data: finalItem } = await supabaseAdmin
    .from("operational_notification_outbox")
    .select("status, last_error_code")
    .eq("id", outbox.id)
    .single();

  console.log("Status final do item:", finalItem);
}

main().catch(console.error);
