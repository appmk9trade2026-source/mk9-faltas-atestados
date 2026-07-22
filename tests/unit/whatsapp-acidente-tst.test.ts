import { describe, it, expect } from "vitest";

/**
 * Invariantes do fluxo Acidente de Trabalho → WhatsApp → TST.
 * Espelha, sem tocar no banco, as garantias das funções SQL:
 *   - tg_ausencia_whatsapp_materializar
 *   - materializar_whatsapp_acidente
 *   - whatsapp_idem_key_acidente
 *   - reenfileirar_acidente_para_tst
 *   - wa_tst_confirmar
 *   - whatsapp_outbox UNIQUE(idempotency_key)
 *
 * Qualquer mudança no SQL DEVE refletir aqui.
 */

type Op = "INSERT" | "UPDATE" | "DELETE";
type Status = "PENDENTE" | "LANCADO";
type Categoria = "FALTAS" | "ATESTADOS" | "ACIDENTES" | "LICENCAS" | "OUTROS";

// ---------- Gate da trigger (categoria ACIDENTES) ----------------------
function triggerDispara(
  op: Op,
  newStatus: Status,
  oldStatus: Status | null,
  cat: Categoria | null,
): boolean {
  if (op === "DELETE") return false;
  if (newStatus !== "LANCADO") return false;
  if (op === "UPDATE" && oldStatus === newStatus) return false;
  return cat === "FALTAS" || cat === "ATESTADOS" || cat === "ACIDENTES";
}

// ---------- Idempotency key do TST -------------------------------------
function idemKeyAcidente(ausenciaId: string, tstId: string): string {
  return `acidente_trabalho:${ausenciaId}:tst:${tstId}`;
}

// ---------- Elegibilidade de destinatário TST -------------------------
type Tst = { ativo: boolean; confirmado: boolean; principal: boolean };
function tstElegivel(t: Tst): boolean {
  return t.ativo && t.confirmado && t.principal;
}

// ---------- Allow-list de variáveis do template ACIDENTE_TRABALHO_TST_V1
const VARIAVEIS_PERMITIDAS = [
  "empresa", "projeto", "colaborador", "matricula", "cargo",
  "data_ocorrencia", "hora_ocorrencia", "local_ocorrencia", "descricao",
  "usuario", "created_at", "url_interna", "telefone_e164",
];
const VARIAVEIS_PROIBIDAS = ["cid", "diagnostico", "cpf", "endereco_residencial"];

// ---------- E.164 BR ----------------------------------------------------
function normalizarE164BR(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  const n = d.length >= 10 && !d.startsWith("55") ? `55${d}` : d;
  if (!/^55\d{10,11}$/.test(n)) return null;
  return `+${n}`;
}

describe("acidente · gate da trigger", () => {
  it("INSERT LANCADO em categoria ACIDENTES → dispara", () =>
    expect(triggerDispara("INSERT", "LANCADO", null, "ACIDENTES")).toBe(true));
  it("UPDATE PENDENTE→LANCADO em ACIDENTES → dispara", () =>
    expect(triggerDispara("UPDATE", "LANCADO", "PENDENTE", "ACIDENTES")).toBe(true));
  it("UPDATE LANCADO→LANCADO (edição pós-lançamento) → NÃO dispara", () =>
    expect(triggerDispara("UPDATE", "LANCADO", "LANCADO", "ACIDENTES")).toBe(false));
  it("PENDENTE nunca dispara", () =>
    expect(triggerDispara("INSERT", "PENDENTE", null, "ACIDENTES")).toBe(false));
  it("LICENCAS/OUTROS nunca disparam pipeline TST", () => {
    expect(triggerDispara("INSERT", "LANCADO", null, "LICENCAS")).toBe(false);
    expect(triggerDispara("INSERT", "LANCADO", null, "OUTROS")).toBe(false);
  });
  it("DELETE nunca dispara", () =>
    expect(triggerDispara("DELETE", "LANCADO", "LANCADO", "ACIDENTES")).toBe(false));
});

describe("acidente · idempotency key TST", () => {
  const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const T = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  it("segue o formato oficial", () =>
    expect(idemKeyAcidente(A, T)).toBe(`acidente_trabalho:${A}:tst:${T}`));
  it("é determinística: mesma ausência+TST → mesma chave (UNIQUE bloqueia duplicata)", () =>
    expect(idemKeyAcidente(A, T)).toBe(idemKeyAcidente(A, T)));
  it("ausências diferentes geram chaves diferentes", () =>
    expect(idemKeyAcidente(A, T)).not.toBe(idemKeyAcidente("outra", T)));
  it("TSTs diferentes geram chaves diferentes", () =>
    expect(idemKeyAcidente(A, T)).not.toBe(idemKeyAcidente(A, "outro")));
});

describe("acidente · elegibilidade do TST (gate de confirmação)", () => {
  it("TST não confirmado NÃO recebe (mensagem não sai antes da confirmação)", () =>
    expect(tstElegivel({ ativo: true, confirmado: false, principal: true })).toBe(false));
  it("TST inativo NÃO recebe", () =>
    expect(tstElegivel({ ativo: false, confirmado: true, principal: true })).toBe(false));
  it("TST não-principal NÃO recebe pelo pipeline de acidente", () =>
    expect(tstElegivel({ ativo: true, confirmado: true, principal: false })).toBe(false));
  it("apenas ativo+confirmado+principal é elegível", () =>
    expect(tstElegivel({ ativo: true, confirmado: true, principal: true })).toBe(true));
});

describe("acidente · LGPD do payload TST", () => {
  it("allow-list não contém dados médicos ou documentos pessoais", () => {
    for (const p of VARIAVEIS_PROIBIDAS) {
      expect(VARIAVEIS_PERMITIDAS).not.toContain(p);
    }
  });
  it("template envia apenas campos operacionais + link interno", () => {
    expect(VARIAVEIS_PERMITIDAS).toContain("empresa");
    expect(VARIAVEIS_PERMITIDAS).toContain("local_ocorrencia");
    expect(VARIAVEIS_PERMITIDAS).toContain("url_interna");
  });
});

describe("acidente · normalização E.164 (nono dígito)", () => {
  it("aceita 11 dígitos com DDD e adiciona +55", () =>
    expect(normalizarE164BR("(61) 99312-5557")).toBe("+5561993125557"));
  it("rejeita 8 dígitos após DDD (exige confirmação manual do nono)", () =>
    expect(normalizarE164BR("(61) 9312-5557")).toBeNull());
  it("preserva número já em formato E.164", () =>
    expect(normalizarE164BR("+5561993125557")).toBe("+5561993125557"));
});

describe("acidente · reprocessamento manual reusa idempotência", () => {
  // reenfileirar_acidente_para_tst → materializar_whatsapp_acidente → ON CONFLICT DO NOTHING
  it("segunda materialização da mesma ausência+TST não duplica mensagem", () => {
    const A = "11111111-1111-1111-1111-111111111111";
    const T = "22222222-2222-2222-2222-222222222222";
    const inseridos = new Set<string>();
    const tentar = () => {
      const k = idemKeyAcidente(A, T);
      if (inseridos.has(k)) return { criados: 0, duplicados: 1 };
      inseridos.add(k);
      return { criados: 1, duplicados: 0 };
    };
    expect(tentar()).toEqual({ criados: 1, duplicados: 0 });
    expect(tentar()).toEqual({ criados: 0, duplicados: 1 });
    expect(tentar()).toEqual({ criados: 0, duplicados: 1 });
  });
});
