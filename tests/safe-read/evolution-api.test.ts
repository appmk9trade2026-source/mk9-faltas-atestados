import { describe, it, expect } from "vitest";
import { normalizeEvolutionNumber } from "../../src/lib/evolution-api.server";

describe("Evolution API Normalization", () => {
  it("should remove + and non-digits", () => {
    expect(normalizeEvolutionNumber("+5511999999999")).toBe("5511999999999");
    expect(normalizeEvolutionNumber("55 11 99999-9999")).toBe("5511999999999");
    expect(normalizeEvolutionNumber("+55 (11) 99999-9999")).toBe("5511999999999");
  });

  it("should handle already normalized numbers", () => {
    expect(normalizeEvolutionNumber("5511999999999")).toBe("5511999999999");
  });

  it("should return empty string for non-numeric input", () => {
    expect(normalizeEvolutionNumber("abc")).toBe("");
  });
});
