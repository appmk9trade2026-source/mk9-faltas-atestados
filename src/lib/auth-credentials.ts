/**
 * Normalização e diagnóstico das credenciais de login do CRM MK9.
 *
 * Motivo: as credenciais do primeiro acesso costumam chegar por WhatsApp e são
 * coladas com espaços, quebras de linha e caracteres invisíveis (zero-width,
 * NBSP). O provedor de autenticação compara a senha byte a byte e o e-mail em
 * minúsculas — colagens "sujas" resultam em "credenciais inválidas" mesmo com
 * a senha correta.
 */

const INVISIVEIS = /[\u200B-\u200D\uFEFF\u00A0\u2060]/g;

export function normalizeLoginEmail(v: string): string {
  return v.replace(INVISIVEIS, " ").trim().toLowerCase();
}

/**
 * Remove caracteres invisíveis e espaços/quebras nas extremidades.
 * Espaços internos são preservados (podem fazer parte da senha pessoal).
 */
export function sanitizeSenhaColada(v: string): string {
  return v.replace(INVISIVEIS, "").replace(/^[\s\r\n]+|[\s\r\n]+$/g, "");
}

export type AuthErrorLike = { message?: string; status?: number; code?: string } | null | undefined;

/**
 * Traduz o erro do provedor em uma mensagem acionável.
 * Nunca revela se o e-mail existe — apenas diferencia causas técnicas
 * (rate limit, e-mail não confirmado, conta bloqueada) de credencial inválida.
 */
export function mapAuthError(err: AuthErrorLike, contexto: "login" | "primeiro_acesso" = "login"): string {
  const msg = (err?.message ?? "").toLowerCase();
  const code = (err?.code ?? "").toLowerCase();
  const status = err?.status;

  if (status === 429 || code.includes("rate_limit") || msg.includes("rate limit")) {
    return "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.";
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado. Contate o Super Admin.";
  }
  if (msg.includes("banned") || msg.includes("user is banned")) {
    return "Sua conta está bloqueada. Contate o Super Admin.";
  }
  if (status && status >= 500) {
    return "O serviço de autenticação está instável. Tente novamente em instantes.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }
  if (msg.includes("weak password") || code.includes("weak_password")) {
    return "Esta senha foi recusada pela política de segurança. Escolha outra senha.";
  }
  return contexto === "primeiro_acesso"
    ? "E-mail ou senha temporária inválidos. Confira se não há espaços extras ao colar e, se necessário, peça ao Super Admin para redefinir sua senha temporária."
    : "E-mail ou senha inválidos. Confira se não há espaços extras ao colar a senha. Se você recebeu uma senha temporária, use o botão “Primeiro acesso com senha temporária”.";
}

