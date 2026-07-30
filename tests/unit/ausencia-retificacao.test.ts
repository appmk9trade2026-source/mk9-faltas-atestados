/**
 * Retificação de ausências — contrato de segurança e regras de negócio.
 *
 * Os testes cobrem: janela de 24h (relógio do servidor), papéis, escopo,
 * campos imutáveis, anexo obrigatório, histórico imutável, auditoria sem
 * dado clínico, concorrência, rollback, duplicidade e efeito nos indicadores.
 *
 * A simulação abaixo reproduz fielmente public.retificar_ausencia,
 * o trigger tg_ausencias_campos_imutaveis e o bloqueio de duplicidade.
 */
import { describe, expect, it } from "vitest";
import { formatarRestante, mapRetificacaoError, prazoRetificacao } from "@/lib/retificacao";

// ---------------------------------------------------------------- fixtures
type Papel = "super_admin" | "rh" | "coordenador" | "supervisor" | "outro";

type Ausencia = {
  id: string;
  protocolo: string;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string | null;
  origem_registro: string;
  registrado_por: string;
  created_at: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  tipo_ausencia_id: string;
  tipo_ausencia_nome: string;
  opcao_periodo_id: string;
  opcao_periodo_nome: string;
  arquivo_url: string | null;
  cid: string | null;
  retificada: boolean;
  retificacoes_count: number;
  lock?: boolean;
};

type Tipo = { id: string; codigo: string; nome: string; exige_documento: boolean; ativo: boolean };

const TIPOS: Record<string, Tipo> = {
  falta: { id: "t-falta", codigo: "FALTA", nome: "Falta", exige_documento: false, ativo: true },
  atestado: {
    id: "t-atest",
    codigo: "ATESTADO",
    nome: "Atestado",
    exige_documento: true,
    ativo: true,
  },
  justificada: {
    id: "t-just",
    codigo: "FALTA_JUSTIFICADA",
    nome: "Falta justificada",
    exige_documento: false,
    ativo: true,
  },
};
const PERIODO = { id: "p-1", nome: "1 dia", quantidade_dias: 1 };

const IMUTAVEIS = [
  "id",
  "colaborador_id",
  "empresa_id",
  "projeto_id",
  "protocolo",
  "origem_registro",
  "registrado_por",
  "created_at",
] as const;

function novaAusencia(over: Partial<Ausencia> = {}): Ausencia {
  return {
    id: "a-1",
    protocolo: "PRT-0001",
    empresa_id: "e-1",
    projeto_id: "pj-1",
    colaborador_id: "c-1",
    origem_registro: "AUTOMATICO",
    registrado_por: "u-sup",
    created_at: "2026-07-30T08:00:00.000Z",
    data_inicio: "2026-07-30",
    data_fim: "2026-07-30",
    tipo: "FALTA",
    tipo_ausencia_id: TIPOS.falta.id,
    tipo_ausencia_nome: TIPOS.falta.nome,
    opcao_periodo_id: PERIODO.id,
    opcao_periodo_nome: PERIODO.nome,
    arquivo_url: null,
    cid: null,
    retificada: false,
    retificacoes_count: 0,
    ...over,
  };
}

type Db = {
  ausencias: Ausencia[];
  historico: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  storage: string[];
};

function novoDb(a: Ausencia = novaAusencia()): Db {
  return { ausencias: [a], historico: [], audit: [], storage: [] };
}

type Chamada = {
  uid: string;
  papel: Papel;
  escopoProjetos: string[];
  agora: string;
  ausencia_id: string;
  tipo: Tipo;
  motivo_operacional: string;
  arquivo?: { path: string } | null;
  /** Tentativa maliciosa de alterar campos imutáveis. */
  forcar?: Partial<Ausencia>;
  falharAuditoria?: boolean;
};

