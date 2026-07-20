import { describe, it, expect } from "vitest";
import {
  maskPhoneDisplay,
  sanitizeMetadata,
  statusTone,
  fmtSeconds,
  WA_STATUS_LABEL,
} from "@/lib/whatsapp-format";

describe("maskPhoneDisplay", () => {
  it("hides the phone body and keeps the last 4 digits", () => {
    expect(maskPhoneDisplay("5511987651234")).toBe("+•• ••• •••• 1234");
  });
  it("handles nullish", () => {
    expect(maskPhoneDisplay(null)).toBe("—");
    expect(maskPhoneDisplay(undefined)).toBe("—");
  });
});

describe("sanitizeMetadata", () => {
  it("strips forbidden keys (message, phone, cid, payload...)", () => {
    const out = sanitizeMetadata({
      message: "hello",
      texto: "oi",
      phone: "+5511999",
      cid: "M79",
      diagnostico: "x",
      payload: { foo: 1 },
      keep: "ok",
      status_novo: "ENVIADO",
    });
    expect(out).toEqual({ keep: "ok", status_novo: "ENVIADO" });
  });
  it("returns empty for non-objects", () => {
    expect(sanitizeMetadata(null)).toEqual({});
    expect(sanitizeMetadata("x")).toEqual({});
    expect(sanitizeMetadata(42)).toEqual({});
  });
  it("truncates very long strings", () => {
    const long = "a".repeat(500);
    const out = sanitizeMetadata({ note: long });
    expect((out.note as string).length).toBeLessThanOrEqual(201);
  });
});

describe("statusTone + labels", () => {
  it("maps status to expected tones", () => {
    expect(statusTone("LIDO")).toBe("success");
    expect(statusTone("ENTREGUE")).toBe("success");
    expect(statusTone("ENVIADO")).toBe("info");
    expect(statusTone("PENDENTE")).toBe("warn");
    expect(statusTone("FALHOU_DEFINITIVO")).toBe("danger");
    expect(statusTone("CANCELADO")).toBe("muted");
  });
  it("has a label for every status", () => {
    for (const k of Object.keys(WA_STATUS_LABEL)) {
      expect(WA_STATUS_LABEL[k as keyof typeof WA_STATUS_LABEL]).toBeTruthy();
    }
  });
});

describe("fmtSeconds", () => {
  it("formats seconds/minutes/hours", () => {
    expect(fmtSeconds(null)).toBe("—");
    expect(fmtSeconds(3.2)).toBe("3.2s");
    expect(fmtSeconds(90)).toBe("1m 30s");
    expect(fmtSeconds(3700)).toBe("1h 1m");
  });
});
