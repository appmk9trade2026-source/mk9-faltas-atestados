import { describe, it, expect } from "vitest";
import { logAppError } from "../../src/lib/observability.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

describe("Operational Health - Alert Engine Tests (Stage 6)", () => {

  it("TESTE A & B: P1 requires persistence (3 occurrences) to become READY", async () => {
    const fingerprint = "p1_persist_" + Math.random().toString(36).substring(7);
    const context = {
      traceId: crypto.randomUUID(),
      module: "TEST_P1",
      operation: "persistence_check",
      category: "TECHNICAL" as any,
      severity: "P1" as any
    };
    
    const error = new Error("P1 persistence test");
    (error as any).code = fingerprint;

    // 1 Ocorrência -> PENDING
    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 2000));
    
    const encodedFingerprint = Buffer.from(`test_p1|persistence_check|unknown|technical|${fingerprint.toLowerCase()}`).toString('base64');
    const { data: alert1 } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", encodedFingerprint)
      .maybeSingle();

    expect(alert1?.status).toBe("PENDING");

    // Total 3 Ocorrências -> READY
    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 1000));
    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 2000));

    const { data: alert2 } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("id", alert1?.id)
      .single();

    expect(alert2?.status).toBe("READY");
  }, 30000);

  it("TESTE D: P0 becomes READY immediately", async () => {
    const fingerprint = "p0_imm_" + Math.random().toString(36).substring(7);
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
    await new Promise(r => setTimeout(r, 2500));

    const encodedFingerprint = Buffer.from(`test_p0|critical_check|unknown|critical|${fingerprint.toLowerCase()}`).toString('base64');
    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", encodedFingerprint)
      .maybeSingle();

    expect(alert?.status).toBe("READY");
  }, 20000);

  it("TESTE E & F: P2/P3 do not generate alerts", async () => {
    const fingerprint = "p2_none_" + Math.random().toString(36).substring(7);
    const context = {
      traceId: crypto.randomUUID(),
      module: "TEST_P2",
      operation: "low_sev_check",
      category: "TECHNICAL" as any,
      severity: "P2" as any
    };
    
    const error = new Error("P2 test");
    (error as any).code = fingerprint;

    await logAppError(context, error);
    await new Promise(r => setTimeout(r, 2000));

    const encodedFingerprint = Buffer.from(`test_p2|low_sev_check|unknown|technical|${fingerprint.toLowerCase()}`).toString('base64');
    const { data: alert } = await supabaseAdmin
      .from("operational_alerts")
      .select("*")
      .eq("fingerprint", encodedFingerprint)
      .maybeSingle();

    expect(alert).toBeNull();
  }, 20000);
});
