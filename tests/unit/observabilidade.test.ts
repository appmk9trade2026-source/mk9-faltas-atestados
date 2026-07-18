import { describe, it, expect } from "vitest";

// Reimplementação da lógica de score para teste unitário isolado
// (idêntica à fórmula em public.plataforma_health_score)
function computeHealthScore(input: {
  banco: number;
  performance: number;
  cron: number;
  bi: number;
}) {
  const score = Math.round((input.banco + input.performance + input.cron + input.bi) / 4);
  const classificacao =
    score >= 90 ? "EXCELENTE" :
    score >= 75 ? "BOM" :
    score >= 60 ? "ATENCAO" : "CRITICO";
  return { score, classificacao };
}

describe("plataforma_health_score — fórmula", () => {
  it("100 em tudo → EXCELENTE", () => {
    expect(computeHealthScore({ banco: 100, performance: 100, cron: 100, bi: 100 }))
      .toEqual({ score: 100, classificacao: "EXCELENTE" });
  });

  it("média 80 → BOM", () => {
    expect(computeHealthScore({ banco: 80, performance: 80, cron: 80, bi: 80 }).classificacao).toBe("BOM");
  });

  it("média 60 → ATENCAO", () => {
    expect(computeHealthScore({ banco: 60, performance: 60, cron: 60, bi: 60 }).classificacao).toBe("ATENCAO");
  });

  it("média baixa → CRITICO", () => {
    expect(computeHealthScore({ banco: 20, performance: 40, cron: 20, bi: 30 }).classificacao).toBe("CRITICO");
  });

  it("classifica no limite (75) como BOM e (74) como ATENCAO", () => {
    expect(computeHealthScore({ banco: 75, performance: 75, cron: 75, bi: 75 }).classificacao).toBe("BOM");
    expect(computeHealthScore({ banco: 74, performance: 74, cron: 74, bi: 74 }).classificacao).toBe("ATENCAO");
  });

  it("um componente crítico puxa o score para baixo", () => {
    const r = computeHealthScore({ banco: 100, performance: 100, cron: 0, bi: 100 });
    expect(r.score).toBe(75);
    expect(r.classificacao).toBe("BOM");
  });
});

describe("cron estado — semântica", () => {
  const estados = ["OK", "ATRASADO", "FALHOU", "INATIVO"] as const;
  it("define exatamente os quatro estados esperados", () => {
    expect(estados).toHaveLength(4);
    expect(new Set(estados).size).toBe(4);
  });
});
