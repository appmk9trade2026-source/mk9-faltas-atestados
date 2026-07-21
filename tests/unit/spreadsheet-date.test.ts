import { describe, it, expect } from "vitest";
import { parseSpreadsheetDate } from "@/lib/spreadsheet-date";

describe("parseSpreadsheetDate — leitura tolerante de células XLSX/CSV", () => {
  it("aceita string DD/MM/YYYY", () => {
    expect(parseSpreadsheetDate("21/07/2026")).toBe("2026-07-21");
    expect(parseSpreadsheetDate(" 1/7/2026 ")).toBe("2026-07-01");
  });
  it("aceita string YYYY-MM-DD", () => {
    expect(parseSpreadsheetDate("2026-07-21")).toBe("2026-07-21");
  });
  it("aceita objeto Date (fuso local, sem drift para o dia anterior)", () => {
    // Fixa em qualquer horário do dia — o resultado deve ser sempre 2026-07-21
    const d = new Date(2026, 6, 21, 23, 59, 59); // mês 6 = julho
    expect(parseSpreadsheetDate(d)).toBe("2026-07-21");
  });
  it("aceita serial numérico do Excel", () => {
    // 21/07/2026 no calendário Excel/1900 = 46224
    expect(parseSpreadsheetDate(46224)).toBe("2026-07-21");
    // Como string numérica também
    expect(parseSpreadsheetDate("46224")).toBe("2026-07-21");
  });
  it("aceita ISO com horário sem drift de timezone", () => {
    expect(parseSpreadsheetDate("2026-07-21T00:00:00.000Z")).toBe("2026-07-21");
    expect(parseSpreadsheetDate("2026-07-21T23:59:59-03:00")).toBe("2026-07-21");
  });
  it("célula vazia retorna null", () => {
    expect(parseSpreadsheetDate("")).toBeNull();
    expect(parseSpreadsheetDate(null)).toBeNull();
    expect(parseSpreadsheetDate(undefined)).toBeNull();
  });
  it("data inválida retorna INVALID", () => {
    expect(parseSpreadsheetDate("31/02/2026")).toBe("INVALID");
    expect(parseSpreadsheetDate("abc")).toBe("INVALID");
    expect(parseSpreadsheetDate(new Date("invalid"))).toBe("INVALID");
  });
  it("ano bissexto — 29/02/2024 é válido", () => {
    expect(parseSpreadsheetDate("29/02/2024")).toBe("2024-02-29");
    expect(parseSpreadsheetDate("29/02/2025")).toBe("INVALID");
  });
  it("21/07/2026 normaliza para 2026-07-21 em todas as formas de entrada", () => {
    const alvo = "2026-07-21";
    expect(parseSpreadsheetDate("21/07/2026")).toBe(alvo);
    expect(parseSpreadsheetDate("2026-07-21")).toBe(alvo);
    expect(parseSpreadsheetDate(new Date(2026, 6, 21))).toBe(alvo);
    expect(parseSpreadsheetDate(46224)).toBe(alvo);
    expect(parseSpreadsheetDate("2026-07-21T12:00:00Z")).toBe(alvo);
  });
});
