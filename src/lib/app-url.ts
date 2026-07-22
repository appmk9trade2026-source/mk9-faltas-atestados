/**
 * URL pública oficial do CRM MK9.
 *
 * Fonte única para links enviados em comunicações (WhatsApp, e-mails, convites).
 * Pode ser sobrescrita em runtime pela variável de ambiente `APP_PUBLIC_URL`
 * (server-side) — útil para preview/staging.
 */
export const DEFAULT_APP_PUBLIC_URL = "https://mk9-faltas-atestados.lovable.app";

export function getAppPublicUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env?.APP_PUBLIC_URL : undefined;
  const trimmed = (fromEnv ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_APP_PUBLIC_URL;
}
