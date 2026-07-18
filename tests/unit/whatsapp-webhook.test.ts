import { describe, expect, it } from "vitest";
import {
  idempotencyKey,
  mapEvolutionStatus,
  parseEvolutionPayload,
  podeEvoluir,
  timingSafeEqualStr,
} from "@/lib/whatsapp-webhook";

describe("whatsapp-webhook · mapEvolutionStatus", () => {
  it.each([
    ["SENT", "ENVIADO"],
    ["server_ack", "ENVIADO"],
    ["DELIVERED", "ENTREGUE"],
    ["DELIVERY_ACK", "ENTREGUE"],
    ["READ", "LIDO"],
    ["PLAYED", "LIDO"],
    ["FAILED", "FALHOU_DEFINITIVO"],
    ["ERROR", "FALHOU_DEFINITIVO"],
  ])("mapeia %s → %s", (raw, esperado) => {
    expect(mapEvolutionStatus(raw)).toBe(esperado);
  });

  it("retorna null para status desconhecido", () => {
    expect(mapEvolutionStatus("QUALQUER_COISA")).toBeNull();
    expect(mapEvolutionStatus(null)).toBeNull();
    expect(mapEvolutionStatus(undefined)).toBeNull();
  });
});

describe("whatsapp-webhook · podeEvoluir (precedência)", () => {
  it("permite avanço normal", () => {
    expect(podeEvoluir("PENDENTE", "ENVIADO")).toBe(true);
    expect(podeEvoluir("ENVIADO", "ENTREGUE")).toBe(true);
    expect(podeEvoluir("ENTREGUE", "LIDO")).toBe(true);
  });
  it("bloqueia regressão", () => {
    expect(podeEvoluir("LIDO", "ENTREGUE")).toBe(false);
    expect(podeEvoluir("ENTREGUE", "ENVIADO")).toBe(false);
    expect(podeEvoluir("LIDO", "ENVIADO")).toBe(false);
  });
  it("mesmo status não evolui", () => {
    expect(podeEvoluir("ENVIADO", "ENVIADO")).toBe(false);
  });
  it("status desconhecido nunca evolui", () => {
    expect(podeEvoluir("XYZ", "ENVIADO")).toBe(false);
    expect(podeEvoluir("ENVIADO", "XYZ")).toBe(false);
  });
});

describe("whatsapp-webhook · parseEvolutionPayload", () => {
  it("extrai id + status de payload messages.update", () => {
    const p = parseEvolutionPayload({
      instance: "mk9",
      data: { key: { id: "ABC123" }, status: "DELIVERED" },
    });
    expect(p.providerMessageId).toBe("ABC123");
    expect(p.instance).toBe("mk9");
    expect(p.status).toBe("ENTREGUE");
  });

  it("aceita id no topo (send.message)", () => {
    const p = parseEvolutionPayload({
      instanceName: "mk9",
      messageId: "MID-9",
      status: "SENT",
    });
    expect(p.providerMessageId).toBe("MID-9");
    expect(p.status).toBe("ENVIADO");
    expect(p.instance).toBe("mk9");
  });

  it("retorna status null quando estado é desconhecido", () => {
    const p = parseEvolutionPayload({
      data: { key: { id: "X" }, status: "PLAYING_AUDIO" },
    });
    expect(p.providerMessageId).toBe("X");
    expect(p.status).toBeNull();
  });

  it("retorna providerMessageId null quando ausente", () => {
    const p = parseEvolutionPayload({ instance: "mk9", data: { status: "READ" } });
    expect(p.providerMessageId).toBeNull();
    expect(p.status).toBe("LIDO");
  });

  it("trunca campos longos", () => {
    const p = parseEvolutionPayload({
      instance: "x".repeat(500),
      data: { key: { id: "y".repeat(500) }, status: "SENT", errorMessage: "z".repeat(500) },
    });
    expect(p.instance!.length).toBeLessThanOrEqual(128);
    expect(p.providerMessageId!.length).toBeLessThanOrEqual(256);
    expect(p.mensagem!.length).toBeLessThanOrEqual(200);
  });

  it("nunca vaza telefone/texto no retorno", () => {
    const p = parseEvolutionPayload({
      instance: "mk9",
      data: {
        key: { id: "ID1", remoteJid: "5511999999999@s.whatsapp.net" },
        status: "READ",
        message: { conversation: "Olá João, seu atestado..." },
      },
    });
    const s = JSON.stringify(p);
    expect(s).not.toContain("5511999999999");
    expect(s).not.toContain("João");
    expect(s).not.toContain("Olá");
  });
});

describe("whatsapp-webhook · idempotencyKey", () => {
  it("produz chave estável", () => {
    expect(idempotencyKey("mk9", "ABC", "ENTREGUE")).toBe("evolution:mk9:ABC:ENTREGUE");
    expect(idempotencyKey(null, "ABC", "ENVIADO")).toBe("evolution:-:ABC:ENVIADO");
  });
});

describe("whatsapp-webhook · timingSafeEqualStr", () => {
  it("compara iguais", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
  });
  it("rejeita diferentes", () => {
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
    expect(timingSafeEqualStr("", "x")).toBe(false);
  });
});
