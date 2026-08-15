import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processNotificationOutbox } from "@/lib/health-worker.server";
import * as crypto from "crypto";

describe("Stage 7: Notificações P0 - Lógica de Worker e Sandbox", () => {
  it("TESTE E: SUCESSO - PENDING -> PROCESSING -> SENT", async () => {
    // 1. Buscar um incidente real que já existe no DB (para satisfazer FK)
    const { data: realIncident } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("id, fingerprint")
      .limit(1)
      .single();

    if (!realIncident) throw new Error("Não há incidentes no DB para testar worker.");

    // 2. Criar item na outbox vinculado a esse incidente
    const finger = `test-worker-success-${Date.now()}`;
    const { data: outbox, error: insError } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: realIncident.id,
      fingerprint: finger,
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
    const { data: realIncident } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("id, fingerprint")
      .limit(1)
      .single();

    const finger = `test-worker-timeout-${Date.now()}`;
    const { data: outbox, error: insError } = await supabaseAdmin.from("operational_notification_outbox").insert({
      incident_id: realIncident!.id,
      fingerprint: finger,
      severity: "P0",
      channel: "WHATSAPP",
      status: "PENDING",
      idempotency_key: `idem-timeout-${Date.now()}`,
      metadata: { test_mode: "TIMEOUT" }
    }).select("id").single();

    if (insError) throw insError;

    await processNotificationOutbox();

    const { data: final } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("status, attempt_count, last_error_code")
      .eq("id", outbox!.id)
      .single();

    expect(final!.status).toBe("RETRY");
    expect(final!.last_error_code).toBe("PROVIDER_TIMEOUT");
  });
});
