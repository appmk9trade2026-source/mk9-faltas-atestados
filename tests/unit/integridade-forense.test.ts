import { test, expect, describe } from "vitest";
import { calculateIntegrityHash } from "../../src/lib/integridade-forense.server";

describe("Forense: Determinismo do Hash (Etapa 1)", () => {
  const baseData = {
    colaborador_id: "7c0f865d-95ac-4582-8e11-c6cf641e1bba",
    data_inicio: "2026-08-06",
    data_fim: "2026-08-07",
    tipo: "ATESTADO",
    motivo: "Gripe forte",
    empresa_id: "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1",
    projeto_id: "p1p1p1p1-p1p1-p1p1-p1p1-p1p1p1p1p1p1",
  };

  test("mesmos dados geram o mesmo hash", () => {
    const h1 = calculateIntegrityHash(baseData);
    const h2 = calculateIntegrityHash({ ...baseData });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  test("alteração de campo relevante muda o hash", () => {
    const h1 = calculateIntegrityHash(baseData);
    const h2 = calculateIntegrityHash({ ...baseData, motivo: "Gripe muito forte" });
    expect(h1).not.toBe(h2);
  });

  test("alteração de campo excluído não muda o hash", () => {
    const h1 = calculateIntegrityHash(baseData);
    const h2 = calculateIntegrityHash({ ...baseData, campo_irrelevante: "ignore-me" } as any);
    expect(h1).toBe(h2);
  });

  test("ordem de propriedades JSON não altera o resultado (Canonicalization)", () => {
    const h1 = calculateIntegrityHash({
      colaborador_id: "A",
      motivo: "B"
    });
    const h2 = calculateIntegrityHash({
      motivo: "B",
      colaborador_id: "A"
    });
    expect(h1).toBe(h2);
  });

  test("valores null/undefined são normalizados de forma estável", () => {
    const h1 = calculateIntegrityHash({ ...baseData, motivo: null });
    const h2 = calculateIntegrityHash({ ...baseData, motivo: undefined });
    expect(h1).toBe(h2);
  });
});

describe("Forense: Cadeia de Custódia (Etapa 2)", () => {
  test("cadeia vincula hash_anterior corretamente", () => {
    const data1 = { colaborador_id: "user1", motivo: "v1" };
    const hash1 = calculateIntegrityHash(data1);
    
    const data2 = { colaborador_id: "user1", motivo: "v2" };
    const hash2 = calculateIntegrityHash(data2, hash1);
    
    expect(hash2).not.toBe(hash1);
    
    // Simular recalculo para validação
    const hash2Check = calculateIntegrityHash(data2, hash1);
    expect(hash2).toBe(hash2Check);
  });
});
