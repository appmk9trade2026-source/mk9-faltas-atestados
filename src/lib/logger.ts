/**
 * Logger padronizado para o frontend.
 * - Não registra tokens, senhas, chaves ou dados sensíveis.
 * - Em produção, apenas `error` e `warn` são emitidos.
 * - Sanitiza objetos removendo chaves conhecidas antes de logar.
 */
const SENSITIVE_KEYS = [
  "password", "senha", "token", "access_token", "refresh_token",
  "authorization", "api_key", "apikey", "secret", "service_role",
  "cpf", "rg",
];

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

const isDev = import.meta.env.DEV;

export const logger = {
  debug(scope: string, ...args: unknown[]) {
    if (isDev) console.debug(`[${scope}]`, ...args.map(sanitize));
  },
  info(scope: string, ...args: unknown[]) {
    if (isDev) console.info(`[${scope}]`, ...args.map(sanitize));
  },
  warn(scope: string, ...args: unknown[]) {
    console.warn(`[${scope}]`, ...args.map(sanitize));
  },
  error(scope: string, ...args: unknown[]) {
    console.error(`[${scope}]`, ...args.map(sanitize));
  },
};
