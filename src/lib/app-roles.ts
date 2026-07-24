import { z } from "zod";

/**
 * Fonte única de verdade dos papéis (RBAC) do CRM MK9.
 * Deve refletir exatamente o enum `app_role` do banco.
 */
export const APP_ROLES = [
  "super_admin",
  "rh",
  "coordenador",
  "supervisor",
  "compliance",
  "operacao",
  "visualizador",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const appRoleSchema = z.enum(APP_ROLES);

/**
 * Papéis operacionais para os quais a matrícula é obrigatória.
 * Fonte oficial: `profiles.matricula` (texto, preserva zeros à esquerda).
 */
export const ROLES_QUE_EXIGEM_MATRICULA: readonly AppRole[] = [
  "supervisor",
] as const;

export function rolesExigemMatricula(roles: readonly AppRole[]): boolean {
  return roles.some((r) => ROLES_QUE_EXIGEM_MATRICULA.includes(r));
}

/**
 * Normaliza matrícula preservando zeros à esquerda:
 * - remove espaços nas extremidades
 * - colapsa espaços internos
 * - NUNCA converte para número
 * Retorna `null` quando o valor for vazio/apenas espaços.
 */
export function normalizeMatriculaUsuario(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s.length === 0 ? null : s;
}
