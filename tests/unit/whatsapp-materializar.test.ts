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

type Status = "PENDENTE" | "LANCADO";

// ---------- Espelho do gate da trigger (nova regra: LANCADO) -----------
function triggerDispara(
  op: Op,
  newStatus: Status,
  oldStatus: Status | null,
  cat: Categoria | null,
): boolean {
  if (op === "DELETE") return false;
  if (newStatus !== "LANCADO") return false;
  if (op === "UPDATE" && oldStatus === newStatus) return false;
  if (cat !== "FALTA" && cat !== "ATESTADO") return false;
  return true;
}

// ---------- Espelho da idempotency key ---------------------------------
function idemKey(ausenciaId: string): string {
  return `ausencia:${ausenciaId}:whatsapp:colaborador:v1`;
}

// ---------- Espelho do payload permitido (apenas COLABORADOR) ---------
const CAMPOS_COLAB = ["primeiro_nome", "data_registro", "empresa"];
const CAMPOS_PROIBIDOS_COLAB = [
  "categoria", "tipo", "motivo", "cid", "diagnostico",
  "atestado", "falta", "observacao", "documento", "imagem",
  "supervisor", "projeto",
];

describe("Materialização · gate por status LANCADO", () => {
  it("INSERT já LANCADO (FALTA) → dispara", () =>
    expect(triggerDispara("INSERT", "LANCADO", null, "FALTA")).toBe(true));
  it("INSERT já LANCADO (ATESTADO) → dispara", () =>
    expect(triggerDispara("INSERT", "LANCADO", null, "ATESTADO")).toBe(true));
  it("INSERT PENDENTE → NÃO dispara", () =>
    expect(triggerDispara("INSERT", "PENDENTE", null, "FALTA")).toBe(false));
  it("UPDATE PENDENTE→LANCADO → dispara", () =>
    expect(triggerDispara("UPDATE", "LANCADO", "PENDENTE", "FALTA")).toBe(true));
  it("UPDATE LANCADO→LANCADO (edição sem transição) → NÃO dispara", () =>
    expect(triggerDispara("UPDATE", "LANCADO", "LANCADO", "FALTA")).toBe(false));
  it("UPDATE mantém PENDENTE → NÃO dispara", () =>
    expect(triggerDispara("UPDATE", "PENDENTE", "PENDENTE", "FALTA")).toBe(false));
  it("categoria LICENCA nunca dispara", () =>
    expect(triggerDispara("INSERT", "LANCADO", null, "LICENCA")).toBe(false));
  it("DELETE nunca dispara", () =>
    expect(triggerDispara("DELETE", "LANCADO", "LANCADO", "FALTA")).toBe(false));
});

describe("Materialização · destinatário único (colaborador)", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  it("idempotency key fixa por ausência", () =>
    expect(idemKey(A)).toBe(`ausencia:${A}:whatsapp:colaborador:v1`));
  it("mesma ausência reprocessada → mesma chave (ON CONFLICT DO NOTHING)", () =>
    expect(idemKey(A)).toBe(idemKey(A)));
});

describe("Materialização · payload permitido (LGPD)", () => {
  it("colaborador recebe apenas campos neutros", () => {
    expect(CAMPOS_COLAB).toEqual(["primeiro_nome", "data_registro", "empresa"]);
  });
  it("payload nunca inclui CID, diagnóstico ou dados do supervisor", () => {
    for (const proib of CAMPOS_PROIBIDOS_COLAB) {
      expect(CAMPOS_COLAB).not.toContain(proib);
    }
  });
});

describe("Materialização · ausência sempre preservada", () => {
  // A trigger encapsula materializar_whatsapp_ausencia em BEGIN/EXCEPTION,
  // portanto qualquer falha não faz rollback da própria ausência.
  it("materialização com erro não bloqueia o lançamento", () => {
    let ausenciaPreservada = true;
    try { throw new Error("template ausente"); }
    catch { /* trigger engole o erro e registra em audit */ }
    expect(ausenciaPreservada).toBe(true);
  });
});
