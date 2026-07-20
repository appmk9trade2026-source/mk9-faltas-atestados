// RBAC Fase 3 — códigos de erro padronizados + mapeamento amigável.
//
// Nunca exponha stack, SQLSTATE ou nome de policy ao usuário.
// Toda mutação hardened joga erros com esta forma "CODE: descrição" e
// o backend anexa um HINT com o correlation_id.

export const RBAC_ERROR_CODES = [
  "AUTH_REQUIRED",
  "PERMISSION_DENIED",
  "COMPANY_SCOPE_DENIED",
  "PROJECT_SCOPE_DENIED",
  "COLLABORATOR_SCOPE_DENIED",
  "INVALID_PAYLOAD",
  "RESOURCE_NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
] as const;
export type RbacErrorCode = (typeof RBAC_ERROR_CODES)[number];

export type RbacErrorShape = {
  code: RbacErrorCode | "UNKNOWN";
  message: string;
  correlationId?: string;
};

const CODE_SET = new Set<string>(RBAC_ERROR_CODES);

/** Extrai `{ code, message, correlationId }` de qualquer erro RBAC serializado. */
export function parseRbacError(err: unknown): RbacErrorShape {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (err as { message?: string })?.message ?? "";
  const hint = (err as { hint?: string; details?: string } | null)?.hint ?? undefined;
  const m = /^([A-Z_]+):\s?(.*)$/s.exec(raw);
  if (m && CODE_SET.has(m[1])) {
    return { code: m[1] as RbacErrorCode, message: m[2] || m[1], correlationId: hint };
  }
  return { code: "UNKNOWN", message: raw || "Erro desconhecido", correlationId: hint };
}

const FRIENDLY: Record<RbacErrorCode, string> = {
  AUTH_REQUIRED: "Sua sessão expirou. Faça login novamente.",
  PERMISSION_DENIED: "Você não possui permissão para realizar esta ação.",
  COMPANY_SCOPE_DENIED: "Esta empresa não está disponível no seu escopo de acesso.",
  PROJECT_SCOPE_DENIED: "Este projeto não está disponível no seu escopo de acesso.",
  COLLABORATOR_SCOPE_DENIED: "Este colaborador não está disponível no seu escopo de acesso.",
  INVALID_PAYLOAD: "Os dados enviados são inválidos.",
  RESOURCE_NOT_FOUND: "Registro não encontrado.",
  CONFLICT: "Operação em conflito com o estado atual do registro.",
  RATE_LIMITED: "Muitas tentativas em pouco tempo. Aguarde alguns instantes.",
};

/** Mensagem amigável ao usuário — nunca vaza detalhes técnicos. */
export function friendlyRbacError(err: unknown): { title: string; description?: string; correlationId?: string } {
  const shape = parseRbacError(err);
  if (shape.code === "UNKNOWN") {
    return { title: "Não foi possível concluir a operação.", description: shape.message.slice(0, 240), correlationId: shape.correlationId };
  }
  return { title: FRIENDLY[shape.code], correlationId: shape.correlationId };
}
