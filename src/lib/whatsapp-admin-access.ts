import type { AppRole } from "@/hooks/use-session";

/**
 * Papéis autorizados para o módulo WhatsApp Admin.
 * Fonte única de verdade — usado por sidebar, rotas e testes.
 */
export const WHATSAPP_ADMIN_ROLES: AppRole[] = ["super_admin", "compliance", "rh"];

export function canAccessWhatsappAdmin(roles: readonly AppRole[] | AppRole[] | undefined | null): boolean {
  if (!roles) return false;
  return WHATSAPP_ADMIN_ROLES.some((r) => roles.includes(r));
}
