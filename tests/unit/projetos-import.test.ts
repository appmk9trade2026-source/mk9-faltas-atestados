import { describe, it, expect } from "vitest";

// Reimplementa localmente as regras de normalização usadas no server para
// garantir estabilidade contratual (mantém em sincronia com projetos.functions.ts).

function normalizeCnpj(v: string) {
  return (v ?? "").replace(/\D+/g, "");
}
function normalizeCodigo(v: string) {
  return (v ?? "").trim().toUpperCase();
}
function normalizeStatus(v: string): "ATIVO" | "INATIVO" | null {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "ATIVO" || s === "1" || s === "ATIVA" || s === "TRUE") return "ATIVO";
  if (s === "INATIVO" || s === "0" || s === "INATIVA" || s === "FALSE") return "INATIVO";
  return null;
}
function validCnpj(cnpj: string) {
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string, pesos: number[]) => {
    const sum = base.split("").reduce((a, d, i) => a + Number(d) * pesos[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const d1 = calc(cnpj.slice(0, 12), p1);
  const d2 = calc(cnpj.slice(0, 12) + String(d1), p2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

describe("Importação de Projetos — normalização", () => {
  it("remove máscara de CNPJ", () => {
    expect(normalizeCnpj("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizeCnpj(" 12345678000190 ")).toBe("12345678000190");
  });
  it("valida dígitos verificadores do CNPJ", () => {
    expect(validCnpj("11222333000181")).toBe(true);
    expect(validCnpj("11111111111111")).toBe(false);
    expect(validCnpj("12345678000199")).toBe(false);
  });
  it("normaliza código de projeto para maiúsculas sem espaços", () => {
    expect(normalizeCodigo(" armt ")).toBe("ARMT");
    expect(normalizeCodigo("proj1")).toBe("PROJ1");
  });
  it("aceita status ATIVO/INATIVO/1/0 e rejeita outros", () => {
    expect(normalizeStatus("ATIVO")).toBe("ATIVO");
    expect(normalizeStatus(" ativo ")).toBe("ATIVO");
    expect(normalizeStatus("1")).toBe("ATIVO");
    expect(normalizeStatus("INATIVO")).toBe("INATIVO");
    expect(normalizeStatus("0")).toBe("INATIVO");
    expect(normalizeStatus("EXCLUIDO")).toBeNull();
    expect(normalizeStatus("")).toBeNull();
  });
});

describe("Importação de Projetos — módulo server", () => {
  it("exporta preview e confirm", async () => {
    const mod = await import("@/lib/projetos.functions");
    expect(typeof mod.previewProjetosImport).toBe("function");
    expect(typeof mod.confirmProjetosImport).toBe("function");
  });
});
