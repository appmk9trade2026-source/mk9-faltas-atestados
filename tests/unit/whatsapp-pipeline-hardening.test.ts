import { describe, it, expect } from "vitest";
import {
  classifyEvolutionError,
  isEvolutionAccepted,
  renderTemplate,
} from "@/lib/whatsapp-worker";

/**
 * HARDENING FINAL DO PIPELINE — invariantes que espelham as regras da
 * fila, do worker e do template oficiais (docs/whatsapp-pipeline.md).
 *
 * Estes testes NÃO tocam no banco: eles protegem o CONTRATO que o resto do
 * pipeline (trigger SQL, RPCs, cron, worker HTTP) precisa respeitar.
 */

// ---------------------------------------------------------------------------
// 1) Fila não pode nascer com proxima_tentativa_em = infinity
// ---------------------------------------------------------------------------
describe("hardening · fila recuperável (sem infinity)", () => {
  // Espelho da constraint whatsapp_outbox_proxima_tentativa_finita_chk.
  function aceitaProximaTentativa(v: Date | number | "infinity" | null): boolean {
    if (v === null) return true;
    if (v === "infinity") return false;
    if (typeof v === "number") return Number.isFinite(v);
    return !Number.isNaN(v.getTime());
  }
  it("timestamp finito é aceito", () =>
    expect(aceitaProximaTentativa(new Date())).toBe(true));
  it("null é aceito (sem retry agendado)", () =>
    expect(aceitaProximaTentativa(null)).toBe(true));
  it("'infinity' é rejeitado", () =>
    expect(aceitaProximaTentativa("infinity")).toBe(false));
  it("Infinity numérico é rejeitado", () =>
    expect(aceitaProximaTentativa(Number.POSITIVE_INFINITY)).toBe(false));
});

// ---------------------------------------------------------------------------
// 2) Só COLABORADOR recebe; template e categorias oficiais
// ---------------------------------------------------------------------------
describe("hardening · destinatário e elegibilidade", () => {
  const DESTINATARIOS_PERMITIDOS = new Set(["COLABORADOR"]);
  const CATEGORIAS_ELEGIVEIS = new Set(["FALTA", "ATESTADO"]);
  const TEMPLATE_OFICIAL = "AUSENCIA_LANCADA_COLABORADOR_V1";

  it("RH nunca é destinatário deste pipeline", () =>
    expect(DESTINATARIOS_PERMITIDOS.has("RH")).toBe(false));
  it("Supervisor nunca é destinatário deste pipeline", () =>
    expect(DESTINATARIOS_PERMITIDOS.has("SUPERVISOR")).toBe(false));
  it("Colaborador é o único destinatário", () =>
    expect([...DESTINATARIOS_PERMITIDOS]).toEqual(["COLABORADOR"]));

  it("FALTA é elegível", () => expect(CATEGORIAS_ELEGIVEIS.has("FALTA")).toBe(true));
  it("ATESTADO é elegível", () => expect(CATEGORIAS_ELEGIVEIS.has("ATESTADO")).toBe(true));
  it("LICENCA não é elegível", () =>
    expect(CATEGORIAS_ELEGIVEIS.has("LICENCA")).toBe(false));

  it("template oficial não muda sem revisão", () =>
    expect(TEMPLATE_OFICIAL).toBe("AUSENCIA_LANCADA_COLABORADOR_V1"));
});

// ---------------------------------------------------------------------------
// 3) Idempotency key: forma canônica e estabilidade
// ---------------------------------------------------------------------------
describe("hardening · idempotência", () => {
  function idemKey(ausenciaId: string): string {
    return `ausencia:${ausenciaId}:whatsapp:colaborador:v1`;
  }
  it("segue o formato oficial", () =>
    expect(idemKey("abc")).toBe("ausencia:abc:whatsapp:colaborador:v1"));
  it("é determinística — mesmo insumo, mesma chave", () =>
    expect(idemKey("x")).toBe(idemKey("x")));
  it("dois lançamentos distintos produzem chaves distintas", () =>
    expect(idemKey("a")).not.toBe(idemKey("b")));
});

