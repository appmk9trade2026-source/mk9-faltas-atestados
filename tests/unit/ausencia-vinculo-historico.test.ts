/**
 * Rotina administrativa de vínculo histórico de ausências manuais.
 *
 * Valida o contrato das RPCs `ausencias_manuais_orfas_sugestoes` (somente
 * prévia) e `vincular_ausencias_manuais_historico` (execução sob confirmação),
 * garantindo que nenhum backfill silencioso ocorre e que o snapshot manual_*
 * é preservado.
 */
import { describe, expect, it } from "vitest";
import { normalizeMatricula } from "@/lib/matricula";
import { resolveAusenciaIdentidade } from "@/lib/ausencia-identidade";

type Ausencia = {
  id: string;
  empresa_id: string;
  projeto_id: string;
  origem_registro: "MANUAL" | "AUTOMATICO";
  colaborador_id: string | null;
  manual_matricula: string | null;
  manual_nome: string | null;
  manual_supervisor_nome?: string | null;
};

type Colaborador = { id: string; empresa_id: string; projeto_id: string; matricula: string; nome_completo: string; origem: string };

function makeDb() {
  const ausencias: Ausencia[] = [
    {
      id: "a1",
      empresa_id: "emp-1",
      projeto_id: "prj-1",
      origem_registro: "MANUAL",
      colaborador_id: null,
      manual_matricula: "2713",
      manual_nome: "GEOVANI MAGALHAES DA SILVA",
      manual_supervisor_nome: "JONAS NETO FERREIRA XAROPA",
    },
    {
      id: "a2",
      empresa_id: "emp-1",
      projeto_id: "prj-1",
      origem_registro: "MANUAL",
      colaborador_id: null,
      manual_matricula: " 2713 ",
      manual_nome: "GEOVANI MAGALHAES DA SILVA",
      manual_supervisor_nome: "JONAS NETO FERREIRA XAROPA",
    },
    {
      id: "a3",
      empresa_id: "emp-1",
      projeto_id: "prj-1",
      origem_registro: "AUTOMATICO",
      colaborador_id: "c-existente",
      manual_matricula: null,
      manual_nome: null,
    },
  ];
  const colaboradores: Colaborador[] = [];
  return { ausencias, colaboradores };
}

/** Prévia: agrupa por (empresa, matrícula normalizada) somente manuais órfãs. */
function sugestoes(db: ReturnType<typeof makeDb>, papeis: string[]) {
  if (!papeis.some((r) => r === "super_admin" || r === "rh")) return [];
  const grupos = new Map<string, { empresa_id: string; mat: string; ausencia_ids: string[]; nomes: Set<string> }>();
  for (const a of db.ausencias) {
    if (a.origem_registro !== "MANUAL" || a.colaborador_id) continue;
    const mat = normalizeMatricula(a.manual_matricula);
    if (!mat || !a.manual_nome?.trim()) continue;
    const k = `${a.empresa_id}|${mat}`;
    const g = grupos.get(k) ?? { empresa_id: a.empresa_id, mat, ausencia_ids: [], nomes: new Set<string>() };
    g.ausencia_ids.push(a.id);
    g.nomes.add(a.manual_nome.trim());
    grupos.set(k, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, total: g.ausencia_ids.length, nomes: [...g.nomes] }));
}

/** Execução sob confirmação administrativa. */
function vincular(
  db: ReturnType<typeof makeDb>,
  papeis: string[],
  args: { matricula: string; empresa_id: string; ausencia_ids: string[]; confirmar: boolean },
) {
  if (!papeis.some((r) => r === "super_admin" || r === "rh")) throw new Error("not authorized");
  if (!args.confirmar) throw new Error("confirmação administrativa obrigatória");
  const mat = normalizeMatricula(args.matricula);
  const elegiveis = db.ausencias.filter(
    (a) =>
      args.ausencia_ids.includes(a.id) &&
      a.origem_registro === "MANUAL" &&
      a.colaborador_id === null &&
      a.empresa_id === args.empresa_id &&
      normalizeMatricula(a.manual_matricula) === mat,
  );
  if (!elegiveis.length) throw new Error("nenhuma ausência elegível para vínculo");
  let colab = db.colaboradores.find((c) => c.empresa_id === args.empresa_id && normalizeMatricula(c.matricula) === mat);
  let criado = false;
  if (!colab) {
    colab = {
      id: `c-${mat}`,
      empresa_id: args.empresa_id,
      projeto_id: elegiveis[0].projeto_id,
      matricula: mat,
      nome_completo: elegiveis[0].manual_nome!,
      origem: "MANUAL",
    };
    db.colaboradores.push(colab);
    criado = true;
  }
  for (const a of elegiveis) a.colaborador_id = colab.id;
  return { colaborador_id: colab.id, colaborador_criado: criado, ausencias_vinculadas: elegiveis.length };
}

