/**
 * Configuração pública e validação de variáveis de ambiente.
 *
 * Regras:
 * - Apenas variáveis públicas (prefixo VITE_).
 * - Chaves obrigatórias falham em `assertEnv()` com mensagem clara,
 *   sem exibir o valor.
 * - Em produção, testes destrutivos e logs detalhados ficam desabilitados
 *   independentemente do que estiver configurado.
 * - Nunca importe, refira ou exponha service_role, JWT secret ou senha de
 *   banco a partir deste módulo.
 */

export type AppEnvironment = "development" | "preview" | "homologacao" | "production";

const REQUIRED_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

const raw = (import.meta.env ?? {}) as Record<string, string | undefined>;

function readString(key: string, fallback = ""): string {
  const v = raw[key];
  return typeof v === "string" ? v : fallback;
}

function readBool(key: string, fallback = false): boolean {
  const v = raw[key];
  if (v == null) return fallback;
  return v === "1" || v === "true" || v === "TRUE";
}

function detectEnvironment(): AppEnvironment {
  // 1. Explicit override via env var (Highest priority, safe for SSR)
  const explicit = readString("VITE_APP_ENV").toLowerCase();
  if (explicit === "production" || explicit === "prod") return "production";
  if (explicit === "homologacao" || explicit === "homolog" || explicit === "uat") return "homologacao";
  if (explicit === "preview" || explicit === "staging") return "preview";
  if (explicit === "development" || explicit === "dev") return "development";

  // 2. Browser-only detection (Can cause hydration mismatch if used in SSR)
  // We avoid this for values that are rendered directly in the initial HTML.
  
  // 3. Static build-time detection (Safe for SSR)
  return import.meta.env.PROD ? "production" : "development";
}

const environment = detectEnvironment();

export const env = {
  appName: readString("VITE_APP_NAME", "CRM MK9"),
  appVersion: readString("VITE_APP_VERSION", "1.0.0"),
  buildDate: readString("VITE_APP_BUILD_DATE"),
  commit: readString("VITE_APP_COMMIT"),
  environment,
  isProduction: environment === "production",
  supabaseUrl: readString("VITE_SUPABASE_URL"),
  supabaseProjectId: readString("VITE_SUPABASE_PROJECT_ID"),
  // Em produção sempre falso, independentemente da flag configurada
  testFeaturesEnabled: environment !== "production" && readBool("VITE_ENABLE_TEST_FEATURES", false),
  debugLogsEnabled: environment !== "production" && readBool("VITE_ENABLE_DEBUG_LOGS", false),
} as const;

/**
 * Falha rápido caso variáveis obrigatórias estejam ausentes.
 * Nunca inclui o valor da variável na mensagem.
 */
export function assertEnv(): void {
  const missing = REQUIRED_KEYS.filter((k) => !readString(k));
  if (missing.length > 0) {
    throw new Error(
      `[env] Variáveis obrigatórias ausentes: ${missing.join(", ")}. ` +
        "Configure-as antes de iniciar a aplicação.",
    );
  }
}

/**
 * Rótulo curto do ambiente para exibição na UI.
 */
export function environmentLabel(e: AppEnvironment = environment): string {
  switch (e) {
    case "production": return "Produção";
    case "homologacao": return "Homologação";
    case "preview": return "Preview";
    case "development": return "Desenvolvimento";
  }
}

/**
 * Bloqueio explícito de operações destrutivas em produção,
 * usado por scripts de teste e utilitários administrativos.
 */
export function assertNonProduction(operation: string): void {
  if (env.isProduction) {
    throw new Error(`[env] Operação "${operation}" bloqueada em produção.`);
  }
}
