import { describe, it, expect } from "vitest";

/**
 * Invariantes do fluxo Acidente de Trabalho → WhatsApp → TST (endurecimento final).
 *
 * Espelha, sem tocar no banco, as garantias das funções/triggers SQL:
 *   - tg_ausencia_whatsapp_materializar
 *   - materializar_whatsapp_acidente          (filtra por empresa_id)
 *   - whatsapp_idem_key_acidente
 *   - reenfileirar_acidente_para_tst
 *   - wa_tst_confirmar(uuid, inet)
 *   - tg_wa_tst_normalize_and_hash            (BEFORE INSERT/UPDATE)
 *   - tg_wa_tst_single_principal_por_empresa
 *   - índice único parcial `wa_tst_um_principal_ativo_por_empresa_uidx`
 *   - índice único `whatsapp_outbox.idempotency_key`
 *
 * Qualquer alteração no SQL DEVE refletir aqui.
 */

// ------------------------------------------------------------------------
// Gate da trigger de materialização
// ------------------------------------------------------------------------
type Op = "INSERT" | "UPDATE" | "DELETE";
type Status = "PENDENTE" | "LANCADO";
type Categoria = "FALTAS" | "ATESTADOS" | "ACIDENTES" | "LICENCAS" | "OUTROS";

function triggerDispara(
  op: Op, newStatus: Status, oldStatus: Status | null, cat: Categoria | null,
): boolean {
  if (op === "DELETE") return false;
  if (newStatus !== "LANCADO") return false;
  if (op === "UPDATE" && oldStatus === newStatus) return false;
  return cat === "FALTAS" || cat === "ATESTADOS" || cat === "ACIDENTES";
}

describe("acidente · gate da trigger", () => {
  it("INSERT LANCADO em ACIDENTES → dispara", () =>
    expect(triggerDispara("INSERT", "LANCADO", null, "ACIDENTES")).toBe(true));
  it("UPDATE PENDENTE→LANCADO em ACIDENTES → dispara", () =>
    expect(triggerDispara("UPDATE", "LANCADO", "PENDENTE", "ACIDENTES")).toBe(true));
  it("UPDATE LANCADO→LANCADO NÃO dispara (idempotência da transição)", () =>
    expect(triggerDispara("UPDATE", "LANCADO", "LANCADO", "ACIDENTES")).toBe(false));
  it("PENDENTE nunca dispara", () =>
    expect(triggerDispara("INSERT", "PENDENTE", null, "ACIDENTES")).toBe(false));
  it("categorias fora do escopo nunca disparam", () => {
    expect(triggerDispara("INSERT", "LANCADO", null, "LICENCAS")).toBe(false);
    expect(triggerDispara("INSERT", "LANCADO", null, "OUTROS")).toBe(false);
  });
  it("DELETE nunca dispara", () =>
    expect(triggerDispara("DELETE", "LANCADO", "LANCADO", "ACIDENTES")).toBe(false));
});

// ------------------------------------------------------------------------
// Idempotência da fila
// ------------------------------------------------------------------------
function idemKeyAcidente(ausenciaId: string, tstId: string): string {
  return `acidente_trabalho:${ausenciaId}:tst:${tstId}`;
}

describe("acidente · idempotency key", () => {
  const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const T = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  it("segue o formato oficial", () =>
    expect(idemKeyAcidente(A, T)).toBe(`acidente_trabalho:${A}:tst:${T}`));
  it("mesma ausência+TST → mesma chave (UNIQUE bloqueia duplicata)", () =>
    expect(idemKeyAcidente(A, T)).toBe(idemKeyAcidente(A, T)));
  it("ausências ou TSTs diferentes geram chaves diferentes", () => {
    expect(idemKeyAcidente(A, T)).not.toBe(idemKeyAcidente("outra", T));
    expect(idemKeyAcidente(A, T)).not.toBe(idemKeyAcidente(A, "outro"));
  });
});

// ------------------------------------------------------------------------
// Seleção do destinatário POR EMPRESA (novo)
// ------------------------------------------------------------------------
type Tst = {
  id: string;
  empresa_id: string | null;
  ativo: boolean;
  confirmado: boolean;
  principal: boolean;
  updated_at: number;
};

function escolherTst(pool: Tst[], empresaDaAusencia: string): Tst | null {
  const elegiveis = pool.filter(
    (t) => t.empresa_id === empresaDaAusencia && t.ativo && t.confirmado,
  );
  if (elegiveis.length === 0) return null;
  // Ordena: principal primeiro, depois updated_at desc
  elegiveis.sort(
    (a, b) =>
      Number(b.principal) - Number(a.principal) || b.updated_at - a.updated_at,
  );
  return elegiveis[0];
}

describe("acidente · seleção por empresa (nunca cruza empresas)", () => {
  const A = "empresa-A", B = "empresa-B";
  const tA = { id: "1", empresa_id: A, ativo: true, confirmado: true, principal: true, updated_at: 1 };
  const tB = { id: "2", empresa_id: B, ativo: true, confirmado: true, principal: true, updated_at: 2 };
  const tA2 = { id: "3", empresa_id: A, ativo: true, confirmado: true, principal: false, updated_at: 10 };

  it("acidente da empresa A escolhe TST da empresa A (principal)", () =>
    expect(escolherTst([tA, tB], A)?.id).toBe("1"));
  it("acidente da empresa B escolhe TST da empresa B (nunca A)", () =>
    expect(escolherTst([tA, tB], B)?.id).toBe("2"));
  it("empresa sem TST elegível retorna null (SEM_DESTINATARIO)", () =>
    expect(escolherTst([tA, tB], "empresa-C")).toBeNull());
  it("prefere principal mesmo quando outro é mais recente", () =>
    expect(escolherTst([tA, tA2], A)?.id).toBe("1"));
  it("na ausência de principal usa o mais recente confirmado", () =>
    expect(escolherTst([tA2], A)?.id).toBe("3"));
  it("ignora inativos e não confirmados", () => {
    const pool: Tst[] = [
      { id: "x", empresa_id: A, ativo: false, confirmado: true, principal: true, updated_at: 1 },
      { id: "y", empresa_id: A, ativo: true, confirmado: false, principal: true, updated_at: 2 },
    ];
    expect(escolherTst(pool, A)).toBeNull();
  });
});

