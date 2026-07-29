import { describe, expect, it } from "vitest";
import {
  COLABORADOR_INDISPONIVEL,
  identidadeBuscaTexto,
  labelMatriculaColaborador,
  labelNomeColaborador,
  resolveAusenciaIdentidade,
} from "@/lib/ausencia-identidade";

const automatico = {
  colaborador_id: "02863f4d-1158-424c-9e00-d9b417e4e19a",
  origem_registro: "AUTOMATICO",
  colaborador: {
    nome_completo: "ALLAN JUNIOR PEREIRA FILHO",
    matricula: "1515",
    cargo: "AJUDANTE",
    supervisor_nome: "JONAS NETO FERREIRA XAROPA",
  },
};

const manual = {
  colaborador_id: null,
  origem_registro: "MANUAL",
  colaborador: null,
  manual_nome: "GEOVANI MAGALHAES DA SILVA",
  manual_matricula: "2713",
  manual_cargo: "AJUDANTE",
  manual_supervisor_nome: "JONAS NETO FERREIRA XAROPA",
};

describe("resolveAusenciaIdentidade", () => {
  it("usa colaboradores quando há vínculo", () => {
    const i = resolveAusenciaIdentidade(automatico);
    expect(i.origem).toBe("colaborador");
    expect(i.nome).toBe("ALLAN JUNIOR PEREIRA FILHO");
    expect(i.matricula).toBe("1515");
  });

  it("exibe nome e matrícula do lançamento manual (snapshot)", () => {
    const i = resolveAusenciaIdentidade(manual);
    expect(i.origem).toBe("snapshot");
    expect(i.nome).toBe("GEOVANI MAGALHAES DA SILVA");
    expect(i.matricula).toBe("2713");
    expect(i.supervisor_nome).toBe("JONAS NETO FERREIRA XAROPA");
  });

  it("registro manual é exibido igual ao automático", () => {
    expect(labelNomeColaborador(manual)).toBe("GEOVANI MAGALHAES DA SILVA");
    expect(labelMatriculaColaborador(manual)).toBe("2713");
    expect(labelNomeColaborador(automatico)).toBe("ALLAN JUNIOR PEREIRA FILHO");
    expect(labelMatriculaColaborador(automatico)).toBe("1515");
  });

  it("preserva zeros à esquerda da matrícula", () => {
    expect(labelMatriculaColaborador({ ...manual, manual_matricula: "0027" })).toBe("0027");
  });

  it("sinaliza falha de vínculo em vez de esconder com traço", () => {
    const i = resolveAusenciaIdentidade({ colaborador_id: "abc", colaborador: null });
    expect(i.indisponivel).toBe(true);
    expect(labelNomeColaborador({ colaborador_id: "abc", colaborador: null })).toBe(
      COLABORADOR_INDISPONIVEL,
    );
  });

  it("usa traço quando não há vínculo nem snapshot", () => {
    expect(labelNomeColaborador({ colaborador_id: null, colaborador: null })).toBe("—");
    expect(labelMatriculaColaborador({})).toBe("—");
  });

  it("faz fallback campo a campo mantendo o colaborador como fonte principal", () => {
    const i = resolveAusenciaIdentidade({
      colaborador_id: "x",
      colaborador: { nome_completo: "NOME OFICIAL", matricula: "10", telefone: null },
      manual_nome: "NOME ANTIGO",
      manual_telefone: "61999999999",
    });
    expect(i.nome).toBe("NOME OFICIAL");
    expect(i.telefone).toBe("61999999999");
  });

  it("busca encontra nome e matrícula de registros manuais", () => {
    const hay = identidadeBuscaTexto(manual);
    expect(hay).toContain("2713");
    expect(hay).toContain("geovani");
  });

  it("exportação recebe nome e matrícula do snapshot", () => {
    const linha = {
      Colaborador: resolveAusenciaIdentidade(manual).nome ?? "",
      Matricula: resolveAusenciaIdentidade(manual).matricula ?? "",
    };
    expect(linha).toEqual({
      Colaborador: "GEOVANI MAGALHAES DA SILVA",
      Matricula: "2713",
    });
  });

  it("ignora strings vazias vindas do banco", () => {
    const i = resolveAusenciaIdentidade({
      colaborador_id: null,
      colaborador: { nome_completo: "   ", matricula: "" },
      manual_nome: "GEOVANI MAGALHAES DA SILVA",
      manual_matricula: "2713",
    });
    expect(i.nome).toBe("GEOVANI MAGALHAES DA SILVA");
    expect(i.matricula).toBe("2713");
  });
});
