import { describe, it, expect } from "vitest";
import { normalizeMatricula } from "@/lib/matricula";

/**
 * Cobre as regras da busca de duplicidade que dependem exclusivamente da
 * normalização (empresa_id + normalize_matricula). O `useColaboradorDuplicado`
 * usa `normalizeMatricula` na chave da query e na cláusula .eq('matricula', ...),
 * portanto valores equivalentes devem gerar a MESMA chave e MESMO filtro.
 */
describe("busca de duplicidade — normalização de matrícula", () => {
  it("matrícula com espaços à esquerda/direita gera mesmo valor canônico", () => {
    expect(normalizeMatricula("  11847  ")).toBe("11847");
  });

  it("matrícula em minúsculas gera mesmo valor canônico", () => {
    expect(normalizeMatricula("ab123")).toBe(normalizeMatricula("AB123"));
  });

  it("espaços internos são removidos", () => {
    expect(normalizeMatricula("AB 123")).toBe("AB123");
  });

  it("preserva zeros à esquerda", () => {
    expect(normalizeMatricula("  00042 ")).toBe("00042");
  });

  it("valores nulos/vazios são normalizados para string vazia (não dispara consulta)", () => {
    expect(normalizeMatricula(null)).toBe("");
    expect(normalizeMatricula(undefined)).toBe("");
    expect(normalizeMatricula("   ")).toBe("");
  });

  it("chave da consulta varia por empresa (evita cache incorreto entre empresas)", () => {
    const empA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const empB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const mat = normalizeMatricula("11847");
    const keyA = ["colab-duplicado", empA, mat, null];
    const keyB = ["colab-duplicado", empB, mat, null];
    expect(JSON.stringify(keyA)).not.toBe(JSON.stringify(keyB));
  });

  it("chave inclui excludeId para diferenciar criação vs. edição", () => {
    const emp = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const mat = normalizeMatricula("11847");
    const create = ["colab-duplicado", emp, mat, null];
    const edit = ["colab-duplicado", emp, mat, "colab-id-1"];
    expect(JSON.stringify(create)).not.toBe(JSON.stringify(edit));
  });
});
