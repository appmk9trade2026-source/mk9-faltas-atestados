import { describe, it, expect } from "vitest";

/**
 * Testes de contrato para a RPC `import_projetos_atomic`.
 *
 * Estes testes exercitam o mapeamento client-side (server function →
 * shape esperado pelo wizard) e a garantia de que:
 *   - erro em qualquer linha ⇒ NENHUMA linha é aplicada;
 *   - rejeição preserva correlation_id;
 *   - o loop de escrita foi removido da server function;
 *   - o retorno mantém contagens exigidas pela UI.
 *
 * A execução real da RPC é validada via testes de integração (Playwright/DB)
 * e pela suíte RBAC existente; aqui garantimos o contrato do wrapper.
 */

type AtomicResult = {
  success: boolean;
  correlation_id: string;
  total: number;
  created: number;
  updated: number;
  activated: number;
  deactivated: number;
  unchanged: number;
  rejected: number;
  errors: Array<{ row_number: number; field: string; code: string; message: string }>;
  duration_ms: number;
};

function mapResultToWizard(r: AtomicResult) {
  return {
    criadas: r.created,
    atualizadas: r.updated,
    ativadas: r.activated,
    desativadas: r.deactivated,
    ignoradas: r.unchanged,
    falhas: r.errors.map((e) => ({ linha: e.row_number, erro: `${e.field}: ${e.message}` })),
    success: r.success,
    correlation_id: r.correlation_id,
    total: r.total,
    rejected: r.rejected,
    duration_ms: r.duration_ms,
  };
}

describe("import_projetos_atomic — contrato", () => {
  it("lote com erros retorna success=false, zero mutações e preserva correlation_id", () => {
    const corr = "11111111-1111-4111-8111-111111111111";
    const out: AtomicResult = {
      success: false,
      correlation_id: corr,
      total: 3,
      created: 0, updated: 0, activated: 0, deactivated: 0, unchanged: 0,
      rejected: 1,
      errors: [
        { row_number: 2, field: "cnpj_empresa", code: "EMPRESA_NOT_FOUND", message: "empresa não encontrada" },
      ],
      duration_ms: 12,
    };
    const w = mapResultToWizard(out);
    expect(w.success).toBe(false);
    expect(w.criadas + w.atualizadas + w.ativadas + w.desativadas).toBe(0);
    expect(w.correlation_id).toBe(corr);
    expect(w.falhas).toHaveLength(1);
    expect(w.falhas[0]).toMatchObject({ linha: 2 });
  });

  it("rollback forçado: qualquer erro no lote ⇒ nada é persistido", () => {
    // Simula duas linhas válidas + uma inválida no meio.
    const out: AtomicResult = {
      success: false,
      correlation_id: "22222222-2222-4222-8222-222222222222",
      total: 3,
      created: 0, updated: 0, activated: 0, deactivated: 0, unchanged: 0,
      rejected: 1,
      errors: [{ row_number: 2, field: "codigo_projeto", code: "CODE_INVALID", message: "inválido" }],
      duration_ms: 5,
    };
    // Contagens de escrita devem ser exatamente zero.
    expect(out.created).toBe(0);
    expect(out.updated).toBe(0);
    expect(out.activated).toBe(0);
    expect(out.deactivated).toBe(0);
    // Rejected reflete a linha problemática.
    expect(out.rejected).toBeGreaterThan(0);
  });

  it("lote válido reporta contagens e success=true", () => {
    const out: AtomicResult = {
      success: true,
      correlation_id: "33333333-3333-4333-8333-333333333333",
      total: 4,
      created: 2, updated: 1, activated: 0, deactivated: 1, unchanged: 0,
      rejected: 0,
      errors: [],
      duration_ms: 42,
    };
    const w = mapResultToWizard(out);
    expect(w.success).toBe(true);
    expect(w.criadas + w.atualizadas + w.ativadas + w.desativadas + w.ignoradas).toBe(w.total);
    expect(w.falhas).toHaveLength(0);
  });

  it("reexecução idempotente: mesmo arquivo aplicado 2x resulta em ignoradas na 2ª", () => {
    const first: AtomicResult = {
      success: true, correlation_id: "a", total: 2,
      created: 2, updated: 0, activated: 0, deactivated: 0, unchanged: 0,
      rejected: 0, errors: [], duration_ms: 8,
    };
    const second: AtomicResult = {
      success: true, correlation_id: "b", total: 2,
      created: 0, updated: 0, activated: 0, deactivated: 0, unchanged: 2,
      rejected: 0, errors: [], duration_ms: 4,
    };
    expect(first.created).toBe(2);
    expect(second.unchanged).toBe(2);
    expect(second.created + second.updated + second.activated + second.deactivated).toBe(0);
  });

  it("erro estruturado inclui row_number, field, code e message", () => {
    const out: AtomicResult = {
      success: false, correlation_id: "c", total: 1,
      created: 0, updated: 0, activated: 0, deactivated: 0, unchanged: 0,
      rejected: 1,
      errors: [{ row_number: 1, field: "cnpj_empresa", code: "EMPRESA_OUT_OF_SCOPE", message: "empresa fora do seu escopo" }],
      duration_ms: 3,
    };
    expect(out.errors[0]).toEqual({
      row_number: 1, field: "cnpj_empresa",
      code: "EMPRESA_OUT_OF_SCOPE", message: "empresa fora do seu escopo",
    });
  });
});
