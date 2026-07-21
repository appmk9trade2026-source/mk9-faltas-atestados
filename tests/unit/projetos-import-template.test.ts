import { describe, it, expect } from "vitest";
import { PROJETOS_TEMPLATE_COLUMNS } from "@/lib/projetos-template";

describe("Modelo de importação de Projetos — 2 colunas exatas", () => {
  it("possui exatamente 2 colunas", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS).toHaveLength(2);
  });

  it("está na ordem correta: Projeto, Empresa", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS).toEqual(["Projeto", "Empresa"]);
  });

  it("não contém coluna Código — código interno é gerado pelo sistema", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => /c[óo]digo/i.test(c))).toBe(false);
  });

  it("não contém coluna Data — data de cadastro é gerada automaticamente", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => /data/i.test(c))).toBe(false);
  });

  it("não contém coluna Descrição — 'NOVO PROJETO' é atribuído pelo sistema", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => /descri[cç][aã]o/i.test(c))).toBe(false);
  });

  it("não contém coluna Status — ATIVO é atribuído pelo sistema", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => /status/i.test(c))).toBe(false);
  });

  it("não contém CNPJ", () => {
    expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => /cnpj/i.test(c))).toBe(false);
  });

  it("não contém campos técnicos legados", () => {
    for (const banned of ["data_inicio", "data_fim", "data_cadastro", "observacoes", "empresa_id", "projeto_id", "codigo_protocolo", "codigo_interno"]) {
      expect(PROJETOS_TEMPLATE_COLUMNS.some((c) => c.toLowerCase() === banned)).toBe(false);
    }
  });
});
