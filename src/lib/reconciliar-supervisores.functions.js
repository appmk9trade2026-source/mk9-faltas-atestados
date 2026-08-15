// Reconciliar Supervisores — backfill administrativo.
// Chave oficial: colaboradores.supervisor_email → profiles.email (papel supervisor) → profiles.id.
// Preenche colaboradores.supervisor_usuario_id apenas quando existe correspondência única e válida.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const reconciliarSupervisores = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("backfill_supervisor_usuario_id");
    if (error) {
        if (/insufficient_privilege|permission|not authorized/i.test(error.message)) {
            throw new Error("SCOPE_DENIED: apenas Super Admin ou RH podem reconciliar supervisores.");
        }
        throw new Error(error.message);
    }
    return (data ?? {
        processados: 0, atualizados: 0, encontrado: 0, inexistente: 0,
        email_vazio: 0, email_invalido: 0, duplicidade: 0, sem_papel_supervisor: 0,
        detalhes: [],
    });
});
