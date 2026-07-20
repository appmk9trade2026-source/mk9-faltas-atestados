// Presentational helpers for the WhatsApp admin panel.
// Never exposes payload, message text, CID, documents, or full phone numbers.

export const WA_STATUS = [
  "PENDENTE",
  "PROCESSANDO",
  "ENVIADO",
  "ENTREGUE",
  "LIDO",
  "FALHOU_TEMPORARIO",
  "FALHOU_DEFINITIVO",
  "CANCELADO",
] as const;

export type WaStatus = (typeof WA_STATUS)[number];

export const WA_STATUS_LABEL: Record<WaStatus, string> = {
  PENDENTE: "Pendente",
  PROCESSANDO: "Processando",
  ENVIADO: "Enviada",
  ENTREGUE: "Entregue",
  LIDO: "Lida",
  FALHOU_TEMPORARIO: "Falha temporária",
  FALHOU_DEFINITIVO: "Falha definitiva",
  CANCELADO: "Cancelada",
};

export const WA_PUBLICO = ["COLABORADOR", "RH", "SUPERVISOR"] as const;
export type WaPublico = (typeof WA_PUBLICO)[number];

export function maskPhoneDisplay(masked: string | null | undefined): string {
  if (!masked) return "—";
  // Values in DB already stored masked (e.g. "5511*****1234").
  // Extra safety: keep only last 4 digits and hide the rest.
  const digits = masked.replace(/\D+/g, "");
  if (digits.length <= 4) return "•••• " + digits;
  const last = digits.slice(-4);
  return `+•• ••• •••• ${last}`;
}

// Metadata keys that must NEVER be shown to admins — even if a legacy row
// happens to hold them. Aligned with the sanitization list from Fase 4.
const SENSITIVE_KEYS = [
  "message",
  "mensagem",
  "text",
  "texto",
  "body",
  "content",
  "conteudo",
  "phone",
  "telefone",
  "phone_number",
  "phoneNumber",
  "wa_id",
  "waid",
  "name",
  "nome",
  "cpf",
  "email",
  "cid",
  "diagnostico",
  "diagnosis",
  "document",
  "documento",
  "media_url",
  "mediaUrl",
  "url",
  "attachment",
  "anexo",
  "payload",
];

export function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => key.includes(s))) continue;
    if (rawVal && typeof rawVal === "object") {
      // recurse one level, then flatten
      const nested = sanitizeMetadata(rawVal);
      if (Object.keys(nested).length) out[rawKey] = nested;
    } else if (typeof rawVal === "string") {
      out[rawKey] = rawVal.length > 200 ? rawVal.slice(0, 200) + "…" : rawVal;
    } else if (rawVal === null || typeof rawVal === "number" || typeof rawVal === "boolean") {
      out[rawKey] = rawVal;
    }
  }
  return out;
}

export function statusTone(
  s: WaStatus | string | null | undefined,
): "success" | "warn" | "danger" | "info" | "muted" {
  switch (s) {
    case "LIDO":
    case "ENTREGUE":
      return "success";
    case "ENVIADO":
      return "info";
    case "PENDENTE":
    case "PROCESSANDO":
      return "warn";
    case "FALHOU_TEMPORARIO":
      return "warn";
    case "FALHOU_DEFINITIVO":
      return "danger";
    case "CANCELADO":
      return "muted";
    default:
      return "muted";
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m ${rs}s`;
}

export function avgSeconds(rows: { seconds: number | null }[]): number | null {
  const vals = rows.map((r) => r.seconds).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function fmtSeconds(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const rs = Math.round(sec - m * 60);
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  return `${h}h ${rm}m`;
}
