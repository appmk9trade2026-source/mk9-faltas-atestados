import { describe, it, expect } from "vitest";
import { buildOperationalAlerts } from "@/components/dashboard/alertas-inteligentes";

const periodoLabel = "01/01/2026 a 30/01/2026";

describe("buildOperationalAlerts", () => {
  it("retorna vazio quando não há dados", () => {
    expect(buildOperationalAlerts({ periodoLabel })).toEqual([]);
  });

  it("gera alerta crítico para supervisor com alta acima de 20%", () => {
    const a = buildOperationalAlerts({
      periodoLabel,
      supervisores: [{ nome: "Carlos Eduardo", total: 31 }],
      supervisoresPrev: [{ nome: "Carlos Eduardo", total: 25 }],
    });
    expect(a).toHaveLength(1);
    expect(a[0].severidade).toBe("critico");
    expect(a[0].filtro.supervisor).toBe("Carlos Eduardo");
    expect(a[0].acaoSugerida).toMatch(/pendentes/);
  });

  it("ignora supervisores sem base anterior relevante e '(Sem supervisor)'", () => {
    const a = buildOperationalAlerts({
      periodoLabel,
      supervisores: [
        { nome: "(Sem supervisor)", total: 100 },
        { nome: "Ana", total: 10 },
      ],
      supervisoresPrev: [
        { nome: "(Sem supervisor)", total: 1 },
        { nome: "Ana", total: 2 },
      ],
    });
    expect(a).toEqual([]);
  });

  it("gera atenção para projeto que concentra mais de 30%", () => {
    const a = buildOperationalAlerts({
      periodoLabel,
      projetos: [
        { id: "p1", nome: "Projeto Alfa", total: 50 },
        { id: "p2", nome: "Projeto Beta", total: 30 },
        { id: "p3", nome: "Projeto Gama", total: 20 },
      ],
    });
    expect(a[0].severidade).toBe("atencao");
    expect(a[0].filtro.projeto_id).toBe("p1");
  });

  it("gera monitoramento para pendências em crescimento contínuo", () => {
    const a = buildOperationalAlerts({
      periodoLabel,
      porDia: [
        { dia: "1", total: 1, pendentes: 1, lancadas: 0 },
        { dia: "2", total: 1, pendentes: 2, lancadas: 0 },
        { dia: "3", total: 1, pendentes: 4, lancadas: 0 },
        { dia: "4", total: 1, pendentes: 6, lancadas: 0 },
      ],
    });
    expect(a[0].severidade).toBe("monitoramento");
    expect(a[0].filtro.status).toBe("PENDENTE");
  });

  it("gera positivo quando o total recua mais de 10%", () => {
    const a = buildOperationalAlerts({
      periodoLabel,
      kpis: { total: 80, pendentes: 5, lancadas: 75 },
      prev: { total: 100, pendentes: 5, lancadas: 95 },
    });
    expect(a[0].severidade).toBe("positivo");
  });

  it("ordena por severidade e limita a 5 alertas", () => {
    const a = buildOperationalAlerts({
      periodoLabel,
      kpis: { total: 80, pendentes: 40, lancadas: 40 },
      prev: { total: 100, pendentes: 10, lancadas: 90 },
      porDia: [
        { dia: "1", total: 1, pendentes: 1, lancadas: 0 },
        { dia: "2", total: 1, pendentes: 2, lancadas: 0 },
        { dia: "3", total: 1, pendentes: 4, lancadas: 0 },
        { dia: "4", total: 1, pendentes: 6, lancadas: 0 },
      ],
      supervisores: [
        { nome: "Carlos", total: 40 },
        { nome: "Ana", total: 5 },
      ],
      supervisoresPrev: [
        { nome: "Carlos", total: 10 },
        { nome: "Ana", total: 20 },
      ],
      projetos: [
        { id: "p1", nome: "Alfa", total: 60 },
        { id: "p2", nome: "Beta", total: 10 },
      ],
      empresas: [{ id: "e1", nome: "Empresa X", total: 60 }],
      empresasPrev: [{ nome: "Empresa X", total: 10 }],
    });
    expect(a.length).toBe(5);
    expect(a[0].severidade).toBe("critico");
    const ordem = ["critico", "atencao", "monitoramento", "positivo"];
    const idx = a.map((x) => ordem.indexOf(x.severidade));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });
});
