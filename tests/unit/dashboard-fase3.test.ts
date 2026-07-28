import { describe, it, expect } from "vitest";
import { buildInsights } from "@/components/dashboard/insights-automaticos";

const base = {
  kpis: { total: 112, pendentes: 20, lancadas: 92, faltas: 60, colaboradores_ativos: 400 },
  prev: { total: 100, pendentes: 10, lancadas: 90, faltas: 50, colaboradores_ativos: 400 },
};

describe("Fase 3 — insights determinísticos", () => {
  it("retorna vazio sem KPIs", () => {
    expect(buildInsights({})).toEqual([]);
  });

  it("detecta crescimento de ausências", () => {
    const r = buildInsights(base);
    expect(r.some((i) => i.texto.includes("cresceram") && i.texto.includes("12%"))).toBe(true);
  });

  it("detecta concentração de projeto", () => {
    const r = buildInsights({
      ...base,
      top_projetos: [{ nome: "Projeto X", total: 38 }, { nome: "Projeto Y", total: 62 }],
    });
    expect(r.some((i) => i.texto.includes("Projeto X") && i.texto.includes("38%"))).toBe(true);
  });

  it("limita a 4 insights", () => {
    const r = buildInsights({
      ...base,
      top_projetos: [{ nome: "P", total: 90 }, { nome: "Q", total: 10 }],
      top_empresas: [{ nome: "E", total: 80 }, { nome: "F", total: 20 }],
      top_supervisores: [{ nome: "S", total: 70 }, { nome: "T", total: 30 }],
      heatmap: [{ dow: 1, total: 80 }, { dow: 2, total: 20 }],
    });
    expect(r.length).toBeLessThanOrEqual(4);
  });

  it("é determinístico", () => {
    expect(buildInsights(base).map((i) => i.id)).toEqual(buildInsights(base).map((i) => i.id));
  });
});
