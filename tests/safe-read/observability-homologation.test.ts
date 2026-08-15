import { describe, it, expect, vi } from "vitest";
import { logAppError } from "../../src/lib/observability.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

// Mock do supabaseAdmin para testar a lógica do logAppError sem persistir no banco real
vi.mock("../../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ data: null, error: null })
  }
}));

describe("Observability Homologation Tests", () => {
  it("should use and persist the provided traceId", async () => {
    const traceId = "123e4567-e89b-12d3-a456-426614174000";
    const context = {
      traceId,
      module: "homologation",
      operation: "test_persist",
      category: "UNKNOWN" as any,
      severity: "P3" as any
    };

    await logAppError(context, new Error("Test error"));

    const insertCall = vi.mocked(supabaseAdmin.from("audit_logs").insert).mock.calls[0][0] as any;
    expect(insertCall.trace_id).toBe(traceId);
  });

  it("should enforce PII redaction in metadata before calling DB", async () => {
    const traceId = crypto.randomUUID();
    const context = {
      traceId,
      module: "homologation",
      operation: "test_pii",
      category: "VALIDATION" as any,
      severity: "P3" as any,
      metadata: {
        token: "sb_secret_123",
        cid: "M54.5",
        diagnostico: "Dor lombar",
        safe_field: "public_value"
      }
    };

    await logAppError(context, new Error("Test error"));

    const insertCall = vi.mocked(supabaseAdmin.from("audit_logs").insert).mock.calls[1][0] as any;
    const obs = JSON.parse(insertCall.observacoes);
    
    expect(obs.metadata.token).toBe("[REDACTED]");
    expect(obs.metadata.cid).toBe("[REDACTED]");
    expect(obs.metadata.diagnostico).toBe("[REDACTED]");
    expect(obs.metadata.safe_field).toBe("public_value");
  });

  it("should return a user-friendly message for P0/P1 errors", async () => {
    const context = {
      traceId: crypto.randomUUID(),
      module: "homologation",
      operation: "test_friendly",
      category: "DATABASE" as any,
      severity: "P1" as any
    };

    const result = await logAppError(context, new Error("Critical DB timeout at 10.0.0.5"));
    expect(result.message).toBe("Não foi possível concluir a operação agora.");
    expect(result.ok).toBe(false);
  });
});
