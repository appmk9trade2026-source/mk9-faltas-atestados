/**
 * Armazém em memória (por aba/processo) da senha temporária digitada no
 * primeiro login. Serve APENAS para permitir que a tela `/auth/nova-senha`
 * bloqueie o reuso dessa mesma senha como senha pessoal.
 *
 * Nunca persistido em localStorage/sessionStorage/URL/logs. É descartado
 * ao concluir (clear) e também ao recarregar a página.
 */
let captured: string | null = null;

export function setFirstLoginPassword(pw: string): void {
  captured = typeof pw === "string" && pw.length > 0 ? pw : null;
}

export function getFirstLoginPassword(): string | null {
  return captured;
}

export function clearFirstLoginPassword(): void {
  captured = null;
}

/** Compara a candidata com a senha temporária capturada, sem expô-la. */
export function isSameAsFirstLoginPassword(candidate: string): boolean {
  return captured !== null && captured.length > 0 && candidate === captured;
}
