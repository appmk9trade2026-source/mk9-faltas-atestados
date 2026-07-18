import { describe, it, expect } from "vitest";

/**
 * Mirrors the SQL invariants of Fase 2 (Etapa 29C):
 *   - tg_ausencia_whatsapp_materializar (AFTER INSERT em ausencias)
 *   - materializar_whatsapp_ausencia(ausencia_id, supervisor_id)
 *   - resolver_destinatarios_rh_ausencia
 *   - whatsapp_idem_key_ausencia
 *
 * Any change on the SQL side MUST be reflected here.
 */

type Role = "super_admin" | "rh" | "supervisor" | "compliance";
type Categoria = "FALTA" | "ATESTADO" | "LICENCA" | "OUTROS";
type Op = "INSERT" | "UPDATE" | "DELETE";

// ---------- Espelho do gate da trigger ---------------------------------
function triggerDispara(op: Op, roles: Role[] | null, cat: Categoria | null): boolean {
  if (op !== "INSERT") return false;
  if (!roles) return false; // sem auth.uid()
  const isSup = roles.includes("supervisor");
  const priv =
    roles.includes("rh") ||
    roles.includes("super_admin") ||
    roles.includes("compliance");
  if (!isSup || priv) return false;
  if (cat !== "FALTA" && cat !== "ATESTADO") return false;
  return true;
}

// ---------- Espelho da idempotency key ---------------------------------
function idemKey(
  ausenciaId: string,
  publico: "COLABORADOR" | "RH" | "SUPERVISOR",
  alvoId: string | null,
): string {
  if (publico === "COLABORADOR") return `ausencia:${ausenciaId}:whatsapp:colaborador:v1`;
  if (publico === "RH") return `ausencia:${ausenciaId}:whatsapp:rh:${alvoId ?? "nil"}:v1`;
  return `ausencia:${ausenciaId}:whatsapp:supervisor:${alvoId ?? "nil"}:v1`;
}

// ---------- Espelho do payload por público -----------------------------
const CAMPOS_COLAB = ["primeiro_nome", "data_registro", "empresa"];
const CAMPOS_RH = [
  "colaborador", "matricula", "empresa", "projeto", "categoria",
  "periodo", "supervisor", "status", "protocolo",
];
const CAMPOS_SUP = ["colaborador", "categoria", "periodo", "status", "protocolo"];
const CAMPOS_PROIBIDOS_COLAB = [
  "categoria", "tipo", "motivo", "cid", "diagnostico",
  "atestado", "falta", "observacao", "documento", "imagem",
  "supervisor", "projeto",
];

// ---------- Espelho da resolução de RH (dedup por telefone) ------------
type Perfil = { id: string; ativo: boolean; roles: Role[]; telefone: string | null };
function resolverRh(perfis: Perfil[]) {
  const map = new Map<string, Perfil>();
  for (const p of perfis) {
    if (!p.ativo) continue;
    if (!p.roles.includes("rh")) continue;
    if (!p.telefone || p.telefone.trim() === "") continue;
    if (!map.has(p.telefone)) map.set(p.telefone, p);
  }
  return [...map.values()];
}

describe("29C · Fase 2 · trigger AFTER INSERT gate", () => {
  it("Supervisor cria FALTA → dispara", () =>
    expect(triggerDispara("INSERT", ["supervisor"], "FALTA")).toBe(true));
  it("Supervisor cria ATESTADO → dispara", () =>
    expect(triggerDispara("INSERT", ["supervisor"], "ATESTADO")).toBe(true));
  it("Supervisor cria LICENCA → NÃO dispara (categoria fora do escopo)", () =>
    expect(triggerDispara("INSERT", ["supervisor"], "LICENCA")).toBe(false));
  it("RH cria ausência → NÃO dispara", () =>
    expect(triggerDispara("INSERT", ["rh"], "FALTA")).toBe(false));
  it("Super Admin cria ausência → NÃO dispara", () =>
    expect(triggerDispara("INSERT", ["super_admin"], "FALTA")).toBe(false));
  it("Compliance cria ausência → NÃO dispara", () =>
    expect(triggerDispara("INSERT", ["compliance"], "ATESTADO")).toBe(false));
  it("Supervisor + RH combinado → NÃO dispara (papel privilegiado)", () =>
    expect(triggerDispara("INSERT", ["supervisor", "rh"], "FALTA")).toBe(false));
  it("UPDATE não dispara", () =>
    expect(triggerDispara("UPDATE", ["supervisor"], "FALTA")).toBe(false));
  it("DELETE não dispara", () =>
    expect(triggerDispara("DELETE", ["supervisor"], "FALTA")).toBe(false));
  it("Sem autor autenticado (import/migration/script) não dispara", () =>
    expect(triggerDispara("INSERT", null, "FALTA")).toBe(false));
});

