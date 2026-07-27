import { describe, expect, it } from "vitest";
import { validarSenhaDefinitiva } from "@/lib/senha-forte";

const ctx = { senhaTemporaria: "12345678", email: "krlao22@yahoo.com.br", matricula: "MK9-1234" };

describe("validarSenhaDefinitiva", () => {
  it("bloqueia a senha temporária padrão", () => {
    expect(validarSenhaDefinitiva("12345678", ctx).ok).toBe(false);
  });

  it("bloqueia senhas comuns e sequências", () => {
    for (const s of ["senha123", "password1", "abcdefg1", "11111111"]) {
      expect(validarSenhaDefinitiva(s, ctx).ok, s).toBe(false);
    }
  });

  it("bloqueia senha derivada do e-mail ou da matrícula", () => {
    expect(validarSenhaDefinitiva("krlao22yahoo", ctx).ok).toBe(false);
    expect(validarSenhaDefinitiva("mk9-1234abc", ctx).ok).toBe(false);
  });

  it("exige tamanho mínimo, letras e números", () => {
    expect(validarSenhaDefinitiva("Ab1c", ctx).ok).toBe(false);
    expect(validarSenhaDefinitiva("somenteletras", ctx).ok).toBe(false);
  });

  it("aceita uma senha pessoal forte", () => {
    expect(validarSenhaDefinitiva("Trilha9Verde!", ctx).ok).toBe(true);
  });
});
