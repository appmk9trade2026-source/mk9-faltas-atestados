import { describe, expect, it } from "vitest";
import { assertMutableEnv, detectEnv, isTestArtifact } from "@/lib/test-guard";

describe("test-guard", () => {
  it("classifies environments", () => {
    expect(detectEnv("http://localhost:8080")).toBe("development");
    expect(detectEnv("https://id-preview--abc.lovable.app")).toBe("preview");
    expect(detectEnv("https://project--x-dev.lovable.app")).toBe("preview");
    expect(detectEnv("https://mk9-staff-hub.lovable.app")).toBe("production");
    expect(detectEnv("https://homolog.mk9.example")).toBe("homologacao");
  });

  it("blocks destructive tests against production", () => {
    expect(() => assertMutableEnv("https://mk9-staff-hub.lovable.app")).toThrow(/blocked/);
    expect(() => assertMutableEnv("http://localhost:8080")).not.toThrow();
    expect(() => assertMutableEnv("https://id-preview--abc.lovable.app")).not.toThrow();
  });

  it("recognises test-only artefacts", () => {
    expect(isTestArtifact("AUTOMATED_TEST_matricula")).toBe(true);
    expect(isTestArtifact("E2E_empresa")).toBe(true);
    expect(isTestArtifact("TEST_x")).toBe(true);
    expect(isTestArtifact("João")).toBe(false);
    expect(isTestArtifact(null)).toBe(false);
  });
});
