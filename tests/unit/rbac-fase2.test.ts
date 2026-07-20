import { describe, it, expect } from "vitest";
import { PERMISSION_MAP } from "@/lib/permissions-map";
import { ALL_PERMISSIONS } from "@/lib/permissions";

/**
 * RBAC Fase 2 — garante que cada entrada do mapa aponta para um
 * PermissionCode válido presente em ALL_PERMISSIONS.
 */
describe("PERMISSION_MAP", () => {
  const perms = new Set<string>(ALL_PERMISSIONS);
  it("todo código do mapa existe em ALL_PERMISSIONS", () => {
    for (const [key, code] of Object.entries(PERMISSION_MAP)) {
      expect(perms.has(code), `${key} → ${code} não está em ALL_PERMISSIONS`).toBe(true);
    }
  });

  it("cobre as mutações críticas listadas na Fase 2", () => {
    const required = [
      "createAbsence", "updateAbsence", "deleteAbsence",
      "createUser", "updateUser",
      "createProject", "updateProject",
      "exportReport", "updatePermissions",
    ] as const;
    for (const k of required) {
      expect(PERMISSION_MAP[k]).toBeDefined();
    }
  });
});

/**
 * Simula a resolução `deny > allow > perfil` que public.has_permission usa.
 * Serve de documentação executável — o código real vive no banco.
 */
function resolvePermission(opts: {
  fromRole: boolean;
  allow?: boolean;
  deny?: boolean;
}): boolean {
  if (opts.deny) return false;
  if (opts.allow) return true;
  return opts.fromRole;
}

describe("RBAC — precedência deny > allow > perfil", () => {
  it("perfil concede", () => {
    expect(resolvePermission({ fromRole: true })).toBe(true);
  });
  it("allow individual concede quando perfil não concede", () => {
    expect(resolvePermission({ fromRole: false, allow: true })).toBe(true);
  });
  it("deny individual prevalece sobre allow", () => {
    expect(resolvePermission({ fromRole: true, allow: true, deny: true })).toBe(false);
  });
  it("sem nada retorna false", () => {
    expect(resolvePermission({ fromRole: false })).toBe(false);
  });
});
