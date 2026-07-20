import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ETAPA 2 — PERMISSÕES POR PERFIL
 *
 * Parses the hardcoded sidebar item list and asserts each role sees exactly
 * the surfaces it should — no leakage of admin routes to lower-privilege
 * roles. Complementary to Supabase RLS (defence in depth).
 */

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../src/components/layout/app-sidebar.tsx"),
  "utf8",
);

type Role = "super_admin" | "rh" | "supervisor" | "compliance";
type Item = { title: string; url: string; roles: Role[] };

function parseItems(): Item[] {
  const items: Item[] = [];
  const re = /\{\s*title:\s*"([^"]+)",\s*url:\s*"([^"]+)",\s*icon:\s*[A-Za-z0-9_]+,\s*roles:\s*\[([^\]]+)\]\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC)) !== null) {
    const roles = m[3]
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean) as Role[];
    items.push({ title: m[1], url: m[2], roles });
  }
  return items;
}

const ITEMS = parseItems();

function visibleFor(role: Role): string[] {
  return ITEMS.filter((it) => it.roles.includes(role)).map((it) => it.title);
}

const EXPECT: Record<Role, { must: string[]; mustNot: string[] }> = {
  super_admin: {
    must: ["Dashboard", "Configurações", "Auditoria", "Usuários", "Homologação", "Saúde do Sistema", "Documentação", "Permissões"],
    mustNot: [],
  },
  rh: {
    must: ["Dashboard", "Painel do RH", "Colaboradores", "Importações", "Configurações", "Auditoria", "Homologação", "Usuários"],
    mustNot: ["Saúde do Sistema", "Documentação", "Permissões"],
  },
  compliance: {
    must: ["Dashboard", "Auditoria", "Relatórios", "Homologação", "Usuários"],
    mustNot: ["Configurações", "Nova Ausência", "Painel do RH", "Saúde do Sistema", "Documentação", "Permissões"],
  },
  supervisor: {
    must: ["Dashboard", "Nova Ausência", "Ausências", "Colaboradores", "Alertas", "Notificações"],
    mustNot: ["Configurações", "Auditoria", "Usuários", "Homologação", "Painel do RH", "Relatórios", "Saúde do Sistema", "Documentação", "Importações", "Comunicações", "WhatsApp Admin", "Permissões"],
  },
};

describe("sidebar item registry parsed", () => {
  it("finds all sidebar items", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(15);
  });
});

describe.each(Object.entries(EXPECT))("permissions for role: %s", (role, spec) => {
  const vis = visibleFor(role as Role);
  it.each(spec.must)("shows %s", (label) => {
    expect(vis, `role ${role} missing ${label}`).toContain(label);
  });
  it.each(spec.mustNot)("hides %s", (label) => {
    expect(vis, `role ${role} should NOT see ${label}`).not.toContain(label);
  });
});
