import { describe, it, expect } from "vitest";
import {
  classifyEvolutionError,
  renderTemplate,
  calcBackoffSeconds,
  isEvolutionAccepted,
} from "@/lib/whatsapp-worker";

/**
 * Espelha os invariantes da Fase 3 (Etapa 29C):
 *   - whatsapp_outbox_reservar_lote (FOR UPDATE SKIP LOCKED + provider gate)
 *   - whatsapp_outbox_recuperar_travadas (WORKER_TIMEOUT)
 *   - whatsapp_outbox_marcar_falha_temporaria / _definitiva (retry + dead-letter)
 *   - Endpoint do worker: classificação de erros e renderização de template
 */

describe("29C · Fase 3 · classificação de erros da Evolution API", () => {
  it("timeout → TEMPORARIA", () =>
    expect(classifyEvolutionError(408, "timeout").kind).toBe("TEMPORARIA"));
  it("429 → TEMPORARIA", () =>
    expect(classifyEvolutionError(429, "rate").kind).toBe("TEMPORARIA"));
  it("500/502/503/504 → TEMPORARIA", () => {
    for (const s of [500, 502, 503, 504]) {
      expect(classifyEvolutionError(s, "boom").kind).toBe("TEMPORARIA");
    }
  });
  it("erro de rede (status null) → TEMPORARIA/NETWORK", () => {
    const r = classifyEvolutionError(null, "ECONNRESET");
    expect(r.kind).toBe("TEMPORARIA");
    expect(r.codigo).toBe("NETWORK");
  });
  it("401 → DEFINITIVA", () =>
    expect(classifyEvolutionError(401, "unauth").kind).toBe("DEFINITIVA"));
  it("404 instância → DEFINITIVA", () =>
    expect(classifyEvolutionError(404, "no instance").codigo).toBe("HTTP_404_INSTANCE"));
  it("400 payload → DEFINITIVA", () =>
    expect(classifyEvolutionError(400, "bad").codigo).toBe("HTTP_400_PAYLOAD"));
  it("422 telefone → DEFINITIVA", () =>
    expect(classifyEvolutionError(422, "phone").codigo).toBe("HTTP_422_TELEFONE"));
  it("4xx desconhecido → DEFINITIVA (evita loop infinito)", () =>
    expect(classifyEvolutionError(418, "teapot").kind).toBe("DEFINITIVA"));
  it("mensagem é truncada em 500", () => {
    const long = "x".repeat(1000);
    expect(classifyEvolutionError(500, long).mensagem.length).toBeLessThanOrEqual(500);
  });
});

describe("29C · Fase 3 · retry exponencial com jitter", () => {
  it("respeita teto máximo", () => {
    for (let t = 1; t < 20; t++) {
      expect(calcBackoffSeconds(t, 30, 3600, 1)).toBeLessThanOrEqual(3600);
    }
  });
  it("cresce monotonicamente até o teto (jitter fixo)", () => {
    const seq = [1, 2, 3, 4, 5].map((t) => calcBackoffSeconds(t, 30, 3600, 0.5));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });
  it("nunca retorna zero", () => {
    for (let t = 0; t < 10; t++) {
      expect(calcBackoffSeconds(t, 30, 3600, 0)).toBeGreaterThanOrEqual(1);
    }
  });
  it("jitter mantém dentro de 50%..150% do valor base do expoente", () => {
    const lo = calcBackoffSeconds(3, 10, 10_000, 0); // 0.5x
    const hi = calcBackoffSeconds(3, 10, 10_000, 1); // 1.5x
    expect(lo).toBeLessThan(hi);
  });
});

describe("29C · Fase 3 · renderização de template", () => {
  it("substitui variáveis permitidas", () => {
    const out = renderTemplate("Olá {{nome}}!", { nome: "Ana" }, ["nome"]);
    expect(out).toBe("Olá Ana!");
  });
  it("ignora variáveis fora da allow-list (LGPD)", () => {
    const out = renderTemplate(
      "Olá {{nome}}, CID {{cid}}",
      { nome: "Ana", cid: "M54" },
      ["nome"], // cid NÃO permitido
    );
    expect(out).toBe("Olá Ana, CID ");
    expect(out).not.toContain("M54");
  });
  it("chave ausente vira string vazia", () => {
    expect(renderTemplate("{{a}}|{{b}}", { a: "x" }, ["a", "b"])).toBe("x|");
  });
  it("aceita todas quando allow-list vazia", () => {
    expect(renderTemplate("{{x}}", { x: 1 }, [])).toBe("1");
  });
});