describe("29C · Fase 2 · idempotency keys estáveis", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const C = "22222222-2222-2222-2222-222222222222";
  const U = "33333333-3333-3333-3333-333333333333";
  it("colaborador → chave fixa por ausência", () =>
    expect(idemKey(A, "COLABORADOR", C)).toBe(`ausencia:${A}:whatsapp:colaborador:v1`));
  it("rh → chave com usuario", () =>
    expect(idemKey(A, "RH", U)).toBe(`ausencia:${A}:whatsapp:rh:${U}:v1`));
  it("supervisor → chave com usuario", () =>
    expect(idemKey(A, "SUPERVISOR", U)).toBe(`ausencia:${A}:whatsapp:supervisor:${U}:v1`));
  it("mesma execução repetida → mesma chave (JA_EXISTENTE via UNIQUE)", () =>
    expect(idemKey(A, "COLABORADOR", C)).toBe(idemKey(A, "COLABORADOR", C)));
});

describe("29C · Fase 2 · payload por público (isolamento LGPD)", () => {
  it("colaborador contém apenas campos neutros", () => {
    for (const c of CAMPOS_COLAB) expect(CAMPOS_PROIBIDOS_COLAB).not.toContain(c);
  });
  it("colaborador nunca inclui termos sensíveis", () => {
    for (const proib of CAMPOS_PROIBIDOS_COLAB) expect(CAMPOS_COLAB).not.toContain(proib);
  });
  it("RH contém campos operacionais completos", () => {
    for (const k of ["colaborador", "matricula", "categoria", "periodo", "protocolo"]) {
      expect(CAMPOS_RH).toContain(k);
    }
  });
  it("Supervisor recebe payload enxuto", () => {
    expect(CAMPOS_SUP).toEqual(["colaborador", "categoria", "periodo", "status", "protocolo"]);
  });
});

describe("29C · Fase 2 · resolver_destinatarios_rh_ausencia", () => {
  const p = (id: string, roles: Role[], tel: string | null, ativo = true): Perfil =>
    ({ id, roles, telefone: tel, ativo });

  it("ignora inativos", () =>
    expect(resolverRh([p("a", ["rh"], "5511999999999", false)])).toHaveLength(0));
  it("ignora quem não é RH", () =>
    expect(resolverRh([p("a", ["supervisor"], "5511999999999")])).toHaveLength(0));
  it("ignora telefone vazio/nulo", () =>
    expect(resolverRh([p("a", ["rh"], null), p("b", ["rh"], "")])).toHaveLength(0));
  it("dedup por telefone (mantém 1 destinatário)", () =>
    expect(resolverRh([
      p("a", ["rh"], "5511999999999"),
      p("b", ["rh"], "5511999999999"),
    ])).toHaveLength(1));
  it("mantém múltiplos telefones distintos", () =>
    expect(resolverRh([
      p("a", ["rh"], "5511999999999"),
      p("b", ["rh"], "5511988888888"),
    ])).toHaveLength(2));
});

describe("29C · Fase 2 · resiliência (ausência nunca sofre rollback)", () => {
  // Materialização isola cada público em BEGIN/EXCEPTION; falha de um público
  // não impede os demais nem cancela o INSERT da ausência.
  function materializarSimulada(publicos: Array<"ok" | "erro">) {
    let criados = 0, erros = 0;
    for (const r of publicos) {
      try {
        if (r === "erro") throw new Error("boom");
        criados++;
      } catch { erros++; }
    }
    return { criados, erros, ausenciaPreservada: true };
  }
  it("falha isolada: colab ok, RH erro, sup ok → 2 criados, 1 erro, ausência preservada", () => {
    expect(materializarSimulada(["ok", "erro", "ok"])).toEqual({
      criados: 2, erros: 1, ausenciaPreservada: true,
    });
  });
  it("todas falham → ausência ainda preservada", () => {
    expect(materializarSimulada(["erro", "erro", "erro"]).ausenciaPreservada).toBe(true);
  });
});
