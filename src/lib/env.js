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
const REQUIRED_KEYS = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
];
const raw = (import.meta.env ?? {});
function readString(key, fallback = "") {
    const v = raw[key];
    return typeof v === "string" ? v : fallback;
}
function readBool(key, fallback = false) {
    const v = raw[key];
    if (v == null)
        return fallback;
    return v === "1" || v === "true" || v === "TRUE";
}
function detectEnvironment() {
    const explicit = readString("VITE_APP_ENV").toLowerCase();
    if (explicit === "production" || explicit === "prod")
        return "production";
    if (explicit === "homologacao" || explicit === "homolog" || explicit === "uat")
        return "homologacao";
    if (explicit === "preview" || explicit === "staging")
        return "preview";
    if (explicit === "development" || explicit === "dev")
        return "development";
    // Fallback por hostname (execução no browser)
    if (typeof window !== "undefined") {
        const host = window.location.hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1")
            return "development";
        if (host.includes("id-preview--") || host.includes("-dev.lovable.app"))
            return "preview";
        if (host.includes("homolog"))
            return "homologacao";
        if (host.endsWith(".lovable.app") || host.endsWith(".lovable.dev"))
            return "production";
    }
    return import.meta.env.DEV ? "development" : "production";
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
};
/**
 * Falha rápido caso variáveis obrigatórias estejam ausentes.
 * Nunca inclui o valor da variável na mensagem.
 */
export function assertEnv() {
    const missing = REQUIRED_KEYS.filter((k) => !readString(k));
    if (missing.length > 0) {
        throw new Error(`[env] Variáveis obrigatórias ausentes: ${missing.join(", ")}. ` +
            "Configure-as antes de iniciar a aplicação.");
    }
}
/**
 * Rótulo curto do ambiente para exibição na UI.
 */
export function environmentLabel(e = environment) {
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
export function assertNonProduction(operation) {
    if (env.isProduction) {
        throw new Error(`[env] Operação "${operation}" bloqueada em produção.`);
    }
}
