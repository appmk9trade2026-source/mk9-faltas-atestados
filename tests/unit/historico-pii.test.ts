// Regressão simples do módulo Histórico — cobre pontos-chave da Onda 1/2.
import { describe, it, expect } from "vitest";
import { redactPayload, maskPhone, maskCpf, canViewMedical, canViewProviderMessageId } from "@/lib/pii";

describe("PII redaction", () => {
  it("mascara telefone completo mantendo apenas os últimos 4 dígitos", () => {
    expect(maskPhone("+5511987654321")).toBe("+55 (11) *****-4321");
    expect(maskPhone("11987654321")).toBe("(11) *****-4321");
  });
  it("mascara CPF preservando somente 3 primeiros e 2 finais", () => {
    expect(maskCpf("123.456.789-00")).toBe("123.***.***-00");
  });
  it("oculta CID para perfis sem permissão médica", () => {
    const out = redactPayload({ cid: "F41.1", nome: "Ana" }, ["rh"]) as Record<string, unknown>;
    expect(out.cid).toBe("[oculto]");
    expect(out.nome).toBe("Ana");
  });
  it("mostra CID para super_admin e compliance", () => {
    const out = redactPayload({ cid: "F41.1" }, ["super_admin"]) as Record<string, unknown>;
    expect(out.cid).toBe("F41.1");
    const out2 = redactPayload({ cid: "F41.1" }, ["compliance"]) as Record<string, unknown>;
    expect(out2.cid).toBe("F41.1");
  });
  it("nunca retorna telefone, token, senha ou api_key em claro", () => {
    const out = redactPayload(
      { telefone: "+5511987654321", token: "abc", senha: "123", api_key: "xxx", authorization: "Bearer y" },
      ["super_admin"],
    ) as Record<string, unknown>;
    expect(String(out.telefone)).toContain("*");
    expect(out.token).toBe("[oculto]");
    expect(out.senha).toBe("[oculto]");
    expect(out.api_key).toBe("[oculto]");
    expect(out.authorization).toBe("[oculto]");
  });
  it("recursivamente redige arrays e objetos aninhados", () => {
    const out = redactPayload(
      { items: [{ telefone: "+5511987654321", cid: "F32" }] },
      ["rh"],
    ) as { items: Array<Record<string, unknown>> };
    expect(out.items[0].cid).toBe("[oculto]");
    expect(String(out.items[0].telefone)).toContain("*");
  });
});

describe("Permissões de exibição", () => {
  it("canViewMedical libera super_admin e compliance", () => {
    expect(canViewMedical(["super_admin"])).toBe(true);
    expect(canViewMedical(["compliance"])).toBe(true);
    expect(canViewMedical(["rh"])).toBe(false);
    expect(canViewMedical([])).toBe(false);
    expect(canViewMedical(null)).toBe(false);
  });
  it("canViewProviderMessageId restringe a super_admin", () => {
    expect(canViewProviderMessageId(["super_admin"])).toBe(true);
    expect(canViewProviderMessageId(["compliance"])).toBe(false);
    expect(canViewProviderMessageId(["rh"])).toBe(false);
  });
});
