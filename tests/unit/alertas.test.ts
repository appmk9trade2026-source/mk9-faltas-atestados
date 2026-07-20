// Testes leves da Central de Alertas — validam transições e utilitários.
import { describe, expect, it } from "vitest";

function formatBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

describe("formatBadge", () => {
  it("retorna string vazia quando não há alertas", () => {
    expect(formatBadge(0)).toBe("");
    expect(formatBadge(-1)).toBe("");
  });
  it("mostra o número quando cabe em 1-99", () => {
    expect(formatBadge(1)).toBe("1");
    expect(formatBadge(99)).toBe("99");
  });
  it("trunca acima de 99", () => {
    expect(formatBadge(100)).toBe("99+");
    expect(formatBadge(1234)).toBe("99+");
  });
});

// Matriz canônica de transições — precisa espelhar o backend.
const TRANSICOES: Record<string, string[]> = {
  NOVO: ["LIDO", "EM_TRATAMENTO", "DISPENSADO", "RESOLVIDO"],
  LIDO: ["EM_TRATAMENTO", "DISPENSADO", "RESOLVIDO"],
  EM_TRATAMENTO: ["RESOLVIDO", "DISPENSADO"],
  RESOLVIDO: ["NOVO", "EM_TRATAMENTO"],
  DISPENSADO: ["NOVO", "EM_TRATAMENTO"],
};

describe("Transições de status", () => {
  it("permite NOVO → LIDO", () => {
    expect(TRANSICOES.NOVO).toContain("LIDO");
  });
  it("permite RESOLVIDO → NOVO (reabertura)", () => {
    expect(TRANSICOES.RESOLVIDO).toContain("NOVO");
  });
  it("bloqueia RESOLVIDO → LIDO", () => {
    expect(TRANSICOES.RESOLVIDO).not.toContain("LIDO");
  });
  it("bloqueia EM_TRATAMENTO → NOVO", () => {
    expect(TRANSICOES.EM_TRATAMENTO).not.toContain("NOVO");
  });
});