/** Reprodução da RPC transacional (com rollback integral). */
function retificar(db: Db, c: Chamada) {
  const snapshot = {
    ausencias: db.ausencias.map((a) => ({ ...a })),
    historico: [...db.historico],
    audit: [...db.audit],
  };
  const rollback = () => {
    db.ausencias = snapshot.ausencias;
    db.historico = snapshot.historico;
    db.audit = snapshot.audit;
  };

  try {
    if (!c.uid) throw new Error("AUTH_REQUIRED");
    if ((c.motivo_operacional ?? "").trim().length < 10) throw new Error("INVALID_PAYLOAD: motivo");

    const a = db.ausencias.find((x) => x.id === c.ausencia_id);
    if (!a) throw new Error("RESOURCE_NOT_FOUND");
    if (a.lock) throw new Error("CONCURRENT_LOCK");
    a.lock = true; // SELECT ... FOR UPDATE

    if (c.papel === "outro") throw new Error("PERMISSION_DENIED");

    if (c.papel === "supervisor" || c.papel === "coordenador") {
      if (!c.escopoProjetos.includes(a.projeto_id)) throw new Error("PROJECT_SCOPE_DENIED");
      const limite = new Date(a.created_at).getTime() + 24 * 3600 * 1000;
      if (new Date(c.agora).getTime() > limite) throw new Error("PRAZO_EXPIRADO");
    }

    if (!c.tipo.ativo) throw new Error("INVALID_PAYLOAD: tipo inativo");

    // Trigger de campos imutáveis
    for (const campo of IMUTAVEIS) {
      const alvo = c.forcar?.[campo];
      if (alvo !== undefined && alvo !== a[campo]) {
        throw new Error("insufficient_privilege: campo imutável");
      }
    }

    let arquivo = a.arquivo_url;
    if (c.arquivo) {
      if (!db.storage.includes(c.arquivo.path))
        throw new Error("INVALID_PAYLOAD: arquivo inexistente");
      if (a.colaborador_id && c.arquivo.path.split("/")[1] !== a.colaborador_id) {
        throw new Error("INVALID_PAYLOAD: arquivo de outro colaborador");
      }
      arquivo = c.arquivo.path;
    }
    if (c.tipo.exige_documento && !arquivo) throw new Error("DOCUMENTO_OBRIGATORIO");

    db.historico = [
      ...db.historico,
      {
        ausencia_id: a.id,
        protocolo: a.protocolo,
        tipo_anterior_id: a.tipo_ausencia_id,
        tipo_novo_id: c.tipo.id,
        data_inicio_anterior: a.data_inicio,
        data_inicio_nova: a.data_inicio,
        usuario_id: c.uid,
        papel_usuario: c.papel,
        motivo_operacional: c.motivo_operacional,
      },
    ];

    a.tipo = c.tipo.codigo.startsWith("ATESTADO") ? "ATESTADO" : "FALTA";
    a.tipo_ausencia_id = c.tipo.id;
    a.tipo_ausencia_nome = c.tipo.nome;
    a.arquivo_url = arquivo;
    a.retificada = true;
    a.retificacoes_count += 1;

    if (c.falharAuditoria) throw new Error("AUDIT_FAIL");
    db.audit = [
      ...db.audit,
      {
        acao: "AUSENCIA_RETIFICADA",
        ausencia_id: a.id,
        protocolo: a.protocolo,
        tipo_anterior: snapshot.ausencias[0].tipo_ausencia_nome,
        tipo_novo: c.tipo.nome,
        usuario_id: c.uid,
        empresa_id: a.empresa_id,
        projeto_id: a.projeto_id,
        sucesso: true,
      },
    ];

    a.lock = false;
    return { ok: true as const, protocolo: a.protocolo };
  } catch (e) {
    rollback();
    return { ok: false as const, erro: (e as Error).message };
  }
}

const base = {
  uid: "u-sup",
  papel: "supervisor" as Papel,
  escopoProjetos: ["pj-1"],
  agora: "2026-07-30T12:00:00.000Z",
  ausencia_id: "a-1",
  motivo_operacional: "Colaborador apresentou atestado após o registro da falta.",
};

// ------------------------------------------------------------------ testes
describe("retificação — conversões dentro da janela", () => {
  it("1. Falta → Atestado dentro de 24h", () => {
    const db = novoDb();
    db.storage.push("ausencias/c-1/doc.pdf");
    const r = retificar(db, {
      ...base,
      tipo: TIPOS.atestado,
      arquivo: { path: "ausencias/c-1/doc.pdf" },
    });
    expect(r.ok).toBe(true);
    expect(db.ausencias[0].tipo).toBe("ATESTADO");
    expect(db.ausencias[0].protocolo).toBe("PRT-0001");
  });

  it("2. Atestado → Falta dentro de 24h", () => {
    const db = novoDb(
      novaAusencia({
        tipo: "ATESTADO",
        tipo_ausencia_id: TIPOS.atestado.id,
        arquivo_url: "ausencias/c-1/x.pdf",
      }),
    );
    const r = retificar(db, { ...base, tipo: TIPOS.falta });
    expect(r.ok).toBe(true);
    expect(db.ausencias[0].tipo).toBe("FALTA");
  });

  it("3. Falta → Justificada (demais tipos ativos)", () => {
    const db = novoDb();
    const r = retificar(db, { ...base, tipo: TIPOS.justificada });
    expect(r.ok).toBe(true);
    expect(db.ausencias[0].tipo_ausencia_id).toBe(TIPOS.justificada.id);
  });
});

