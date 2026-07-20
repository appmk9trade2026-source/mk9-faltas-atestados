// RBAC — helper de permissões granulares (Fase 1).
//
// Uso:
//   const { has, loading } = usePermissions();
//   if (has("ausencia.criar")) { ... }
//
// A resolução real vive no banco (função `has_permission` +
// `my_permissions`). O frontend é um espelho para esconder ações;
// toda mutação continua sendo validada por RLS/policies.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PermissionCode =
  | "dashboard.visualizar"
  | "empresa.visualizar" | "empresa.criar" | "empresa.editar" | "empresa.excluir"
  | "projeto.visualizar" | "projeto.criar" | "projeto.editar" | "projeto.excluir"
  | "colaborador.visualizar" | "colaborador.criar" | "colaborador.editar" | "colaborador.excluir"
  | "ausencia.visualizar" | "ausencia.criar" | "ausencia.editar" | "ausencia.excluir"
  | "atestado.visualizar" | "atestado.criar" | "atestado.editar"
  | "usuario.visualizar" | "usuario.criar" | "usuario.editar"
  | "relatorio.visualizar" | "relatorio.exportar"
  | "historico.visualizar"
  | "auditoria.visualizar"
  | "configuracao.visualizar"
  | "assistente.consultar"
  | "whatsapp.visualizar"
  | "alerta.visualizar";

export const ALL_PERMISSIONS: PermissionCode[] = [
  "dashboard.visualizar",
  "empresa.visualizar", "empresa.criar", "empresa.editar", "empresa.excluir",
  "projeto.visualizar", "projeto.criar", "projeto.editar", "projeto.excluir",
  "colaborador.visualizar", "colaborador.criar", "colaborador.editar", "colaborador.excluir",
  "ausencia.visualizar", "ausencia.criar", "ausencia.editar", "ausencia.excluir",
  "atestado.visualizar", "atestado.criar", "atestado.editar",
  "usuario.visualizar", "usuario.criar", "usuario.editar",
  "relatorio.visualizar", "relatorio.exportar",
  "historico.visualizar",
  "auditoria.visualizar",
  "configuracao.visualizar",
  "assistente.consultar",
  "whatsapp.visualizar",
  "alerta.visualizar",
];

export type PermissionSet = Set<string>;

/**
 * Verifica se um conjunto resolvido inclui a permissão pedida.
 * Uso fora de React: `hasPermission(set, "ausencia.criar")`.
 */
export function hasPermission(set: PermissionSet | null | undefined, code: PermissionCode): boolean {
  if (!set) return false;
  return set.has(code);
}

/**
 * Registra uma tentativa de acesso negada. Sempre chame quando bloquear
 * uma ação por permissão — o backend também loga em mutações protegidas.
 */
export async function logPermissionDenied(
  code: PermissionCode,
  ctx?: { rota?: string; empresaId?: string; projetoId?: string; observacoes?: string },
): Promise<void> {
  try {
    await supabase.rpc("log_permission_denied", {
      _code: code,
      _rota: ctx?.rota ?? (typeof window !== "undefined" ? window.location.pathname : null),
      _empresa_id: ctx?.empresaId ?? null,
      _projeto_id: ctx?.projetoId ?? null,
      _observacoes: ctx?.observacoes ?? null,
    } as never);
  } catch {
    /* silencioso — auditoria não pode quebrar a UI */
  }
}

let cache: { set: PermissionSet; at: number } | null = null;
const listeners = new Set<(s: PermissionSet) => void>();

async function fetchMyPermissions(): Promise<PermissionSet> {
  const { data, error } = await supabase.rpc("my_permissions");
  if (error) throw error;
  const rows = (data ?? []) as { permission_code: string }[];
  return new Set(rows.map((r) => r.permission_code));
}

export function invalidatePermissions() {
  cache = null;
  listeners.forEach((l) => l(new Set()));
}

/**
 * Hook React — carrega e mantém em cache as permissões efetivas do
 * usuário autenticado. Reage a login/logout.
 */
export function usePermissions() {
  const [set, setSet] = useState<PermissionSet | null>(cache?.set ?? null);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchMyPermissions();
      cache = { set: s, at: Date.now() };
      setSet(s);
      setError(null);
      listeners.forEach((l) => l(s));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cache) void reload();
    const sub = supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_OUT") {
        invalidatePermissions();
        setSet(new Set());
      } else if (ev === "SIGNED_IN" || ev === "USER_UPDATED") {
        void reload();
      }
    });
    return () => sub.data.subscription.unsubscribe();
  }, [reload]);

  const has = useCallback(
    (code: PermissionCode) => hasPermission(set, code),
    [set],
  );

  return { permissions: set, has, loading, error, reload };
}
