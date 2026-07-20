import { describe, it, expect } from "vitest";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";

describe("RBAC — helper hasPermission", () => {
  it("retorna false para conjunto nulo/vazio", () => {
    expect(hasPermission(null, "ausencia.criar")).toBe(false);
    expect(hasPermission(new Set(), "ausencia.criar")).toBe(false);
  });

  it("retorna true quando a permissão está no conjunto", () => {
    const s = new Set(["ausencia.criar", "dashboard.visualizar"]);
    expect(hasPermission(s, "ausencia.criar")).toBe(true);
    expect(hasPermission(s, "dashboard.visualizar")).toBe(true);
  });

  it("retorna false para permissão ausente", () => {
    const s = new Set(["dashboard.visualizar"]);
    expect(hasPermission(s, "ausencia.excluir")).toBe(false);
  });

  it("ALL_PERMISSIONS cobre os 33 códigos da matriz (Fase 2 inclui permissao.*)", () => {
    expect(ALL_PERMISSIONS.length).toBe(33);
    expect(new Set(ALL_PERMISSIONS).size).toBe(33);
    expect(ALL_PERMISSIONS).toContain("permissao.visualizar");
    expect(ALL_PERMISSIONS).toContain("permissao.editar");
  });
});
