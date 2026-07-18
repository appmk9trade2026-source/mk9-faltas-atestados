import { describe, it, expect } from "vitest";
import { safeCsvCell } from "@/lib/bi-export";

describe("safeCsvCell — CSV Injection guard", () => {
  it("escapa fórmulas iniciadas por =, +, -, @", () => {
    expect(safeCsvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(safeCsvCell("+cmd")).toBe('"\'+cmd"');
    expect(safeCsvCell("-1+1")).toBe('"\'-1+1"');
    expect(safeCsvCell("@import")).toBe('"\'@import"');
  });

  it("mantém strings normais entre aspas", () => {
    expect(safeCsvCell("Empresa RG")).toBe('"Empresa RG"');
    expect(safeCsvCell(123)).toBe('"123"');
  });

  it("duplica aspas internas", () => {
    expect(safeCsvCell('linha "com aspas"')).toBe('"linha ""com aspas"""');
  });

  it("trata null/undefined como vazio", () => {
    expect(safeCsvCell(null)).toBe("");
    expect(safeCsvCell(undefined)).toBe("");
  });

  it("escapa mesmo com espaço à esquerda", () => {
    expect(safeCsvCell("   =EVIL()")).toBe('"\'   =EVIL()"');
  });
});
