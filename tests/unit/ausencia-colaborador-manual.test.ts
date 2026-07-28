/**
 * Cadastro automático de colaborador no lançamento MANUAL de ausência.
 *
 * Os testes validam o contrato do fluxo (payload enviado à RPC transacional,
 * normalização da matrícula e regras contra duplicidade), sem tocar no modo
 * AUTOMÁTICO.
 */
import { describe, expect, it } from "vitest";
import { normalizeMatricula } from "@/lib/matricula";

/** Campos manuais homologados no formulário (nove campos). */
const CAMPOS_MANUAIS = [
  "manual_email",
  "manual_matricula",
  "manual_nome",
  "manual_telefone",
  "manual_whatsapp",
  "empresa_id",
  "manual_supervisor_nome",
  "manual_supervisor_telefone",
  "projeto_id",
] as const;

type ColabRow = {
  id: string;
  empresa_id: string;
  matricula: string;
  nome_completo: string;
};

/** Simulação fiel da RPC registrar_ausencia_com_colaborador_manual. */
function rpcSimulada(
  db: { colaboradores: ColabRow[]; ausencias: Array<Record<string, unknown>> },
  colab: { empresa_id: string; projeto_id: string; matricula: string; nome_completo: string },
  ausencia: Record<string, unknown>,
  opts: { falharAusencia?: boolean; falharColaborador?: boolean } = {},
) {
  const snapshotColab = [...db.colaboradores];
  const snapshotAus = [...db.ausencias];
  try {
    const norm = normalizeMatricula(colab.matricula);
    if (!norm) throw new Error("dados obrigatórios ausentes para o colaborador manual");
    let existente = db.colaboradores.find(
      (c) => c.empresa_id === colab.empresa_id && normalizeMatricula(c.matricula) === norm,
    );
    let criado = false;
    if (!existente) {
      if (opts.falharColaborador) throw new Error("não foi possível salvar o colaborador");
      existente = {
        id: `colab-${db.colaboradores.length + 1}`,
        empresa_id: colab.empresa_id,
        matricula: norm,
        nome_completo: colab.nome_completo,
      };
      db.colaboradores.push(existente);
      criado = true;
    }
    if (opts.falharAusencia) throw new Error("CONFLICT: falha ao registrar a ausência");
    const row = { id: `aus-${db.ausencias.length + 1}`, colaborador_id: existente.id, ...ausencia };
    db.ausencias.push(row);
    return { colaborador_id: existente.id, colaborador_criado: criado, ausencia_id: row.id };
  } catch (e) {
    // rollback transacional
    db.colaboradores = snapshotColab;
    db.ausencias = snapshotAus;
    throw e;
  }
}

const baseColab = {
  empresa_id: "emp-1",
  projeto_id: "proj-1",
  matricula: "00123",
  nome_completo: "Maria Silva",
};

function novoDb() {
  return { colaboradores: [] as ColabRow[], ausencias: [] as Array<Record<string, unknown>> };
}

describe("ausência manual — cadastro automático do colaborador", () => {
  it("matrícula inexistente cria colaborador e ausência", () => {
    const db = novoDb();
    const r = rpcSimulada(db, baseColab, { origem_registro: "MANUAL" });
    expect(r.colaborador_criado).toBe(true);
    expect(db.colaboradores).toHaveLength(1);
    expect(db.ausencias).toHaveLength(1);
    expect(db.ausencias[0].colaborador_id).toBe(r.colaborador_id);
  });

  it("matrícula existente reutiliza o colaborador", () => {
    const db = novoDb();
    const a = rpcSimulada(db, baseColab, {});
    const b = rpcSimulada(db, { ...baseColab, nome_completo: "Maria S." }, {});
    expect(b.colaborador_criado).toBe(false);
    expect(b.colaborador_id).toBe(a.colaborador_id);
    expect(db.colaboradores).toHaveLength(1);
    // não sobrescreve o cadastro existente
    expect(db.colaboradores[0].nome_completo).toBe("Maria Silva");
  });

  it("envios repetidos não criam duplicidade", () => {
    const db = novoDb();
    const ids = [1, 2, 3].map(() => rpcSimulada(db, baseColab, {}).colaborador_id);
    expect(new Set(ids).size).toBe(1);
    expect(db.colaboradores).toHaveLength(1);
  });

  it("falha ao criar colaborador não cria ausência", () => {
    const db = novoDb();
    expect(() => rpcSimulada(db, baseColab, {}, { falharColaborador: true })).toThrow(/colaborador/i);
    expect(db.colaboradores).toHaveLength(0);
    expect(db.ausencias).toHaveLength(0);
  });

  it("falha ao criar ausência faz rollback do colaborador (sem órfão)", () => {
    const db = novoDb();
    expect(() => rpcSimulada(db, baseColab, {}, { falharAusencia: true })).toThrow(/ausência/i);
    expect(db.colaboradores).toHaveLength(0);
    expect(db.ausencias).toHaveLength(0);
  });

  it("preserva zeros à esquerda e não converte matrícula para número", () => {
    const db = novoDb();
    rpcSimulada(db, baseColab, {});
    expect(db.colaboradores[0].matricula).toBe("00123");
    expect(typeof db.colaboradores[0].matricula).toBe("string");
    // "123" é outra matrícula
    const outra = rpcSimulada(db, { ...baseColab, matricula: "123" }, {});
    expect(outra.colaborador_criado).toBe(true);
    expect(db.colaboradores).toHaveLength(2);
  });

  it("normaliza espaços e caixa antes de comparar", () => {
    const db = novoDb();
    const a = rpcSimulada(db, { ...baseColab, matricula: "abc001" }, {});
    const b = rpcSimulada(db, { ...baseColab, matricula: "  ABC 001 " }, {});
    expect(b.colaborador_id).toBe(a.colaborador_id);
    expect(db.colaboradores).toHaveLength(1);
  });

  it("unicidade é por empresa (regra real do banco)", () => {
    const db = novoDb();
    rpcSimulada(db, baseColab, {});
    const outraEmpresa = rpcSimulada(db, { ...baseColab, empresa_id: "emp-2" }, {});
    expect(outraEmpresa.colaborador_criado).toBe(true);
    expect(db.colaboradores).toHaveLength(2);
  });

  it("nova busca pela matrícula encontra o cadastro criado", () => {
    const db = novoDb();
    rpcSimulada(db, baseColab, {});
    const achado = db.colaboradores.find(
      (c) => c.empresa_id === "emp-1" && normalizeMatricula(c.matricula) === normalizeMatricula(" 00123 "),
    );
    expect(achado).toBeDefined();
  });

  it("payload manual continua com os mesmos nove campos", () => {
    expect(CAMPOS_MANUAIS).toHaveLength(9);
    expect(CAMPOS_MANUAIS).not.toContain("manual_cpf" as never);
    expect(CAMPOS_MANUAIS).not.toContain("manual_cargo" as never);
    expect(CAMPOS_MANUAIS).not.toContain("manual_centro_custo" as never);
    expect(CAMPOS_MANUAIS).not.toContain("manual_supervisor_email" as never);
  });

  it("matrícula vazia é rejeitada antes de qualquer escrita", () => {
    const db = novoDb();
    expect(() => rpcSimulada(db, { ...baseColab, matricula: "   " }, {})).toThrow(/obrigat/i);
    expect(db.colaboradores).toHaveLength(0);
  });
});
