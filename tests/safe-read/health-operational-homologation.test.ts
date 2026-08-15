import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logAppError } from "../../src/lib/observability.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

describe("Operational Health - Backend Tests", () => {
  
  it("should aggregate 5 equivalent errors into a single incident with correct occurrence count", async () => {
    const traceId = crypto.randomUUID();
    const context = {
      traceId,
      module: "DATABASE",
      operation: "test_aggregation",
      stage: "EXECUTE",
      category: "DATABASE" as any,
      severity: "P2" as any
    };
    
    const error = new Error("Database timeout");
    (error as any).code = "57P01"; // Technical code

    // Trigger 5 times
    for (let i = 0; i < 5; i++) {
        await logAppError(context, error);
    }

    // A agregação é assíncrona, aguardamos para garantir persistência no DB
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verificamos se o incidente foi criado
    const { data: incident } = await supabaseAdmin
        .from("operational_health_incidents")
        .select("*")
        .eq("module", "DATABASE")
        .eq("operation", "test_aggregation")
        .maybeSingle();

    expect(incident).toBeDefined();
    expect(Number(incident.occurrence_count)).toBeGreaterThanOrEqual(5);
  });

  it("should separate different technical errors into different incidents", async () => {
    const contextA = {
      traceId: crypto.randomUUID(),
      module: "DATABASE",
      operation: "op_a",
      category: "DATABASE" as any,
      severity: "P2" as any
    };

    const contextB = {
      traceId: crypto.randomUUID(),
      module: "STORAGE",
      operation: "op_b",
      category: "STORAGE" as any,
      severity: "P2" as any
    };

    await logAppError(contextA, new Error("Error A"));
    await logAppError(contextB, new Error("Error B"));

    const { data: incidents } = await supabaseAdmin
        .from("operational_health_incidents")
        .select("*")
        .in("module", ["DATABASE", "STORAGE"]);

    expect(incidents?.length).toBeGreaterThanOrEqual(2);
  });

  it("should ignore legitimate business errors like duplicity", async () => {
    const initialCount = await getIncidentCount();
    
    const context = {
      traceId: crypto.randomUUID(),
      module: "NOVA_AUSENCIA",
      operation: "check_conflict",
      category: "DUPLICITY" as any,
      severity: "P3" as any
    };

    await logAppError(context, new Error("Já existe um lançamento de ATESTADO para este período"));

    const finalCount = await getIncidentCount();
    expect(finalCount).toBe(initialCount);
  });

  it("should ignore legitimate validation errors", async () => {
    const initialCount = await getIncidentCount();
    
    const context = {
      traceId: crypto.randomUUID(),
      module: "VALIDATION",
      operation: "form_submit",
      category: "VALIDATION" as any,
      severity: "P3" as any
    };

    await logAppError(context, new Error("Campo obrigatório"));

    const finalCount = await getIncidentCount();
    expect(finalCount).toBe(initialCount);
  });

  async function getIncidentCount() {
    const { count } = await supabaseAdmin
        .from("operational_health_incidents")
        .select("*", { count: 'exact', head: true });
    return count || 0;
  }
});
