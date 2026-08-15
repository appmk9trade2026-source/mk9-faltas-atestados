import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processNotificationOutbox } from "@/lib/health-worker.server";
import * as crypto from "crypto";

describe("Stage 7: Notificações P0 - Lógica de Worker e Sandbox", () => {
  it("TESTE E: SUCESSO - PENDING -> PROCESSING -> SENT", async () => {
    const incidentId = crypto.randomUUID();
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

    const { data: outbox, error: insError } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: incidentId,
      fingerprint: "test-success",
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-success-${Date.now()}`
    }).select("id").single();

    if (insError) throw insError;

    await processNotificationOutbox();

    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, sent_at, provider_message_id")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("SENT");
    expect(final!.sent_at).toBeDefined();
  });

  it("TESTE F: TIMEOUT -> PROCESSING -> RETRY", async () => {
    const incidentId = crypto.randomUUID();
    await supabaseAdmin.from("operational_health_incidents").insert({
        id: incidentId,
        fingerprint: `test-worker-timeout-${Date.now()}`,
        module: "NOVA_AUSENCIA",
        operation: "TEST",
        severity: "P0",
        status: "OPEN",
        occurrence_count: 1,
        affected_users_count: 1
      });

    const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: incidentId,
      fingerprint: "test-timeout",
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-timeout-${Date.now()}`,
      metadata: { test_mode: "TIMEOUT" }
    }).select("id").single();

    await processNotificationOutbox();

    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, attempt_count, last_error_code")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("RETRY");
    expect(final!.last_error_code).toBe("PROVIDER_TIMEOUT");
  });

  it("TESTE K: INCIDENTE RESOLVIDO -> CANCELLED", async () => {
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

    const { data: outbox } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: resolvedId,
      fingerprint: "test-cancelled",
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-cancelled-${Date.now()}`
    }).select("id").single();

    await processNotificationOutbox();

    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, last_error_code")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("CANCELLED");
    expect(final!.last_error_code).toBe("INCIDENT_RESOLVED_BEFORE_DELIVERY");
  });
});
