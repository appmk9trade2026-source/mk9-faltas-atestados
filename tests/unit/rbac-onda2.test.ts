// RBAC Fase 3 — Onda 2 (Empresas, Projetos, Colaboradores).
// Contrato de erro e cobertura de PermissionCodes.

import { describe, it, expect } from "vitest";
import { parseRbacError, friendlyRbacError } from "@/lib/rbac/errors";
import { PERMISSION_MAP } from "@/lib/permissions-map";

describe("RBAC Onda 2 — contratos de erro", () => {
  it("mapeia CONFLICT (código de protocolo em uso) mantendo o texto", () => {
    const shape = parseRbacError(new Error("CONFLICT: código de protocolo já está em uso"));
    expect(shape.code).toBe("CONFLICT");
    expect(shape.message).toMatch(/código de protocolo já está em uso/);
  });

  it("mapeia PERMISSION_DENIED (empresa)", () => {
    const f = friendlyRbacError(new Error("PERMISSION_DENIED: sem permissão"));
    expect(f.title).toMatch(/permissão/i);
  });

  it("mapeia PROJECT_SCOPE_DENIED (projeto)", () => {
    const f = friendlyRbacError(new Error("PROJECT_SCOPE_DENIED: bloqueado por política de acesso"));
    expect(f.title).toMatch(/projeto/i);
  });

  it("mapeia COLLABORATOR_SCOPE_DENIED (colaborador)", () => {
    const f = friendlyRbacError(new Error("COLLABORATOR_SCOPE_DENIED: bloqueado por política de acesso"));
    expect(f.title).toMatch(/colaborador/i);
  });

  it("mapeia INVALID_PAYLOAD com truncamento aplicado", () => {
    const shape = parseRbacError(new Error("INVALID_PAYLOAD: matrícula obrigatória"));
    expect(shape.code).toBe("INVALID_PAYLOAD");
    expect(shape.message).toContain("matrícula");
  });

  it("mapeia CONFLICT bloqueando alteração de código com ausências", () => {
    const shape = parseRbacError(new Error("CONFLICT: código de protocolo não pode ser alterado — projeto já possui ausências registradas"));
    expect(shape.code).toBe("CONFLICT");
    expect(shape.message).toMatch(/ausências/);
  });
});

describe("RBAC Onda 2 — PermissionCodes utilizadas", () => {
  const required = [
    "createCompany", "updateCompany",
    "createProject", "updateProject",
    "createEmployee", "updateEmployee",
  ] as const;

  it("todas as chaves usadas nas server functions estão no PERMISSION_MAP", () => {
    for (const k of required) {
      expect(PERMISSION_MAP[k], `${k} ausente do PERMISSION_MAP`).toBeTruthy();
    }
  });

  it("nenhum código aponta para permissão inexistente (sanidade)", () => {
    for (const k of required) {
      expect(PERMISSION_MAP[k]).toMatch(/^(empresa|projeto|colaborador)\.(criar|editar|excluir|visualizar)$/);
    }
  });
});
