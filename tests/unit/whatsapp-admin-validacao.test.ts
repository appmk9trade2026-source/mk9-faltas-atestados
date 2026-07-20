import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execRowTone, fmtDate, fmtDuration } from "@/lib/whatsapp-format";

const R = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../src/routes/_authenticated", f), "utf8");

const FILES = {
  index: "comunicacoes.whatsapp.index.tsx",
  outbox: "comunicacoes.whatsapp.outbox.tsx",
  dl: "comunicacoes.whatsapp.dead-letter.tsx",
  exec: "comunicacoes.whatsapp.execucoes.tsx",
  health: "comunicacoes.whatsapp.health.tsx",
  config: "comunicacoes.whatsapp.configuracao.tsx",
};

describe("execRowTone", () => {
  it("SUCESSO quando OK sem falhas", () => {
    expect(execRowTone({ status: "OK" })).toEqual({ tone: "success", label: "SUCESSO" });
  });
  it("PARCIAL quando OK mas com falhas", () => {
    expect(execRowTone({ status: "OK", falhas_temporarias: 2 })).toEqual({ tone: "warn", label: "PARCIAL" });
    expect(execRowTone({ status: "OK", falhas_definitivas: 1 })).toEqual({ tone: "warn", label: "PARCIAL" });
  });
  it("FALHA quando status ERRO", () => {
    expect(execRowTone({ status: "ERRO" })).toEqual({ tone: "danger", label: "FALHA" });
  });
  it("neutro para PROVIDER_DESATIVADO / SEM_ITENS", () => {
    expect(execRowTone({ status: "PROVIDER_DESATIVADO" }).tone).toBe("muted");
    expect(execRowTone({ status: "SEM_ITENS" }).tone).toBe("muted");
  });
});

describe("formatação — helpers", () => {
  it("fmtDate lida com null/inválido", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("nope")).toBe("—");
  });
  it("fmtDuration formata ms/segundos/minutos", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(250)).toBe("250 ms");
    expect(fmtDuration(1500)).toBe("1.5s");
    expect(fmtDuration(75000)).toMatch(/1m 15s/);
  });
});

describe("Dashboard WhatsApp — validação", () => {
  const src = R(FILES.index);
  it("carrega Health via server function para KPIs operacionais", () => {
    expect(src).toMatch(/getWhatsappHealth/);
    expect(src).toMatch(/Fila atual/);
    expect(src).toMatch(/Dead Letter \(24h\)/);
    expect(src).toMatch(/label="Worker"/);
    expect(src).toMatch(/label="Provider"/);
  });
  it("possui estado vazio explícito e retry no erro", () => {
    expect(src).toMatch(/Nenhuma mensagem no período/);
    expect(src).toMatch(/Tentar novamente/);
  });
  it("não deixa referência solta a useEffect", () => {
    expect(src).not.toMatch(/^useEffect;\s*$/m);
  });
});

describe("Outbox — validação", () => {
  const src = R(FILES.outbox);
  it("usa paginação server-side (range + count exact) e cancela via abortSignal", () => {
    expect(src).toMatch(/\.range\(/);
    expect(src).toMatch(/count:\s*"exact"/);
    expect(src).toMatch(/abortSignal\(signal\)/);
  });
  it("possui empty state, loading state e retry após erro", () => {
    expect(src).toMatch(/Nenhuma mensagem encontrada/);
    expect(src).toMatch(/<Skeleton /);
    expect(src).toMatch(/Tentar novamente/);
  });
});

describe("Dead Letter — validação", () => {
  const src = R(FILES.dl);
  it("possui filtros (período, público, template) e paginação server-side", () => {
    expect(src).toMatch(/setDays\(/);
    expect(src).toMatch(/publicoFilter/);
    expect(src).toMatch(/templateFilter/);
    expect(src).toMatch(/\.range\(/);
    expect(src).toMatch(/count:\s*"exact"/);
    expect(src).toMatch(/abortSignal\(signal\)/);
  });
  it("possui ação 'Copiar erro' + retry", () => {
    expect(src).toMatch(/Copiar erro/);
    expect(src).toMatch(/copyToClipboard/);
    expect(src).toMatch(/Tentar novamente/);
  });
  it("empty state amigável", () => {
    expect(src).toMatch(/Sem mensagens em Dead Letter/);
  });
});

describe("Execuções — validação", () => {
  const src = R(FILES.exec);
  it("mostra coluna Resultado (SUCESSO/PARCIAL/FALHA) via execRowTone", () => {
    expect(src).toMatch(/execRowTone/);
    expect(src).toMatch(/<TableHead>Resultado<\/TableHead>/);
    expect(src).toMatch(/HealthDot/);
  });
  it("paginação server-side com cancelamento e retry", () => {
    expect(src).toMatch(/\.range\(/);
    expect(src).toMatch(/count:\s*"exact"/);
    expect(src).toMatch(/abortSignal\(signal\)/);
    expect(src).toMatch(/Tentar novamente/);
  });
});

describe("Health — validação", () => {
  const src = R(FILES.health);
  it("possui cards de Worker, Provider, Banco, Cron e Webhook", () => {
    expect(src).toMatch(/Worker/);
    expect(src).toMatch(/Provider \(Evolution\)/);
    expect(src).toMatch(/Banco de dados/);
    expect(src).toMatch(/Cron \(agendador\)/);
    expect(src).toMatch(/>Webhook</);
  });
  it("possui retry no estado de erro e auto-refresh 30s", () => {
    expect(src).toMatch(/Tentar novamente/);
    expect(src).toMatch(/refetchInterval:\s*autoRefresh\s*\?\s*30_?000/);
  });
});

describe("Configuração — validação", () => {
  const src = R(FILES.config);
  it("é somente leitura — sem inputs/mutations", () => {
    expect(src).not.toMatch(/useMutation/);
    expect(src).not.toMatch(/<Input/);
    expect(src).toMatch(/Somente leitura/);
  });
  it("exibe instância, URL pública, timeout, retries, provider e webhook", () => {
    expect(src).toMatch(/Instância/);
    expect(src).toMatch(/Base URL/);
    expect(src).toMatch(/Timeout/);
    expect(src).toMatch(/Máximo de tentativas/);
    expect(src).toMatch(/provider/);
    expect(src).toMatch(/Webhook habilitado/);
  });
});
