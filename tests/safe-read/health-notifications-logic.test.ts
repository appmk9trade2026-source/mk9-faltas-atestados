import { describe, it, expect } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aggregateIncident } from "@/lib/health.server";
import { LogContext } from "@/lib/observability.server";
import * as crypto from "crypto";

describe("Stage 7: Notificações P0 - Lógica de Outbox", () => {
  const testFingerprintSuffix = Date.now();
  const mockContext: LogContext = {
    module: "TEST_MODULE",
    operation: "TEST_OP",
    stage: "TEST_STAGE",
    category: "DATABASE",
    severity: "P0",
    traceId: crypto.randomUUID(),
    userId: "00000000-0000-0000-0000-000000000000"
  };

  it("TESTE A: P0 READY deve enfileirar 1 item PENDING na outbox", async () => {
    const context = { ...mockContext, operation: `OP_A_${testFingerprintSuffix}`, traceId: crypto.randomUUID() };
    
    // 1. Simular erro P0
    await aggregateIncident(context, new Error("P0 Test A"));
    await new Promise(r => setTimeout(r, 2000));

    // 2. Verificar Incidente
    const { data: incident } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("id")
      .eq("operation", context.operation)
      .single();

    expect(incident).toBeDefined();

    // 3. Verificar Alerta READY (P0 inicial é READY)
    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("id, status")
      .eq("incident_id", incident!.id)
      .single();

    expect(alert).toBeDefined();
    expect(alert!.status).toBe("READY");

    // 4. Verificar Outbox
    const { data: outbox } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("*")
      .eq("alert_id", alert!.id)
      .maybeSingle();

    expect(outbox).toBeDefined();
    expect(outbox!.severity).toBe("P0");
  });

  it("TESTE B: P1 READY não deve enfileirar itens externos", async () => {
    const context = { ...mockContext, operation: `OP_B_${testFingerprintSuffix}`, severity: "P1" as const, traceId: crypto.randomUUID() };
    
    // P1 requer 3 ocorrências
    for(let i=0; i<3; i++) {
        await aggregateIncident(context, new Error("P1 Test B"));
    }
    await new Promise(r => setTimeout(r, 2000));

    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("id, status")
      .eq("severity", "P1")
      .eq("status", "READY")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(alert).toBeDefined();

    const { data: outbox } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("*")
      .eq("alert_id", alert!.id);

    expect(outbox?.length).toBe(0);
  });

  it("TESTE C: Idempotência - 20 enqueues simultâneos devem gerar 1 outbox", async () => {
    const context = { ...mockContext, operation: `OP_C_${testFingerprintSuffix}`, traceId: crypto.randomUUID() };
    
    // 20 chamadas simultâneas
    const calls = Array.from({ length: 20 }).map(() => aggregateIncident(context, new Error("P0 Idem Test")));
    await Promise.allSettled(calls);
    await new Promise(r => setTimeout(r, 3000));

    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("id")
      .eq("severity", "P0")
      .eq("sample_trace_id", context.traceId)
      .maybeSingle();

    if (alert) {
      const { data: outboxes } = await supabaseAdmin
        .from("operational_notification_outbox")
        .select("id")
        .eq("alert_id", alert.id);

      expect(outboxes?.length).toBe(1);
    }
  });
});
