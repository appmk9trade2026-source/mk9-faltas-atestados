import { describe, it, expect } from "vitest";
import { getSystemHealth, listHealthIncidents } from "../../src/lib/health.functions";

describe("Operational Health - UI Integration Tests", () => {
  
  it("should return consolidated health with correct modules", async () => {
    const health = await getSystemHealth({});
    
    expect(health).toBeDefined();
    expect(health.overall_status).toBeDefined();
    expect(health.modules).toBeDefined();
    
    const requiredModules = ["DATABASE", "OBSERVABILITY", "NOVA_AUSENCIA", "DUPLICIDADE", "DASHBOARD", "PERMISSOES", "STORAGE"];
    requiredModules.forEach(mod => {
      expect(health.modules[mod]).toBeDefined();
    });
  });

  it("should filter incidents by traceId", async () => {
    // Primeiro listamos para pegar um traceId real se existir
    const all = await listHealthIncidents({ data: { status: "ALL", period: "30d" } });
    
    if (all.incidents.length > 0) {
      const sample = all.incidents[0];
      if (sample.sample_trace_id) {
        const filtered = await listHealthIncidents({ 
          data: { 
            status: "ALL", 
            period: "30d", 
            traceId: sample.sample_trace_id 
          } 
        });
        expect(filtered.incidents.length).toBeGreaterThanOrEqual(1);
        expect(filtered.incidents[0].id).toBe(sample.id);
      }
    }
  });

  it("should handle empty filters without crashing", async () => {
    const result = await listHealthIncidents({ data: {} });
    expect(result.incidents).toBeDefined();
    expect(Array.isArray(result.incidents)).toBe(true);
  });
});
