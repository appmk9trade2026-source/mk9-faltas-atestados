import { useSession, type AppRole } from "@/hooks/use-session";

/**
 * Escopo canônico da sessão para uso em query keys e gates de fetch.
 *
 * Fase 2 do escopo do Supervisor:
 *  - `keyParts` deve ser espalhado em toda queryKey de dado protegido,
 *    garantindo que caches nunca sejam reaproveitados entre usuários
 *    ou entre papéis distintos do mesmo usuário.
 *  - `ready` deve gatear o `enabled` de queries protegidas para evitar
 *    disparo antes de sessão/perfil/papel estarem hidratados.
 *  - `isSupervisorOnly` identifica usuários cujo único papel é
 *    "supervisor" — usado para exibir estados vazios e mensagens
 *    específicas quando não há colaboradores vinculados.
 *
 * A segurança real continua no banco (RLS + gates RBAC).
 * Este hook é uma camada de UX e hygiene de cache.
 */
export type SessionScope = {
  userId: string | null;
  primaryRole: AppRole | null;
  roles: AppRole[];
  ready: boolean;
  isSupervisorOnly: boolean;
  /** Espalhe em queryKey: ["ausencias", ...scope.keyParts, filtros] */
  keyParts: readonly [string, string];
};

export function useSessionScope(): SessionScope {
  const { loading, user, roles, primaryRole } = useSession();
  const userId = user?.id ?? null;
  const ready = !loading && !!userId;
  const isSupervisorOnly =
    roles.length > 0 && roles.every((r) => r === "supervisor");
  return {
    userId,
    primaryRole,
    roles,
    ready,
    isSupervisorOnly,
    keyParts: [userId ?? "anon", primaryRole ?? "none"] as const,
  };
}
