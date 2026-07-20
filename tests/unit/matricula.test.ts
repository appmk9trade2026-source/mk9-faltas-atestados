import { describe, it, expect } from "vitest";
import { normalizeMatricula } from "@/lib/matricula";

describe("normalizeMatricula", () => {
  it("aplica trim nas extremidades", () => {
    expect(normalizeMatricula(" 123 ")).toBe("123");
    expect(normalizeMatricula("\t ABC001\n")).toBe("ABC001");
  });

  it("converte para MAIÚSCULAS", () => {
    expect(normalizeMatricula("abc001")).toBe("ABC001");
    expect(normalizeMatricula("Abc001")).toBe("ABC001");
    expect(normalizeMatricula("ABC001")).toBe("ABC001");
  });

  it("remove espaços internos e múltiplos espaços", () => {
    expect(normalizeMatricula("ABC 001")).toBe("ABC001");
    expect(normalizeMatricula("A B  C   0 0 1")).toBe("ABC001");
    expect(normalizeMatricula("  a b c 0 0 1  ")).toBe("ABC001");
  });

  it("preserva zeros à esquerda", () => {
    expect(normalizeMatricula("00123")).toBe("00123");
    expect(normalizeMatricula(" 000123 ")).toBe("000123");
    expect(normalizeMatricula("abc00007")).toBe("ABC00007");
  });

  it("considera diferentes formatações como a mesma matrícula", () => {
    const a = normalizeMatricula("ABC001");
    const b = normalizeMatricula("abc001");
    const c = normalizeMatricula(" ABC001 ");
    const d = normalizeMatricula("Abc 001");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(c).toBe(d);
  });

  it("aceita null/undefined retornando string vazia", () => {
    expect(normalizeMatricula(null)).toBe("");
    expect(normalizeMatricula(undefined)).toBe("");
    expect(normalizeMatricula("")).toBe("");
    expect(normalizeMatricula("   ")).toBe("");
  });

  it("não altera caracteres válidos (letras/dígitos/símbolos)", () => {
    expect(normalizeMatricula("mat-2025/001")).toBe("MAT-2025/001");
    expect(normalizeMatricula(" mat.2025_001 ")).toBe("MAT.2025_001");
  });
});
