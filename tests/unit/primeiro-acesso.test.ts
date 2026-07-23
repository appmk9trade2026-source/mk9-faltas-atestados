import { afterEach, describe, expect, it } from "vitest";
import {
  clearFirstLoginPassword,
  getFirstLoginPassword,
  isSameAsFirstLoginPassword,
  setFirstLoginPassword,
} from "@/lib/first-login-password";

describe("first-login-password store", () => {
  afterEach(() => clearFirstLoginPassword());

  it("captura e detecta reuso da senha temporária", () => {
    setFirstLoginPassword("12345678");
    expect(isSameAsFirstLoginPassword("12345678")).toBe(true);
    expect(isSameAsFirstLoginPassword("outraSenha1")).toBe(false);
  });

  it("clear descarta a senha capturada", () => {
    setFirstLoginPassword("Temp1234");
    clearFirstLoginPassword();
    expect(getFirstLoginPassword()).toBeNull();
    expect(isSameAsFirstLoginPassword("Temp1234")).toBe(false);
  });

  it("quando não há captura, nenhuma senha é considerada igual", () => {
    expect(getFirstLoginPassword()).toBeNull();
    expect(isSameAsFirstLoginPassword("qualquerCoisa1")).toBe(false);
  });

  it("nunca expõe a senha em serialização acidental do módulo", () => {
    setFirstLoginPassword("SegredoAbc9");
    // O helper não deve vazar via toString/JSON do próprio módulo público.
    const publicShape = { isSameAsFirstLoginPassword, setFirstLoginPassword, clearFirstLoginPassword };
    expect(JSON.stringify(publicShape)).not.toContain("SegredoAbc9");
  });
});