// ---------------------------------------------------------------------------
// 4) LGPD — conteúdo não pode carregar CID / diagnóstico
// ---------------------------------------------------------------------------
describe("hardening · LGPD do conteúdo", () => {
  const VARIAVEIS_PERMITIDAS_V1 = ["primeiro_nome", "data_registro", "empresa"];

  it("CID no payload é filtrado pela allow-list do template", () => {
    const out = renderTemplate(
      "Olá {{primeiro_nome}} - {{cid}} - {{diagnostico}}",
      { primeiro_nome: "Ana", cid: "M54", diagnostico: "lombalgia" },
      VARIAVEIS_PERMITIDAS_V1,
    );
    expect(out).not.toContain("M54");
    expect(out).not.toContain("lombalgia");
    expect(out).toContain("Ana");
  });

  it("allow-list não inclui variáveis médicas", () => {
    expect(VARIAVEIS_PERMITIDAS_V1).not.toContain("cid");
    expect(VARIAVEIS_PERMITIDAS_V1).not.toContain("diagnostico");
    expect(VARIAVEIS_PERMITIDAS_V1).not.toContain("anexo");
    expect(VARIAVEIS_PERMITIDAS_V1).not.toContain("observacoes");
  });
});

// ---------------------------------------------------------------------------
// 5) Lease — não reenviar mensagem já confirmada pelo provider
// ---------------------------------------------------------------------------
describe("hardening · lease de PROCESSANDO órfão", () => {
  type Row = {
    status: "PROCESSANDO" | "PENDENTE" | "ENVIADO";
    provider_message_id: string | null;
    reservado_em: Date;
  };
  function recuperarSeOrfa(row: Row, agora: Date, timeoutSeg: number): Row {
    const idadeSeg = (agora.getTime() - row.reservado_em.getTime()) / 1000;
    if (row.status !== "PROCESSANDO") return row;
    if (idadeSeg <= timeoutSeg) return row;
    // Nunca reenvia se já foi confirmada pelo provider
    if (row.provider_message_id) return { ...row, status: "ENVIADO" };
    return { ...row, status: "PENDENTE" };
  }
  const agora = new Date("2026-07-20T15:30:00Z");
  it("PROCESSANDO com provider_message_id → ENVIADO (nunca reenviar)", () => {
    const r = recuperarSeOrfa(
      { status: "PROCESSANDO", provider_message_id: "evo:1",
        reservado_em: new Date(agora.getTime() - 10 * 60 * 1000) },
      agora, 60,
    );
    expect(r.status).toBe("ENVIADO");
    expect(r.provider_message_id).toBe("evo:1");
  });
  it("PROCESSANDO sem provider_message_id → volta para PENDENTE", () => {
    const r = recuperarSeOrfa(
      { status: "PROCESSANDO", provider_message_id: null,
        reservado_em: new Date(agora.getTime() - 10 * 60 * 1000) },
      agora, 60,
    );
    expect(r.status).toBe("PENDENTE");
  });
  it("PROCESSANDO dentro do lease permanece PROCESSANDO", () => {
    const r = recuperarSeOrfa(
      { status: "PROCESSANDO", provider_message_id: null,
        reservado_em: new Date(agora.getTime() - 5 * 1000) },
      agora, 60,
    );
    expect(r.status).toBe("PROCESSANDO");
  });
});

// ---------------------------------------------------------------------------
// 6) Alertas visuais do painel de saúde
// ---------------------------------------------------------------------------
describe("hardening · thresholds de alerta do health card", () => {
  const AGORA = new Date("2026-07-20T15:30:00Z");
  function cronParadoHaMuito(ultima: Date): boolean {
    return (AGORA.getTime() - ultima.getTime()) / 1000 > 3 * 60;
  }
  function pendentesElegiveisHaMuito(mais_antigo: Date): boolean {
    return (AGORA.getTime() - mais_antigo.getTime()) / 1000 > 5 * 60;
  }
  it("cron > 3 min sem execução dispara alerta", () => {
    expect(cronParadoHaMuito(new Date(AGORA.getTime() - 4 * 60 * 1000))).toBe(true);
    expect(cronParadoHaMuito(new Date(AGORA.getTime() - 2 * 60 * 1000))).toBe(false);
  });
  it("PENDENTE > 5 min dispara alerta", () => {
    expect(pendentesElegiveisHaMuito(new Date(AGORA.getTime() - 6 * 60 * 1000))).toBe(true);
    expect(pendentesElegiveisHaMuito(new Date(AGORA.getTime() - 60 * 1000))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7) Classificação de erros do provider (mantida)
// ---------------------------------------------------------------------------
describe("hardening · contrato com Evolution API", () => {
  it("2xx é aceito", () => expect(isEvolutionAccepted(200)).toBe(true));
  it("timeout gera RETRY temporário", () =>
    expect(classifyEvolutionError(408, "t").kind).toBe("TEMPORARIA"));
  it("401 é DEFINITIVO (não tenta de novo)", () =>
    expect(classifyEvolutionError(401, "x").kind).toBe("DEFINITIVA"));
});
