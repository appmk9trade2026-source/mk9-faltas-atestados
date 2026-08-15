/**
 * Papéis autorizados para o módulo WhatsApp Admin.
 * Fonte única de verdade — usado por sidebar, rotas e testes.
 */
export const WHATSAPP_ADMIN_ROLES = ["super_admin", "compliance", "rh"];
export function canAccessWhatsappAdmin(roles) {
    if (!roles)
        return false;
    return WHATSAPP_ADMIN_ROLES.some((r) => roles.includes(r));
}
