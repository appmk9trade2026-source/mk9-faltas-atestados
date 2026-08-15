// RBAC — camada de acesso RPC (Fase 2).
//
// Todas as funções usam o Supabase client autenticado (respeita RLS e
// gates de `has_permission` no banco). Nunca use service role aqui.

import { supabase } from "@/integrations/supabase/client";
import { invalidatePermissions, type PermissionCode } from "@/lib/permissions";
import type { AppRole } from "@/hooks/use-session";

export type MatrixRow = {
  code: PermissionCode;
  module: string;
  action: string;
  description: string | null;
};

export type RbacMatrix = {
  permissions: MatrixRow[];
  role_permissions: { role: AppRole; permission_code: PermissionCode }[];
  critical_super_admin: PermissionCode[];
};

export async function fetchRbacMatrix(): Promise<RbacMatrix> {
  const { data, error } = await supabase.rpc("rbac_matrix");
  if (error) throw error;
  return data as unknown as RbacMatrix;
}

export type MatrixChange = {
  role: AppRole;
  permission_code: PermissionCode;
  action: "grant" | "revoke";
};

export async function applyRoleMatrix(changes: MatrixChange[]): Promise<{ applied: number; correlation_id: string }> {
  const traceId = crypto.randomUUID();
  try {
    const { data, error } = await supabase.rpc("rbac_apply_role_matrix", {
      _changes: changes as never,
    } as never);
    if (error) {
      console.error(`[RBAC] Matrix Apply Error [trace=${traceId}]`, error);
      throw error;
    }
    invalidatePermissions();
    return data as unknown as { applied: number; correlation_id: string };
  } catch (err) {
    throw err;
  }
}

export type UserPermissionMode = "inherit" | "allow" | "deny";

export type RbacUserSummary = {
  user_id: string;
  roles: AppRole[];
  from_role: PermissionCode[];
  allows: PermissionCode[];
  denies: PermissionCode[];
  effective: PermissionCode[];
};

export async function fetchUserSummary(userId: string): Promise<RbacUserSummary> {
  const { data, error } = await supabase.rpc("rbac_user_summary", { _user_id: userId } as never);
  if (error) throw error;
  return data as unknown as RbacUserSummary;
}

export async function applyUserPermission(
  userId: string,
  code: PermissionCode,
  mode: UserPermissionMode,
): Promise<void> {
  const { error } = await supabase.rpc("rbac_apply_user_permission", {
    _user_id: userId,
    _code: code,
    _mode: mode,
  } as never);
  if (error) throw error;
  invalidatePermissions();
}