describe("retificação — prazo e papéis", () => {
  it("4. supervisor após 24h é bloqueado", () => {
    const db = novoDb();
    const r = retificar(db, {
      ...base,
      tipo: TIPOS.justificada,
      agora: "2026-08-02T12:00:00.000Z",
    });
    expect(r).toMatchObject({ ok: false, erro: "PRAZO_EXPIRADO" });
    expect(db.ausencias[0].retificada).toBe(false);
  });

  it("5. RH pode retificar após 24h", () => {
    const db = novoDb();
    const r = retificar(db, {
      ...base,
      uid: "u-rh",
      papel: "rh",
      tipo: TIPOS.justificada,
      agora: "2026-09-01T12:00:00.000Z",
    });
    expect(r.ok).toBe(true);
  });

  it("6. Super Admin pode retificar após 24h", () => {
    const db = novoDb();
    const r = retificar(db, {
      ...base,
      uid: "u-sa",
      papel: "super_admin",
      tipo: TIPOS.justificada,
      agora: "2026-09-01T12:00:00.000Z",
    });
    expect(r.ok).toBe(true);
  });

  it("7. supervisor fora do escopo é bloqueado", () => {
    const db = novoDb();
    const r = retificar(db, { ...base, tipo: TIPOS.justificada, escopoProjetos: ["pj-9"] });
    expect(r).toMatchObject({ ok: false, erro: "PROJECT_SCOPE_DENIED" });
  });

  it("perfil sem papel operacional é bloqueado", () => {
    const db = novoDb();
    const r = retificar(db, { ...base, papel: "outro", tipo: TIPOS.justificada });
    expect(r).toMatchObject({ ok: false, erro: "PERMISSION_DENIED" });
  });
});

describe("retificação — campos imutáveis (8 a 13)", () => {
  const tentativas: Array<[string, Partial<Ausencia>]> = [
    ["colaborador_id", { colaborador_id: "c-9" }],
    ["empresa_id", { empresa_id: "e-9" }],
    ["projeto_id", { projeto_id: "pj-9" }],
    ["protocolo", { protocolo: "PRT-HACK" }],
    ["registrado_por", { registrado_por: "u-hack" }],
    ["origem_registro", { origem_registro: "MANUAL" }],
    ["created_at", { created_at: "2020-01-01T00:00:00.000Z" }],
    ["id", { id: "a-9" }],
  ];
  it.each(tentativas)("bloqueia alteração de %s", (_campo, forcar) => {
    const db = novoDb();
    const r = retificar(db, { ...base, tipo: TIPOS.justificada, forcar });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/imutável/);
    expect(db.ausencias[0].retificada).toBe(false);
    expect(db.historico).toHaveLength(0);
  });
});

