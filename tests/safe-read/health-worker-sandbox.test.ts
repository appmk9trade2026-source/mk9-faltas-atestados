import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processNotificationOutbox } from "@/lib/health-worker.server";
import * as crypto from "crypto";

describe("Stage 7: Notificações P0 - Lógica de Worker e Sandbox", () => {
  const incidentId = crypto.randomUUID();

  it("TESTE E: SUCESSO - PENDING -> PROCESSING -> SENT", async () => {
    // 1. Criar incidente de teste
    await supabaseAdmin.from("operational_health_incidents").insert({
      id: incidentId,
      fingerprint: `test-worker-success-${Date.now()}`,
      module: "NOVA_AUSENCIA",
      operation: "TEST",
      severity: "P0",
      status: "OPEN",
      occurrence_count: 1,
      affected_users_count: 1
    });

    // 2. Criar item na outbox
    const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: incidentId,
      fingerprint: "test-success",
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-success-${Date.now()}`
    }).select("id").single();

    // 3. Executar worker
    await processNotificationOutbox();

    // 4. Verificar status final
    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, sent_at, provider_message_id")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("SENT");
    expect(final!.sent_at).toBeDefined();
    expect(final!.provider_message_id).toMatch(/^msg_/);
  });

  it("TESTE F: TIMEOUT -> PROCESSING -> RETRY", async () => {
    // 1. Criar item na outbox com metadado de teste de timeout
    const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: incidentId,
      fingerprint: "test-timeout",
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-timeout-${Date.now()}`,
      metadata: { test_mode: "TIMEOUT" }
    }).select("id").single();

    // 2. Executar worker
    await processNotificationOutbox();

    // 3. Verificar status final
    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, attempt_count, last_error_code, next_attempt_at")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("RETRY");
    expect(final!.attempt_count).toBe(1);
    expect(final!.last_error_code).toBe("PROVIDER_TIMEOUT");
    expect(new Date(final!.next_attempt_at!)).toBeGreaterThan(new Date());
  });

  it("TESTE K: INCIDENTE RESOLVIDO -> CANCELLED", async () => {
    // 1. Criar incidente já resolvido
    const resolvedId = crypto.randomUUID();
    await supabaseAdmin.from("operational_health_incidents").insert({
      id: resolvedId,
      fingerprint: `test-cancelled-${Date.now()}`,
      module: "NOVA_AUSENCIA",
      operation: "TEST",
      severity: "P0",
      status: "RESOLVED",
      occurrence_count: 1,
      affected_users_count: 1
    });

    // 2. Criar item na outbox
    const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: resolvedId,
      fingerprint: "test-cancelled",
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-cancelled-${Date.now()}`
    }).select("id").single();

    // 3. Executar worker
    await processNotificationOutbox();

    // 4. Verificar status final
    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, last_error_code")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("CANCELLED");
    expect(final!.last_error_code).toBe("INCIDENT_RESOLVED_BEFORE_DELIVERY");
  });
});
