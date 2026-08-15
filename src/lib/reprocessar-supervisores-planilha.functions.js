// Reprocessa vínculos de Supervisor a partir da planilha original.
// Sem alterar RLS/RBAC/score. Guardado por RH ou Super Admin nas RPCs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const rowSchema = z.object({
    linha: z.union([z.number(), z.string()]).optional(),
    matricula: z.string().trim().min(1),
    supervisor_email: z.string().trim().max(200).optional().default(""),
    supervisor_nome: z.string().trim().max(200).optional().default(""),
});
function friendly(e) {
    if (/insufficient_privilege|permission|not authorized/i.test(e.message)) {
        return new Error("SCOPE_DENIED: apenas Super Admin ou RH podem reprocessar supervisores.");
    }
    return new Error(e.message);
}
export const reprocessarSupervisoresPlanilha = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => z.object({ rows: z.array(rowSchema).min(1).max(500) }).parse(data))
    .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("reprocess_supervisor_batch", { _rows: data.rows });
    if (error)
        throw friendly(error);
    return result;
});
export const confirmarVinculoSupervisor = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => z.object({
    colaborador_id: z.string().uuid(),
    supervisor_usuario_id: z.string().uuid(),
}).parse(data))
    .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("confirmar_vinculo_supervisor", { _colaborador_id: data.colaborador_id, _supervisor_usuario_id: data.supervisor_usuario_id });
    if (error)
        throw friendly(error);
    return result;
});
