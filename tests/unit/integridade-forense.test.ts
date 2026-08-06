import { describe, it, expect } from "vitest";
import { calculateIntegrityHash } from "@/lib/integridade-forense.server";

describe("Auditoria Forense - Integridade de Dados", () => {
  it("deve gerar hashes consistentes para o mesmo payload", () => {
    const payload = {
      colaborador_id: "7c0f865d-95ac-4582-8e11-c6cf641e1bba",
      data_inicio: "2026-08-01",
      data_fim: "2026-08-05",
      tipo: "ATESTADO",
      motivo: "Consulta médica",
      empresa_id: "e1",
      projeto_id: "p1"
    };

    const hash1 = calculateIntegrityHash(payload);
    const hash2 = calculateIntegrityHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it("deve gerar hashes diferentes para payloads diferentes", () => {
    const p1 = {
      colaborador_id: "c1",
      data_inicio: "2026-08-01",
      tipo: "FALTA",
      empresa_id: "e1"
    };

    const p2 = {
      ...p1,
      tipo: "ATESTADO"
    };

    const h1 = calculateIntegrityHash(p1);
    const h2 = calculateIntegrityHash(p2);

    expect(h1).not.toBe(h2);
  });

  it("deve encadear hashes corretamente (cadeia de custódia)", () => {
    const initialPayload = { id: "a1", tipo: "FALTA" };
    const h1 = calculateIntegrityHash(initialPayload, null);

    const updatedPayload = { id: "a1", tipo: "ATESTADO" };
    const h2 = calculateIntegrityHash(updatedPayload, h1);

    expect(h1).not.toBe(h2);
    expect(h2).toBe(calculateIntegrityHash(updatedPayload, h1));
  });
});
