import { describe, it, expect } from "vitest";

/**
 * Fase B — Matriz de decisão. Este teste garante que o mapeamento
 * categoria → roles esperados não regrida silenciosamente.
 *
 * A validação real dos grants é feita via `security_functions_inventory()`
 * no runtime (aba Segurança + testes de smoke). Aqui garantimos apenas
 * a semântica das categorias.
 */
type Categoria = "TRIGGER" | "CRON_ONLY" | "INTERNAL" | "ADMIN+CRON" | "ADMIN_RPC";

const EXPECTED: Record<Categoria, string[]> = {
  TRIGGER: ["service_role"],
  CRON_ONLY: ["service_role"],
  INTERNAL: ["authenticated", "service_role"],
  "ADMIN+CRON": ["authenticated", "service_role"],
  ADMIN_RPC: ["authenticated", "service_role"],
};

describe("Etapa 29B — matriz de permissões", () => {
  it("nenhuma categoria concede anon ou public", () => {
    for (const roles of Object.values(EXPECTED)) {
      expect(roles).not.toContain("anon");
      expect(roles).not.toContain("public");
      expect(roles).not.toContain("PUBLIC");
    }
  });

  it("TRIGGER e CRON_ONLY não são chamáveis por authenticated", () => {
    expect(EXPECTED.TRIGGER).not.toContain("authenticated");
    expect(EXPECTED.CRON_ONLY).not.toContain("authenticated");
  });

  it("categorias frontend expõem authenticated + service_role", () => {
    for (const cat of ["INTERNAL", "ADMIN+CRON", "ADMIN_RPC"] as Categoria[]) {
      expect(EXPECTED[cat]).toEqual(expect.arrayContaining(["authenticated", "service_role"]));
    }
  });
});
