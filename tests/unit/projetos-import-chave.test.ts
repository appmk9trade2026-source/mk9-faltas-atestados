import { describe, it, expect } from "vitest";

// Replica local da chave lógica usada em src/lib/projetos.functions.ts
// (buildPreview) e no RPC public.import_projetos_atomic.

function normEmpresa(v: string) { return (v ?? "").trim().toLowerCase(); }
function normNome(v: string) { return (v ?? "").trim().replace(/\s+/g, " ").toLowerCase(); }
function normCodigo(v: string) { return (v ?? "").trim().toUpperCase(); }
function key(empresa: string, nome: string, codigo: string) {
  return `${normEmpresa(empresa)}::${normNome(nome)}::${normCodigo(codigo)}`;
}

function duplicatesInFile(rows: Array<{ linha: number; empresa: string; nome: string; codigo: string }>) {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const k = key(r.empresa, r.nome, r.codigo);
    const arr = map.get(k) ?? [];
    arr.push(r.linha);
    map.set(k, arr);
  }
  return [...map.values()].filter((v) => v.length > 1);
}

describe("Importação de Projetos — chave lógica empresa + nome + código", () => {
  it("CZB + ADM em nomes diferentes NÃO é duplicado (exemplo real)", () => {
    const rows = [
      { linha: 2, empresa: "CZB", nome: "ADMINISTRATIVO 61", codigo: "ADM" },
      { linha: 3, empresa: "CZB", nome: "ADMINISTRATIVO 62", codigo: "ADM" },
      { linha: 4, empresa: "CZB", nome: "ADMINISTRATIVO BA", codigo: "ADM" },
      { linha: 5, empresa: "CZB", nome: "ADMINISTRATIVO MG", codigo: "ADM" },
      { linha: 6, empresa: "CZB", nome: "ADMINISTRATIVO MT", codigo: "ADM" },
    ];
    expect(duplicatesInFile(rows)).toEqual([]);
  });

  it("R&G + SIST em nomes diferentes NÃO é duplicado", () => {
    const rows = [
      { linha: 2, empresa: "R&G", nome: "AMBEV AS ROTA PB", codigo: "SIST" },
      { linha: 3, empresa: "R&G", nome: "AMBEV REDE DF", codigo: "SIST" },
      { linha: 4, empresa: "R&G", nome: "AMBEV AS DIRETA AC", codigo: "SIST" },
      { linha: 5, empresa: "R&G", nome: "AMBEV LIDERANÇA", codigo: "SIST" },
    ];
    expect(duplicatesInFile(rows)).toEqual([]);
  });

  it("Mesma Empresa + mesmo Nome + mesmo Código É duplicado", () => {
    const rows = [
      { linha: 2, empresa: "CZB", nome: "ADMINISTRATIVO 61", codigo: "ADM" },
      { linha: 8, empresa: "czb", nome: "administrativo  61", codigo: "adm" },
    ];
    const dups = duplicatesInFile(rows);
    expect(dups).toHaveLength(1);
    expect(dups[0].sort()).toEqual([2, 8]);
  });

  it("Empresa diferente + mesmo Nome + mesmo Código NÃO é duplicado", () => {
    const rows = [
      { linha: 2, empresa: "CZB", nome: "ADMINISTRATIVO 61", codigo: "ADM" },
      { linha: 3, empresa: "R&G", nome: "ADMINISTRATIVO 61", codigo: "ADM" },
    ];
    expect(duplicatesInFile(rows)).toEqual([]);
  });

  it("Normaliza espaços e caixa para comparação", () => {
    expect(key("  CZB ", "  Administrativo   61 ", " adm "))
      .toBe(key("czb", "administrativo 61", "ADM"));
  });

  it("Chave logicamente diferente de empresa+codigo (regra antiga)", () => {
    const kNovo = key("CZB", "ADMINISTRATIVO 61", "ADM");
    const kOutro = key("CZB", "ADMINISTRATIVO 62", "ADM");
    expect(kNovo).not.toBe(kOutro);
  });
});
