import { describe, it, expect } from "vitest";
import { friendlyRbacError } from "@/lib/rbac/errors";

describe("RBAC Onda 1 — friendlyRbacError", () => {
  it("mapeia PERMISSION_DENIED", () => {
    const f = friendlyRbacError(new Error("PERMISSION_DENIED: sem permissão"));
    expect(f.title.toLowerCase()).toMatch(/permiss/);
  });
  it("mapeia PROJECT_SCOPE_DENIED", () => {
    const f = friendlyRbacError(new Error("PROJECT_SCOPE_DENIED: fora do escopo"));
    expect(f.title.toLowerCase()).toMatch(/escopo|projeto|acesso/);
  });
  it("mapeia INVALID_PAYLOAD", () => {
    const f = friendlyRbacError(new Error("INVALID_PAYLOAD: campo x"));
    expect(f.title.toLowerCase()).toMatch(/inválid|dado/);
  });
  it("mapeia AUTH_REQUIRED", () => {
    const f = friendlyRbacError(new Error("AUTH_REQUIRED"));
    expect(f.title.toLowerCase()).toMatch(/autentic|sess/);
  });
  it("fallback genérico", () => {
    const f = friendlyRbacError(new Error("algo estranho"));
    expect(f.title).toBeTruthy();
  });
});
