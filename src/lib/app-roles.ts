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
