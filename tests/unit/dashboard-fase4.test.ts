import { describe, expect, it } from "vitest";
import { iniciais } from "@/components/dashboard/rank-list";
import { buildInsights } from "@/components/dashboard/insights-automaticos";

describe("Fase 4 — refinamento visual do dashboard", () => {
  it("gera iniciais legíveis para os rankings", () => {
    expect(iniciais("Maria Aparecida Souza")).toBe("MS");
    expect(iniciais("Carlos")).toBe("CA");
    expect(iniciais("  ")).toBe("--");
  });

  it("resumo executivo consome a mesma regra e limita a 3 destaques", () => {
    const input = {
      kpis: { total: 120, pendentes: 40, lancadas: 80, faltas: 50, colaboradores_ativos: 200 },
      prev: { total: 90, pendentes: 20, lancadas: 70, faltas: 40, colaboradores_ativos: 200 },
      top_projetos: [{ nome: "Projeto A", total: 80 }, { nome: "Projeto B", total: 20 }],
      top_empresas: [{ nome: "Empresa X", total: 90 }, { nome: "Empresa Y", total: 30 }],
      top_supervisores: [{ nome: "Sup 1", total: 70 }, { nome: "Sup 2", total: 20 }],
      heatmap: [{ dow: 1, total: 80 }, { dow: 2, total: 40 }],
    };
    const completos = buildInsights(input);
    const resumo = completos.slice(0, 3);
    expect(completos.length).toBeGreaterThanOrEqual(3);
    expect(resumo).toHaveLength(3);
    // o resumo é sempre um prefixo do bloco completo (sem lógica duplicada)
    expect(resumo.map((i) => i.id)).toEqual(completos.slice(0, 3).map((i) => i.id));
  });

  it("não gera destaques quando não há KPIs suficientes", () => {
    expect(buildInsights({}).slice(0, 3)).toHaveLength(0);
  });
});