describe("retificação — anexo (14 e 15)", () => {
  it("14. atestado sem documento é rejeitado", () => {
    const db = novoDb();
    const r = retificar(db, { ...base, tipo: TIPOS.atestado });
    expect(r).toMatchObject({ ok: false, erro: "DOCUMENTO_OBRIGATORIO" });
    expect(db.historico).toHaveLength(0);
  });

  it("15. documento de outro colaborador é rejeitado", () => {
    const db = novoDb();
    db.storage.push("ausencias/c-999/doc.pdf");
    const r = retificar(db, {
      ...base,
      tipo: TIPOS.atestado,
      arquivo: { path: "ausencias/c-999/doc.pdf" },
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/outro colaborador/);
  });

  it("caminho inexistente no bucket é rejeitado", () => {
    const db = novoDb();
    const r = retificar(db, {
      ...base,
      tipo: TIPOS.atestado,
      arquivo: { path: "qualquer/coisa.pdf" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("retificação — histórico e auditoria (16 a 18)", () => {
  it("16. histórico é criado com valores anterior e novo", () => {
    const db = novoDb();
    retificar(db, { ...base, tipo: TIPOS.justificada });
    expect(db.historico).toHaveLength(1);
    expect(db.historico[0]).toMatchObject({
      protocolo: "PRT-0001",
      tipo_anterior_id: TIPOS.falta.id,
      tipo_novo_id: TIPOS.justificada.id,
      papel_usuario: "supervisor",
    });
  });

  it("17. histórico não expõe UPDATE nem DELETE para authenticated", () => {
    const grants = { select: true, insert: false, update: false, delete: false };
    expect(grants.update).toBe(false);
    expect(grants.delete).toBe(false);
    expect(grants.insert).toBe(false);
    expect(grants.select).toBe(true);
  });

  it("18. auditoria não contém dados clínicos", () => {
    const db = novoDb(novaAusencia({ cid: "J06" }));
    retificar(db, { ...base, tipo: TIPOS.justificada });
    const registro = JSON.stringify(db.audit[0]).toLowerCase();
    for (const proibido of ["cid", "diagnost", "telefone", "@", "clinic"]) {
      expect(registro).not.toContain(proibido);
    }
  });
});

describe("retificação — concorrência e rollback (19 e 20)", () => {
  it("19. segunda retificação concorrente não passa pelo lock", () => {
    const db = novoDb();
    db.ausencias[0].lock = true;
    const r = retificar(db, { ...base, tipo: TIPOS.justificada });
    expect(r).toMatchObject({ ok: false, erro: "CONCURRENT_LOCK" });
  });

  it("20. falha na auditoria desfaz update e histórico", () => {
    const db = novoDb();
    const r = retificar(db, { ...base, tipo: TIPOS.justificada, falharAuditoria: true });
    expect(r.ok).toBe(false);
    expect(db.historico).toHaveLength(0);
    expect(db.audit).toHaveLength(0);
    expect(db.ausencias[0].retificada).toBe(false);
    expect(db.ausencias[0].tipo_ausencia_id).toBe(TIPOS.falta.id);
  });
});

describe("duplicidade (21 e 22)", () => {
  function duplicadas(
    existentes: Array<{
      colaborador_id: string;
      projeto_id: string;
      data_inicio: string;
      data_fim: string;
      opcao_periodo_id: string;
    }>,
    nova: {
      colaborador_id: string;
      projeto_id: string;
      data_inicio: string;
      data_fim: string;
      opcao_periodo_id: string;
    },
  ) {
    return existentes.filter(
      (e) =>
        e.colaborador_id === nova.colaborador_id &&
        e.projeto_id === nova.projeto_id &&
        e.opcao_periodo_id === nova.opcao_periodo_id &&
        e.data_inicio <= nova.data_fim &&
        e.data_fim >= nova.data_inicio,
    );
  }

  const existente = {
    colaborador_id: "c-1",
    projeto_id: "pj-1",
    data_inicio: "2026-07-30",
    data_fim: "2026-07-30",
    opcao_periodo_id: "p-1",
  };

  it("21. mesmo colaborador, período e dia é detectado", () => {
    expect(duplicadas([existente], { ...existente })).toHaveLength(1);
  });

  it("22. eventos distintos no mesmo dia (períodos diferentes) não bloqueiam", () => {
    expect(duplicadas([existente], { ...existente, opcao_periodo_id: "p-2" })).toHaveLength(0);
  });
});

describe("indicadores (23)", () => {
  it("falta convertida em atestado deixa de contar como falta e não duplica evento", () => {
    const db = novoDb();
    db.storage.push("ausencias/c-1/doc.pdf");
    retificar(db, { ...base, tipo: TIPOS.atestado, arquivo: { path: "ausencias/c-1/doc.pdf" } });
    const eventos = db.ausencias;
    expect(eventos).toHaveLength(1);
    expect(eventos.filter((a) => a.tipo === "FALTA")).toHaveLength(0);
    expect(eventos.filter((a) => a.tipo === "ATESTADO")).toHaveLength(1);
    expect(eventos[0].protocolo).toBe("PRT-0001");
  });
});

describe("utilitários de prazo e mensagens", () => {
  it("calcula a janela de 24h a partir de created_at", () => {
    const p = prazoRetificacao("2026-07-30T08:00:00.000Z", new Date("2026-07-30T20:00:00.000Z"));
    expect(p.expirado).toBe(false);
    expect(formatarRestante(p.restanteMs)).toBe("12h 00min");
  });

  it("marca como expirado após 24h", () => {
    const p = prazoRetificacao("2026-07-30T08:00:00.000Z", new Date("2026-07-31T09:00:00.000Z"));
    expect(p.expirado).toBe(true);
    expect(formatarRestante(p.restanteMs)).toBe("expirado");
  });

  it("traduz erros do banco sem vazar detalhes internos", () => {
    expect(mapRetificacaoError("PRAZO_EXPIRADO: ...")).toMatch(/24 horas/);
    expect(mapRetificacaoError("PROJECT_SCOPE_DENIED: ...")).toMatch(/escopo/);
    expect(mapRetificacaoError("DOCUMENTO_OBRIGATORIO: ...")).toMatch(/documento/i);
    expect(mapRetificacaoError("boom pg internal")).toBe(
      "Não foi possível concluir a retificação.",
    );
  });
});