describe("vínculo histórico de ausências manuais", () => {
  it("não executa backfill automático: apenas lista sugestões", () => {
    const db = makeDb();
    const s = sugestoes(db, ["super_admin"]);
    expect(s).toHaveLength(1);
    expect(s[0].total).toBe(2);
    expect(db.ausencias.every((a) => a.origem_registro !== "MANUAL" || a.colaborador_id === null)).toBe(true);
    expect(db.colaboradores).toHaveLength(0);
  });

  it("agrupa por matrícula normalizada, preservando o texto original", () => {
    const s = sugestoes(makeDb(), ["rh"]);
    expect(s[0].mat).toBe("2713");
    expect(s[0].ausencia_ids).toEqual(["a1", "a2"]);
  });

  it("ignora registros automáticos e manuais já vinculados", () => {
    const db = makeDb();
    db.ausencias[0].colaborador_id = "c-x";
    const s = sugestoes(db, ["super_admin"]);
    expect(s[0].ausencia_ids).toEqual(["a2"]);
  });

  it("exige papel administrativo", () => {
    expect(sugestoes(makeDb(), ["supervisor"])).toHaveLength(0);
    expect(() =>
      vincular(makeDb(), ["supervisor"], {
        matricula: "2713",
        empresa_id: "emp-1",
        ausencia_ids: ["a1"],
        confirmar: true,
      }),
    ).toThrow(/not authorized/);
  });

  it("exige confirmação explícita", () => {
    expect(() =>
      vincular(makeDb(), ["rh"], { matricula: "2713", empresa_id: "emp-1", ausencia_ids: ["a1"], confirmar: false }),
    ).toThrow(/confirmação/);
  });

  it("cria o colaborador e vincula somente os registros selecionados", () => {
    const db = makeDb();
    const r = vincular(db, ["super_admin"], {
      matricula: "2713",
      empresa_id: "emp-1",
      ausencia_ids: ["a1", "a2"],
      confirmar: true,
    });
    expect(r.colaborador_criado).toBe(true);
    expect(r.ausencias_vinculadas).toBe(2);
    expect(db.colaboradores[0].matricula).toBe("2713");
    expect(db.ausencias[0].colaborador_id).toBe(db.colaboradores[0].id);
  });

  it("reutiliza o colaborador existente sem duplicar matrícula", () => {
    const db = makeDb();
    db.colaboradores.push({
      id: "c-ja-existe",
      empresa_id: "emp-1",
      projeto_id: "prj-1",
      matricula: "2713",
      nome_completo: "GEOVANI MAGALHAES DA SILVA",
      origem: "IMPORTACAO",
    });
    const r = vincular(db, ["rh"], { matricula: "2713", empresa_id: "emp-1", ausencia_ids: ["a1"], confirmar: true });
    expect(r.colaborador_criado).toBe(false);
    expect(r.colaborador_id).toBe("c-ja-existe");
    expect(db.colaboradores).toHaveLength(1);
  });

  it("preserva o snapshot manual após o vínculo", () => {
    const db = makeDb();
    vincular(db, ["rh"], { matricula: "2713", empresa_id: "emp-1", ausencia_ids: ["a1"], confirmar: true });
    expect(db.ausencias[0].manual_nome).toBe("GEOVANI MAGALHAES DA SILVA");
    expect(db.ausencias[0].manual_matricula).toBe("2713");
  });

  it("registros históricos continuam legíveis pelo snapshot antes do vínculo", () => {
    const db = makeDb();
    const i = resolveAusenciaIdentidade({ ...db.ausencias[0], colaborador: null });
    expect(i.nome).toBe("GEOVANI MAGALHAES DA SILVA");
    expect(i.matricula).toBe("2713");
  });

  it("não altera o modo automático", () => {
    const db = makeDb();
    vincular(db, ["rh"], { matricula: "2713", empresa_id: "emp-1", ausencia_ids: ["a1", "a2", "a3"], confirmar: true });
    expect(db.ausencias[2].colaborador_id).toBe("c-existente");
  });

  it("preserva zeros à esquerda ao criar o colaborador", () => {
    const db = makeDb();
    db.ausencias[0].manual_matricula = "0027";
    const r = vincular(db, ["rh"], { matricula: "0027", empresa_id: "emp-1", ausencia_ids: ["a1"], confirmar: true });
    expect(db.colaboradores.find((c) => c.id === r.colaborador_id)?.matricula).toBe("0027");
  });
});
