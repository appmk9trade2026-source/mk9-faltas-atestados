import { describe, it, expect } from "vitest";
import { normalizeEvolutionNumber } from "../../src/lib/evolution-api.server";

describe("Evolution API Adapter - Contract & Normalization", () => {
  it("should remove '+' and non-digit characters from telephone number", () => {
    expect(normalizeEvolutionNumber("+5511999999999")).toBe("5511999999999");
    expect(normalizeEvolutionNumber("5511999999999")).toBe("5511999999999");
    expect(normalizeEvolutionNumber("+55 (11) 99999-9999")).toBe("5511999999999");
  });

  it("should handle empty or malformed strings by returning empty string or digits only", () => {
    expect(normalizeEvolutionNumber("")).toBe("");
    expect(normalizeEvolutionNumber("abc123def")).toBe("123");
  });
});
