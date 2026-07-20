import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Testes de superfície do escopo por Supervisor.
 * Complementar às policies RLS + trigger no banco (validação real de escopo).
 */

const NOVA = fs.readFileSync(
  path.resolve(__dirname, "../../src/routes/_authenticated/nova-ausencia.tsx"),
  "utf8",
);

describe("nova-ausencia — bloqueio de supervisor sem projetos", () => {
  it("define supervisorSemProjetos a partir do resultado da query", () => {
    expect(NOVA).toMatch(/supervisorSemProjetos/);
    expect(NOVA).toMatch(/isSupervisorOnly/);
  });

  it("exibe mensagem exigida pela especificação", () => {
    expect(NOVA).toMatch(/Você ainda não possui projetos vinculados\. Procure um administrador\./);
  });

  it("desabilita o fieldset quando supervisor sem projetos", () => {
    expect(NOVA).toMatch(/fieldset disabled=\{bloqueado \|\| \(supervisorSemProjetos && !isEdit\)\}/);
  });

  it("bloqueia submit quando supervisor sem projetos", () => {
    expect(NOVA).toMatch(/Sem projetos vinculados\. Procure um administrador\./);
  });
});