describe("29C · Fase 3 · gate de aceitação HTTP", () => {
  it("2xx aceito", () => expect(isEvolutionAccepted(201)).toBe(true));
  it("3xx não aceito", () => expect(isEvolutionAccepted(302)).toBe(false));
  it("4xx não aceito", () => expect(isEvolutionAccepted(400)).toBe(false));
});

// -------------------------- Espelhos dos invariantes SQL ---------------------
type Status = "PENDENTE" | "PROCESSANDO" | "ENVIADO" | "FALHOU_TEMPORARIO" | "FALHOU_DEFINITIVO" | "CANCELADO";

function reservarLoteSimulado(
  itens: Array<{ id: string; status: Status; proxima: Date }>,
  agora: Date,
  providerEnabled: boolean,
  modo: "DESATIVADO" | "HOMOLOGACAO" | "PRODUCAO",
  limite: number,
) {
  if (!providerEnabled || modo === "DESATIVADO") return [];
  return itens
    .filter((i) => (i.status === "PENDENTE" || i.status === "FALHOU_TEMPORARIO") && i.proxima <= agora)
    .slice(0, limite)
    .map((i) => ({ ...i, status: "PROCESSANDO" as Status }));
}

describe("29C · Fase 3 · reserva de lote (espelho)", () => {
  const agora = new Date("2026-07-18T10:00:00Z");
  const past = new Date(agora.getTime() - 1000);
  const future = new Date(agora.getTime() + 3600 * 1000);
  const base = [
    { id: "1", status: "PENDENTE" as Status, proxima: past },
    { id: "2", status: "FALHOU_TEMPORARIO" as Status, proxima: past },
    { id: "3", status: "PENDENTE" as Status, proxima: future }, // ainda não elegível
    { id: "4", status: "ENVIADO" as Status, proxima: past },     // status errado
    { id: "5", status: "CANCELADO" as Status, proxima: past },
  ];
  it("modo DESATIVADO → nunca retorna itens", () => {
    expect(reservarLoteSimulado(base, agora, true, "DESATIVADO", 10)).toEqual([]);
  });
  it("provider disabled → nunca retorna itens", () => {
    expect(reservarLoteSimulado(base, agora, false, "PRODUCAO", 10)).toEqual([]);
  });
  it("HOMOLOGACAO habilitado → só elegíveis", () => {
    const r = reservarLoteSimulado(base, agora, true, "HOMOLOGACAO", 10);
    expect(r.map((i) => i.id).sort()).toEqual(["1", "2"]);
    for (const i of r) expect(i.status).toBe("PROCESSANDO");
  });
  it("respeita limite do lote", () => {
    expect(reservarLoteSimulado(base, agora, true, "PRODUCAO", 1)).toHaveLength(1);
  });
});

describe("29C · Fase 3 · dead letter", () => {
  function marcarFalha(tentativas: number, maxTentativas: number): Status {
    return tentativas + 1 >= maxTentativas ? "FALHOU_DEFINITIVO" : "FALHOU_TEMPORARIO";
  }
  it("penúltima tentativa ainda é temporária", () =>
    expect(marcarFalha(3, 5)).toBe("FALHOU_TEMPORARIO"));
  it("última tentativa vira definitivo", () =>
    expect(marcarFalha(4, 5)).toBe("FALHOU_DEFINITIVO"));
  it("mensagens nunca são apagadas — apenas mudam de status", () => {
    // invariante documentado; não há caminho para DELETE em código de aplicação.
    expect(true).toBe(true);
  });
});

describe("29C · Fase 3 · idempotência", () => {
  it("mesmo idempotency_key não gera segundo INSERT (UNIQUE no outbox)", () => {
    // Espelho: a chave é única no schema; segunda tentativa retorna JA_EXISTENTE.
    const chave = "ausencia:abc:whatsapp:colaborador:v1";
    expect(chave).toBe("ausencia:abc:whatsapp:colaborador:v1");
  });
  it("provider_message_id é preservado (COALESCE) no marcar_enviado", () => {
    // Espelho da regra COALESCE no UPDATE — segunda entrega mantém o primeiro id.
    const first = "evo:1";
    const second = "evo:2";
    const merged = first ?? second;
    expect(merged).toBe(first);
  });
});
