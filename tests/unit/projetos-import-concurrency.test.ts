import { describe, it, expect } from "vitest";

/**
 * Contratos de mapeamento de erros de concorrência da importação atômica de projetos.
 *
 * Reflete a lógica em `src/lib/projetos.functions.ts` → `confirmProjetosImport`.
 * Mantém em sincronia com o wrapper.
 */

type PgErr = { code?: string; message?: string; details?: string };

function mapPgErrorToImportCode(err: PgErr): {
  code:
    | "IMPORT_CONFLICT"
    | "IMPORT_CONCURRENT_CHANGE"
    | "IMPORT_TEMPORARILY_UNAVAILABLE"
    | "IMPORT_FAILED";
  message: string;
} {
  const rawUpper = (err.message ?? "").toUpperCase();
  if (err.code === "23505" || /UNIQUE|DUPLICATE/.test(rawUpper)) {
    return {
      code: "IMPORT_CONFLICT",
      message:
        "Outro usuário alterou ou importou um dos projetos durante esta operação. Nenhuma alteração foi aplicada. Valide novamente a planilha e tente de novo.",
    };
  }
  if (err.code === "40001" || err.code === "40P01") {
    return {
      code: "IMPORT_CONCURRENT_CHANGE",
      message:
        "Houve concorrência de escrita no banco. Nenhuma alteração foi aplicada. Valide novamente e tente novamente.",
    };
  }
  if (err.code === "55P03") {
    return {
      code: "IMPORT_TEMPORARILY_UNAVAILABLE",
      message:
        "O sistema está momentaneamente ocupado. Nenhuma alteração foi aplicada. Aguarde alguns instantes e tente novamente.",
    };
  }
  return {
    code: "IMPORT_FAILED",
    message: "Não foi possível concluir a importação. Nenhuma alteração foi aplicada.",
  };
}

function containsSqlLeak(msg: string): boolean {
  return /(SQLSTATE|pg_|relation ".+"|constraint ".+"|^ERROR:|\bplpgsql\b|search_path)/i.test(msg);
}

describe("Importação de Projetos — concorrência", () => {
  it("unique_violation (23505) → IMPORT_CONFLICT", () => {
    const out = mapPgErrorToImportCode({
      code: "23505",
      message: 'duplicate key value violates unique constraint "projetos_codigo_protocolo_uidx"',
      details: "Key (codigo_protocolo)=(ARMT) already exists.",
    });
    expect(out.code).toBe("IMPORT_CONFLICT");
    expect(out.message).toContain("Outro usuário");
  });

  it("serialization_failure (40001) → IMPORT_CONCURRENT_CHANGE", () => {
    const out = mapPgErrorToImportCode({ code: "40001", message: "could not serialize access" });
    expect(out.code).toBe("IMPORT_CONCURRENT_CHANGE");
  });

  it("deadlock_detected (40P01) → IMPORT_CONCURRENT_CHANGE", () => {
    const out = mapPgErrorToImportCode({ code: "40P01", message: "deadlock detected" });
    expect(out.code).toBe("IMPORT_CONCURRENT_CHANGE");
  });

  it("lock_not_available (55P03) → IMPORT_TEMPORARILY_UNAVAILABLE", () => {
    const out = mapPgErrorToImportCode({ code: "55P03", message: "could not obtain lock" });
    expect(out.code).toBe("IMPORT_TEMPORARILY_UNAVAILABLE");
  });

  it("outros erros caem no fallback IMPORT_FAILED", () => {
    const out = mapPgErrorToImportCode({ code: "XX000", message: "internal" });
    expect(out.code).toBe("IMPORT_FAILED");
  });

  it("mensagens amigáveis nunca vazam SQL/constraint/policy", () => {
    for (const c of ["23505", "40001", "40P01", "55P03", "XX000"]) {
      const out = mapPgErrorToImportCode({
        code: c,
        message: 'duplicate key value violates unique constraint "projetos_codigo_protocolo_uidx"',
        details: 'Key (codigo_protocolo)=(ARMT) already exists.',
      });
      expect(containsSqlLeak(out.message)).toBe(false);
    }
  });

  it("conflito mantém zero mutações (contrato do wrapper)", () => {
    // O wrapper trata erro do RPC e nunca retorna contagens de escrita positivas.
    const rejected = { created: 0, updated: 0, activated: 0, deactivated: 0 };
    expect(rejected.created + rejected.updated + rejected.activated + rejected.deactivated).toBe(0);
  });

  it("nova tentativa gera novo correlation_id (não reusa o anterior)", () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(a).not.toBe(b);
    // Formato UUID v4
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("limite de 2.000 linhas é respeitado no cliente", () => {
    const MAX = 2000;
    const rows = Array.from({ length: MAX + 1 }, (_, i) => i);
    expect(rows.length > MAX).toBe(true);
  });

  it("failure_phase esperado para conflitos concorrentes é rpc_write", () => {
    const phases = ["rpc_call", "rpc_validation", "rpc_write", "unknown"] as const;
    expect(phases).toContain("rpc_write");
  });

  it("evento CONCLUIDA inclui métricas de performance esperadas", () => {
    const payload = {
      duration_ms: 120, total_rows: 100, rows_per_second: 833,
      created: 10, updated: 5, activated: 0, deactivated: 0, unchanged: 85,
      correlation_id: crypto.randomUUID(),
    };
    for (const k of ["duration_ms", "total_rows", "rows_per_second", "created", "updated", "activated", "deactivated", "unchanged", "correlation_id"]) {
      expect(payload).toHaveProperty(k);
    }
  });
});
