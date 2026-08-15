import { describe, it, expect, beforeAll } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aggregateIncident } from "@/lib/health.server";
import { LogContext } from "@/lib/observability.server";
import * as crypto from "crypto";

describe("Stage 7: Notificações P0 - Lógica de Outbox", () => {
  const testFingerprint = `test-notification-${Date.now()}`;
  const mockContext: LogContext = {
    module: "NOVA_AUSENCIA",
    operation: "CREATE_ABSENCE",
    stage: "DATABASE_INSERT",
    category: "DATABASE",
    severity: "P0",
    traceId: crypto.randomUUID(),
    userId: "00000000-0000-0000-0000-000000000000"
  };

  it("TESTE A: P0 READY deve enfileirar 1 item PENDING na outbox", async () => {
    // 1. Simular erro P0 que gera incidente e alerta READY
    await aggregateIncident(mockContext, new Error("P0 Critical Failure Test"));

    // 2. Aguardar processamento da engine
    await new Promise(r => setTimeout(r, 2000));

    // 3. Verificar incidente
    const { data: incident } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("id, fingerprint")
      .eq("module", "NOVA_AUSENCIA")
      .eq("severity", "P0")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(incident).toBeDefined();

    // 4. Verificar Alerta READY
    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("id, status")
      .eq("incident_id", incident!.id)
      .eq("status", "READY")
      .single();

    expect(alert).toBeDefined();

    // 5. Verificar Outbox PENDING
    const { data: outbox } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("*")
      .eq("alert_id", alert!.id)
      .eq("status", "PENDING")
      .single();

    expect(outbox).toBeDefined();
    expect(outbox!.severity).toBe("P0");
    expect(outbox!.channel).toBe("WHATSAPP");
  });

  it("TESTE B: P1 READY não deve enfileirar itens externos", async () => {
    const p1Context: LogContext = {
      ...mockContext,
      severity: "P1",
      traceId: crypto.randomUUID()
    };

    // P1 requer persistência na engine (3 ocorrências)
    for (let i = 0; i < 3; i++) {
      await aggregateIncident(p1Context, new Error("P1 Persistence Test"));
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
    // Reutilizar o alerta READY do Teste A
    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("id, incident_id")
      .eq("severity", "P0")
      .eq("status", "READY")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const incident = { id: alert!.incident_id, fingerprint: "test-idem", severity: "P0" };
    
    // Tentativa manual de enfileirar 20 vezes o mesmo alerta/escalation
    const attempts = Array.from({ length: 20 }).map(() => {
        // Chamada interna simulada ou direta ao DB via server function (se exportada)
        // Aqui simulamos a chamada concorrente à engine que chama o enqueue
        return aggregateIncident(mockContext, new Error("Concurrency Test"));
    });

    await Promise.allSettled(attempts);
    await new Promise(r => setTimeout(r, 1000));

    const { data: outboxes } = await supabaseAdmin
      .from("operational_notification_outbox")
      .select("id")
      .eq("alert_id", alert!.id)
      .eq("status", "PENDING");

    // Deve existir apenas 1 (ou o que já existia do teste A)
    expect(outboxes?.length).toBe(1);
  });
});
