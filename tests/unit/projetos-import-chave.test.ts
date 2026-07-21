import { describe, it, expect } from "vitest";

// Replica local da chave lógica usada em src/lib/projetos.functions.ts
// (buildPreview) e no RPC public.import_projetos_atomic.
// Chave = Empresa + Projeto (nome). Código NÃO faz parte da chave — é
// gerado automaticamente pelo sistema (PRJ-000001).

function normEmpresa(v: string) { return (v ?? "").trim().toLowerCase(); }
function normNome(v: string) { return (v ?? "").trim().replace(/\s+/g, " ").toLowerCase(); }
function key(empresa: string, nome: string) {
  return `${normEmpresa(empresa)}::${normNome(nome)}`;
}

function duplicatesInFile(rows: Array<{ linha: number; empresa: string; nome: string }>) {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const k = key(r.empresa, r.nome);
    const arr = map.get(k) ?? [];
    arr.push(r.linha);
    map.set(k, arr);
  }
  return [...map.values()].filter((v) => v.length > 1);
}

describe("Importação de Projetos — chave lógica Empresa + Projeto", () => {
  it("CZB com nomes diferentes NÃO é duplicado", () => {
    const rows = [
      { linha: 2, empresa: "CZB", nome: "ADMINISTRATIVO 61" },
      { linha: 3, empresa: "CZB", nome: "ADMINISTRATIVO 62" },
      { linha: 4, empresa: "CZB", nome: "ADMINISTRATIVO BA" },
    ];
    expect(duplicatesInFile(rows)).toEqual([]);
  });

  it("Mesma Empresa + mesmo Projeto (com espaços/caixa distintos) É duplicado", () => {
    const rows = [
      { linha: 2, empresa: "CZB", nome: "ADMINISTRATIVO 61" },
      { linha: 8, empresa: "czb", nome: "administrativo  61" },
    ];
    const dups = duplicatesInFile(rows);
    expect(dups).toHaveLength(1);
    expect(dups[0].sort()).toEqual([2, 8]);
  });

  it("Empresas diferentes + mesmo Projeto NÃO é duplicado", () => {
    const rows = [
      { linha: 2, empresa: "CZB", nome: "ADMINISTRATIVO 61" },
      { linha: 3, empresa: "R&G", nome: "ADMINISTRATIVO 61" },
    ];
    expect(duplicatesInFile(rows)).toEqual([]);
  });

  it("Normaliza espaços e caixa para comparação", () => {
    expect(key("  CZB ", "  Administrativo   61 "))
      .toBe(key("czb", "administrativo 61"));
  });

  it("Formato de código interno gerado pelo sistema", () => {
    const gerar = (n: number) => `PRJ-${String(n).padStart(6, "0")}`;
    expect(gerar(1)).toBe("PRJ-000001");
    expect(gerar(42)).toBe("PRJ-000042");
    expect(gerar(999999)).toBe("PRJ-999999");
  });
});
