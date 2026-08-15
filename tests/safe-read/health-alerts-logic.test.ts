import { describe, it, expect } from "vitest";
import { logAppError } from "../../src/lib/observability.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

describe("Operational Health - Alert Engine Tests (Stage 6)", () => {

  it("TESTE A & B: P1 requires persistence (3 occurrences) to become READY", async () => {
    const fingerprint = "p1_persistence_test_" + Date.now();
    const context = {
      traceId: crypto.randomUUID(),
      module: "TEST_P1",
      operation: "persistence_check",
      category: "TECHNICAL" as any,
      severity: "P1" as any
    };
    
    const error = new Error("P1 persistence test");
    (error as any).code = fingerprint;

    // 1 Ocorrência
    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 1000));
    
    const { data: alert1 } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", Buffer.from(`test_p1|persistence_check|unknown|technical|${fingerprint.toLowerCase()}`).toString('base64'))
      .maybeSingle();

    expect(alert1?.status).toBe("PENDING");

    // Mais 2 Ocorrências (Total 3)
    await logAppError(context, error);
    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 1500));

    const { data: alert2 } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("id", alert1?.id)
      .single();

    expect(alert2?.status).toBe("READY");
  }, 15000);

  it("TESTE D: P0 becomes READY immediately", async () => {
    const fingerprint = "p0_immediate_test_" + Date.now();
    const context = {
      traceId: crypto.randomUUID(),
      module: "TEST_P0",
      operation: "critical_check",
      category: "CRITICAL" as any,
      severity: "P0" as any
    };
    
    const error = new Error("P0 immediate test");
    (error as any).code = fingerprint;

    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 1000));

    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", Buffer.from(`test_p0|critical_check|unknown|critical|${fingerprint.toLowerCase()}`).toString('base64'))
      .maybeSingle();

    expect(alert?.status).toBe("READY");
  }, 10000);

  it("TESTE C: Cooldown prevents new READY status during active window", async () => {
     const fingerprint = "p0_cooldown_test_" + Date.now();
     const context = {
       traceId: crypto.randomUUID(),
       module: "TEST_COOLDOWN",
       operation: "cooldown_check",
       category: "CRITICAL" as any,
       severity: "P0" as any
     };
     
     const error = new Error("P0 cooldown test");
     (error as any).code = fingerprint;
 
     await logAppError(context, error);
     await new Promise(r => setTimeout(r, 1000));
 
     const { data: alert1 } = await supabaseAdmin
       .from("operational_alerts")
       .select("*")
       .eq("fingerprint", Buffer.from(`test_cooldown|cooldown_check|unknown|critical|${fingerprint.toLowerCase()}`).toString('base64'))
       .single();
 
     expect(alert1.status).toBe("READY");
 
     await logAppError(context, error);
     await new Promise(r => setTimeout(r, 1000));
 
     const { data: alert2 } = await supabaseAdmin
       .from("operational_alerts")
       .select("*")
       .eq("id", alert1.id)
       .single();
 
     expect(alert2.status).toBe("SUPPRESSED");
     expect(alert2.decision_reason).toBe("COOLDOWN");
  }, 15000);

  it("TESTE E & F: P2/P3 do not generate alerts", async () => {
    const context = {
      traceId: crypto.randomUUID(),
      module: "TEST_P2",
      operation: "low_sev_check",
      category: "TECHNICAL" as any,
      severity: "P2" as any
    };
    
    await logAppError(context, new Error("P2 test"));
    await new Promise(r => setTimeout(r, 1000));

    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("severity", "P2")
      .limit(1)
      .maybeSingle();

    expect(alert).toBeNull();
  }, 10000);

  it("TESTE I: Deduplication - 10 events generate 1 logical alert", async () => {
    const fingerprint = "dedup_test_" + Date.now();
    const context = {
      traceId: crypto.randomUUID(),
      module: "TEST_DEDUP",
      operation: "dedup_check",
      category: "CRITICAL" as any,
      severity: "P0" as any
    };
    
    const error = new Error("Dedup test");
    (error as any).code = fingerprint;

    for (let i = 0; i < 10; i++) {
        await logAppError(context, error);
    }
    await new Promise(r => setTimeout(r, 2000));

    const { data: alerts } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", Buffer.from(`test_dedup|dedup_check|unknown|critical|${fingerprint.toLowerCase()}`).toString('base64'));

    expect(alerts?.length).toBe(1);
    expect(Number(alerts?.[0].alert_count)).toBe(10);
  }, 20000);
});
