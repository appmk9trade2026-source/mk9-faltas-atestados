/**
 * Guard destructive automated tests from running against production.
 *
 * A "destructive" test creates, updates, imports, or changes status of any
 * real record. Read-only smoke tests are always allowed.
 *
 * Any dataset created by tests MUST use the `AUTOMATED_TEST_` / `E2E_` /
 * `TEST_` prefixes so the audit trail can filter it.
 */
export const TEST_PREFIXES = ["AUTOMATED_TEST_", "E2E_", "TEST_"];
export const AUDIT_ORIGIN = "AUTOMATED_TEST";
export function detectEnv(url) {
    const target = (url ?? process.env.TEST_BASE_URL ?? "").toLowerCase();
    if (!target)
        return "unknown";
    if (target.includes("localhost") || target.includes("127.0.0.1"))
        return "development";
    if (target.includes("id-preview--") || target.includes("-dev.lovable.app"))
        return "preview";
    if (target.includes("homolog"))
        return "homologacao";
    if (target.includes(".lovable.app") || target.includes(".lovable.dev"))
        return "production";
    return "unknown";
}
export function assertMutableEnv(url) {
    const env = detectEnv(url);
    if (env === "production") {
        throw new Error(`[test-guard] Destructive tests are blocked against production (${url ?? "TEST_BASE_URL"}). ` +
            "Only smoke/read-only suites may run in production.");
    }
}
export function isTestArtifact(label) {
    if (!label)
        return false;
    return TEST_PREFIXES.some((p) => label.startsWith(p));
}
