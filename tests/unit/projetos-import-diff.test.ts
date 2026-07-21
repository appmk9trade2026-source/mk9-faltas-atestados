import { describe, it, expect } from "vitest";

/**
 * Contratos da lógica de diff da prévia de importação de Projetos.
 *
 * Mantém em sincronia com `buildPreview` em `src/lib/projetos.functions.ts`
 * (comparação campo a campo entre a planilha e o projeto atual).
 */

type ImportRow = {
  linha: number;
  cnpj_empresa: string;
  codigo_projeto: string;
  nome_projeto: string;
  status: string;
  descricao?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  observacoes?: string | null;
};
type Existing = {
  ativo: boolean;
  nome: string;
  descricao: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
};
type Diff = { campo: string; atual: string | null; novo: string | null };
type Acao = "CRIAR" | "ATUALIZAR" | "ATIVAR" | "DESATIVAR" | "SEM_ALTERACAO";

function nullIfBlank(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function classify(r: ImportRow, existing: Existing | null): { acao: Acao; diff: Diff[] } {
  const status = r.status.trim().toUpperCase();
  const wantAtivo = status === "ATIVO";
  const descricao = nullIfBlank(r.descricao);
  const observacoes = nullIfBlank(r.observacoes);
  const dtIni = nullIfBlank(r.data_inicio);
  const dtFim = nullIfBlank(r.data_fim);
  const nome = r.nome_projeto.trim();

  if (!existing) return { acao: "CRIAR", diff: [] };

  const diff: Diff[] = [];
  const atualStatus = existing.ativo ? "ATIVO" : "INATIVO";
  const novoStatus = wantAtivo ? "ATIVO" : "INATIVO";
  if (existing.nome !== nome) diff.push({ campo: "nome_projeto", atual: existing.nome, novo: nome });
  if (atualStatus !== novoStatus) diff.push({ campo: "status", atual: atualStatus, novo: novoStatus });
  if ((existing.descricao ?? null) !== descricao) diff.push({ campo: "descricao", atual: existing.descricao, novo: descricao });
  if ((existing.data_inicio ?? null) !== dtIni) diff.push({ campo: "data_inicio", atual: existing.data_inicio, novo: dtIni });
  if ((existing.data_fim ?? null) !== dtFim) diff.push({ campo: "data_fim", atual: existing.data_fim, novo: dtFim });
  if ((existing.observacoes ?? null) !== observacoes) diff.push({ campo: "observacoes", atual: existing.observacoes, novo: observacoes });

  const statusMudou = atualStatus !== novoStatus;
  const outrosMudaram = diff.some((d) => d.campo !== "status");
  if (!statusMudou && !outrosMudaram) return { acao: "SEM_ALTERACAO", diff };
  if (statusMudou && !outrosMudaram) return { acao: wantAtivo ? "ATIVAR" : "DESATIVAR", diff };
  return { acao: "ATUALIZAR", diff };
}

const base: Existing = {
  ativo: true,
  nome: "Projeto Armazém",
  descricao: "Operação logística",
  data_inicio: "2025-01-01",
  data_fim: null,
  observacoes: null,
};

describe("Prévia de Importação de Projetos — diff/ação", () => {
  it("projeto inexistente → CRIAR", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "NOVO01",
      nome_projeto: "Novo", status: "ATIVO",
    }, null);
    expect(out.acao).toBe("CRIAR");
    expect(out.diff).toEqual([]);
  });

  it("dados iguais → SEM_ALTERACAO (sem diff)", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Projeto Armazém", status: "ATIVO",
      descricao: "Operação logística", data_inicio: "2025-01-01",
    }, base);
    expect(out.acao).toBe("SEM_ALTERACAO");
    expect(out.diff).toEqual([]);
  });

  it("campos opcionais em branco não geram diff quando o atual também é vazio", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Projeto Armazém", status: "ATIVO",
      descricao: "Operação logística", data_inicio: "2025-01-01",
      observacoes: "", data_fim: "",
    }, base);
    expect(out.acao).toBe("SEM_ALTERACAO");
  });

  it("apenas nome diferente → ATUALIZAR com diff de nome", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Projeto Armazém Atualizado", status: "ATIVO",
      descricao: "Operação logística", data_inicio: "2025-01-01",
    }, base);
    expect(out.acao).toBe("ATUALIZAR");
    expect(out.diff).toEqual([
      { campo: "nome_projeto", atual: "Projeto Armazém", novo: "Projeto Armazém Atualizado" },
    ]);
  });

  it("ATIVO → INATIVO sem outras mudanças → DESATIVAR", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Projeto Armazém", status: "INATIVO",
      descricao: "Operação logística", data_inicio: "2025-01-01",
    }, base);
    expect(out.acao).toBe("DESATIVAR");
    expect(out.diff.map((d) => d.campo)).toEqual(["status"]);
  });

  it("INATIVO → ATIVO sem outras mudanças → ATIVAR", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Projeto Armazém", status: "ATIVO",
      descricao: "Operação logística", data_inicio: "2025-01-01",
    }, { ...base, ativo: false });
    expect(out.acao).toBe("ATIVAR");
  });

  it("status + nome mudam → ATUALIZAR (não DESATIVAR)", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Novo Nome", status: "INATIVO",
      descricao: "Operação logística", data_inicio: "2025-01-01",
    }, base);
    expect(out.acao).toBe("ATUALIZAR");
    expect(out.diff.map((d) => d.campo).sort()).toEqual(["nome_projeto", "status"]);
  });

  it("descrição limpada explicitamente → diff de descricao", () => {
    const out = classify({
      linha: 2, cnpj_empresa: "12345678000190", codigo_projeto: "ARMT",
      nome_projeto: "Projeto Armazém", status: "ATIVO",
      descricao: "", data_inicio: "2025-01-01",
    }, base);
    expect(out.acao).toBe("ATUALIZAR");
    expect(out.diff).toEqual([{ campo: "descricao", atual: "Operação logística", novo: null }]);
  });
});

describe("Modelo XLSX — abas obrigatórias", () => {
  it("deve exportar downloadProjetosTemplate", async () => {
    const mod = await import("@/lib/projetos-template");
    expect(typeof mod.downloadProjetosTemplate).toBe("function");
  });
});