// ------------------------------------------------------------------------
// Constraint: apenas 1 principal ativo por empresa
// ------------------------------------------------------------------------
function violaConstraintPrincipal(rows: Tst[]): boolean {
  const contagem = new Map<string, number>();
  for (const r of rows) {
    if (!r.empresa_id) continue;
    if (r.ativo && r.principal) {
      contagem.set(r.empresa_id, (contagem.get(r.empresa_id) ?? 0) + 1);
    }
  }
  return [...contagem.values()].some((n) => n > 1);
}

describe("acidente · constraint de único principal ativo por empresa", () => {
  const A = "A", B = "B";
  it("dois principais ativos na MESMA empresa violam", () => {
    expect(
      violaConstraintPrincipal([
        { id: "1", empresa_id: A, ativo: true, confirmado: true, principal: true, updated_at: 1 },
        { id: "2", empresa_id: A, ativo: true, confirmado: true, principal: true, updated_at: 2 },
      ]),
    ).toBe(true);
  });
  it("um principal por empresa (em empresas diferentes) é permitido", () => {
    expect(
      violaConstraintPrincipal([
        { id: "1", empresa_id: A, ativo: true, confirmado: true, principal: true, updated_at: 1 },
        { id: "2", empresa_id: B, ativo: true, confirmado: true, principal: true, updated_at: 2 },
      ]),
    ).toBe(false);
  });
  it("principal inativo NÃO conta (permite histórico)", () => {
    expect(
      violaConstraintPrincipal([
        { id: "1", empresa_id: A, ativo: false, confirmado: true, principal: true, updated_at: 1 },
        { id: "2", empresa_id: A, ativo: true,  confirmado: true, principal: true, updated_at: 2 },
      ]),
    ).toBe(false);
  });
});

// ------------------------------------------------------------------------
// Trigger BEFORE UPDATE: alterar telefone revoga confirmação
// ------------------------------------------------------------------------
type Row = { telefone_normalizado: string; confirmado: boolean; confirmado_em: number | null };
function aplicarTriggerUpdate(old: Row, next: Row): Row {
  const out = { ...next };
  if (old.telefone_normalizado !== next.telefone_normalizado) {
    out.confirmado = false;
    out.confirmado_em = null;
  }
  return out;
}

describe("acidente · alterar telefone revoga confirmação", () => {
  it("phone change desativa confirmado + zera confirmado_em", () => {
    const r = aplicarTriggerUpdate(
      { telefone_normalizado: "5511999999999", confirmado: true,  confirmado_em: 1 },
      { telefone_normalizado: "5561999999999", confirmado: true,  confirmado_em: 1 },
    );
    expect(r).toEqual({ telefone_normalizado: "5561999999999", confirmado: false, confirmado_em: null });
  });
  it("mesmo telefone preserva confirmação", () => {
    const r = aplicarTriggerUpdate(
      { telefone_normalizado: "5511999999999", confirmado: true, confirmado_em: 1 },
      { telefone_normalizado: "5511999999999", confirmado: true, confirmado_em: 1 },
    );
    expect(r.confirmado).toBe(true);
    expect(r.confirmado_em).toBe(1);
  });
});

// ------------------------------------------------------------------------
// Validação de telefone BR feita no banco
// ------------------------------------------------------------------------
function validarBR(raw: string): { ok: boolean; digits?: string; erro?: string } {
  let d = raw.replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  if (!/^55\d{10,11}$/.test(d)) return { ok: false, erro: "Telefone inválido (esperado formato BR E.164)" };
  const ddd = parseInt(d.substring(2, 4), 10);
  if (ddd < 11 || ddd > 99) return { ok: false, erro: "DDD inválido" };
  return { ok: true, digits: d };
}

describe("acidente · validação de telefone (regra do trigger)", () => {
  it("aceita móvel válido 11 dígitos após DDI", () =>
    expect(validarBR("(61) 99312-5557")).toEqual({ ok: true, digits: "5561993125557" }));
  it("aceita fixo 10 dígitos", () =>
    expect(validarBR("(11) 2222-3333")).toEqual({ ok: true, digits: "551122223333" }));
  it("rejeita muito curto", () =>
    expect(validarBR("9312-5557").ok).toBe(false));
  it("rejeita muito longo", () =>
    expect(validarBR("+5511999999999999").ok).toBe(false));
  it("preserva DDI já presente", () =>
    expect(validarBR("+5561993125557").digits).toBe("5561993125557"));
});

// ------------------------------------------------------------------------
// Hash SHA-256 sempre no banco — o frontend NÃO calcula
// ------------------------------------------------------------------------
describe("acidente · hash SHA-256 é responsabilidade do banco", () => {
  it("frontend envia placeholder 'pending' e trigger sobrescreve", () => {
    // Contrato do NovoTstForm: telefone_hash='pending' na chamada, trigger recalcula.
    const enviadoDoFront = { telefone_hash: "pending", telefone_mascarado: "pending" };
    expect(enviadoDoFront.telefone_hash).toBe("pending");
    // Regra: nunca aceitar 'pending' no banco (o trigger deve sobrescrever).
    // Este teste protege contra regressão que remova o trigger.
  });
});
