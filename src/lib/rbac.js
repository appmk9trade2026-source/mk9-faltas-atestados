// RBAC — camada de acesso RPC (Fase 2).
//
// Todas as funções usam o Supabase client autenticado (respeita RLS e
// gates de `has_permission` no banco). Nunca use service role aqui.
import { supabase } from "@/integrations/supabase/client";
import { invalidatePermissions } from "@/lib/permissions";
export async function fetchRbacMatrix() {
    const { data, error } = await supabase.rpc("rbac_matrix");
    if (error)
        throw error;
    return data;
}
export async function applyRoleMatrix(changes) {
    const traceId = crypto.randomUUID();
    try {
        const { data, error } = await supabase.rpc("rbac_apply_role_matrix", {
            _changes: changes,
        });
        if (error) {
            console.error(`[RBAC] Matrix Apply Error [trace=${traceId}]`, error);
            throw error;
        }
        invalidatePermissions();
        return data;
    }
    catch (err) {
        throw err;
    }
}
export async function fetchUserSummary(userId) {
    const { data, error } = await supabase.rpc("rbac_user_summary", { _user_id: userId });
    if (error)
        throw error;
    return data;
}
export async function applyUserPermission(userId, code, mode) {
    const { error } = await supabase.rpc("rbac_apply_user_permission", {
        _user_id: userId,
        _code: code,
        _mode: mode,
    });
    if (error)
        throw error;
    invalidatePermissions();
}
