import { env, environmentLabel } from "./env";
export const APP_NAME = env.appName;
export const APP_VERSION = env.appVersion;
export const APP_ENV = env.environment;
export const APP_ENV_LABEL = environmentLabel();
export const APP_BUILD_DATE = env.buildDate;
export const APP_COMMIT = env.commit;
/**
 * Rótulo compacto exibido em rodapés e páginas técnicas.
 * Exemplo: "v1.0.0 · Produção · Build 2026-07-18 · abc1234"
 */
export function buildStamp() {
    const parts = [`v${APP_VERSION}`, APP_ENV_LABEL];
    if (APP_BUILD_DATE) {
        const d = APP_BUILD_DATE.slice(0, 10);
        parts.push(`Build ${d}`);
    }
    if (APP_COMMIT)
        parts.push(APP_COMMIT.slice(0, 7));
    return parts.join(" · ");
}
