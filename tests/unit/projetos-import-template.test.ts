import { describe, it, expect } from "vitest";
import { PROJETOS_TEMPLATE_COLUMNS } from "@/lib/projetos-template";

describe("Modelo de importação de Projetos — 6 colunas exatas", () => {
  it("possui exatamente 6 colunas", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS).toHaveLength(6);
  });

  it("está na ordem correta: Projeto, Empresa, Código, Descrição, Status, Data cadastro", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS).toEqual([
      "Projeto",
      "Empresa",
      "Código",
      "Descrição",
      "Status",
      "Data cadastro",
    ]);
  });

  it("não contém CNPJ", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => /cnpj/i.test(c))).toBe(false);
  });

  it("não contém campos técnicos legados", () => {
    for (const banned of ["data_inicio", "data_fim", "observacoes", "empresa_id", "projeto_id", "codigo_protocolo"]) {
      expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => c.toLowerCase() === banned)).toBe(false);
    }
  });
});
