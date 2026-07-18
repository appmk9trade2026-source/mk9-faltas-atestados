import { describe, it, expect } from "vitest";

/**
 * Mirrors the decision matrix implemented in
 * public.preferencia_notificacao_efetiva + materializar_notificacao.
 *
 * Any change to the SQL side must be reflected here to keep the invariants
 * documented and prevent regressions in the frontend copy of the rule set.
 */
type Sev = "INFO" | "ATENCAO" | "ALTA" | "CRITICA";
type Cat = { obrigatoria: boolean };
type Pref = { habilitada: boolean; silenciar_info: boolean } | null;

function decidir(cat: Cat | null, sev: Sev, pref: Pref) {
  if (!cat) return { habilitada: true, origem: "PADRAO" as const };
  if (cat.obrigatoria) return { habilitada: true, origem: "REGRA_OBRIGATORIA" as const };
  if (sev === "ALTA" || sev === "CRITICA") return { habilitada: true, origem: "REGRA_OBRIGATORIA" as const };
  if (pref) {
    if (!pref.habilitada) return { habilitada: false, origem: "USUARIO" as const };
    if (pref.silenciar_info && sev === "INFO") return { habilitada: false, origem: "USUARIO" as const };
    return { habilitada: true, origem: "USUARIO" as const };
  }
  return { habilitada: true, origem: "PADRAO" as const };
}

function materializar(cat: Cat | null, sev: Sev, candidatos: Pref[]) {
  const obrig = (cat?.obrigatoria ?? false) || sev === "ALTA" || sev === "CRITICA";
  if (obrig) return { decisao: "MATERIALIZAR", destinatarios: candidatos.length, suprimidos: 0 };
  let elig = 0, supr = 0;
  for (const p of candidatos) {
    if (decidir(cat, sev, p).habilitada) elig++; else supr++;
  }
  if (elig === 0) return { decisao: "SUPRIMIR", destinatarios: 0, suprimidos: supr };
  return { decisao: "MATERIALIZAR", destinatarios: elig, suprimidos: supr };
}

describe("Motor V2 — decisão", () => {
  it("padrão sem catálogo → habilita", () => {
    expect(decidir(null, "INFO", null).habilitada).toBe(true);
  });

  it("tipo obrigatório sempre habilita, ignora preferência", () => {
    expect(decidir({ obrigatoria: true }, "INFO", { habilitada: false, silenciar_info: true }).origem).toBe("REGRA_OBRIGATORIA");
  });

  it("severidade CRITICA prevalece sobre preferência", () => {
    expect(decidir({ obrigatoria: false }, "CRITICA", { habilitada: false, silenciar_info: false }).habilitada).toBe(true);
  });

  it("severidade ALTA prevalece sobre preferência", () => {
    expect(decidir({ obrigatoria: false }, "ALTA", { habilitada: false, silenciar_info: false }).habilitada).toBe(true);
  });

  it("opcional com preferência desabilitada → suprime", () => {
    expect(decidir({ obrigatoria: false }, "INFO", { habilitada: false, silenciar_info: false }).habilitada).toBe(false);
  });

  it("silenciar INFO respeitado apenas para INFO", () => {
    expect(decidir({ obrigatoria: false }, "INFO", { habilitada: true, silenciar_info: true }).habilitada).toBe(false);
    expect(decidir({ obrigatoria: false }, "ATENCAO", { habilitada: true, silenciar_info: true }).habilitada).toBe(true);
  });

  it("preferência habilitada → USUARIO", () => {
    expect(decidir({ obrigatoria: false }, "ATENCAO", { habilitada: true, silenciar_info: false }).origem).toBe("USUARIO");
  });
});

describe("Motor V2 — materialização", () => {
  it("obrigatória materializa a todos, mesmo com todos opt-out", () => {
    const r = materializar({ obrigatoria: true }, "INFO", [
      { habilitada: false, silenciar_info: false },
      { habilitada: false, silenciar_info: false },
    ]);
    expect(r).toEqual({ decisao: "MATERIALIZAR", destinatarios: 2, suprimidos: 0 });
  });

  it("opcional com todos suprimidos → SUPRIMIR (nenhum registro criado)", () => {
    const r = materializar({ obrigatoria: false }, "INFO", [
      { habilitada: false, silenciar_info: false },
      { habilitada: true, silenciar_info: true },
    ]);
    expect(r.decisao).toBe("SUPRIMIR");
    expect(r.suprimidos).toBe(2);
  });

  it("opcional parcial → MATERIALIZAR só elegíveis", () => {
    const r = materializar({ obrigatoria: false }, "ATENCAO", [
      { habilitada: true, silenciar_info: false },
      { habilitada: false, silenciar_info: false },
      null,
    ]);
    expect(r).toEqual({ decisao: "MATERIALIZAR", destinatarios: 2, suprimidos: 1 });
  });

  it("idempotência: candidatos vazios sem catálogo → SUPRIMIR", () => {
    const r = materializar(null, "INFO", []);
    expect(r.decisao).toBe("SUPRIMIR");
  });
});
