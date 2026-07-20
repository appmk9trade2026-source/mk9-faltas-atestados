// Componentes reutilizáveis de autorização (RBAC — Fase 2).
//
// - <Can permission="..."> — renderiza filhos apenas se autorizado.
// - <PermissionGate permission="..." fallback={...}> — versão com fallback.
// - useCan("...") — booleano reativo.
// - <RequirePermission> — guarda de rota: mostra 403 amigável.
//
// Toda decisão espelha public.has_permission no banco. RLS é a fonte final
// da verdade; estes componentes apenas escondem UI.

import { type ReactNode, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  logPermissionDenied,
  usePermissions,
  type PermissionCode,
} from "@/lib/permissions";

/** Booleano reativo para uma permissão. */
export function useCan(permission: PermissionCode): { allowed: boolean; loading: boolean } {
  const { has, loading } = usePermissions();
  return { allowed: has(permission), loading };
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionCode;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { allowed, loading } = useCan(permission);
  if (loading) return null;
  return <>{allowed ? children : fallback}</>;
}

/** Alias semântico — igual a <Can /> mas nome mais explícito para gates de UI. */
export const PermissionGate = Can;

export function RequirePermission({
  permission,
  children,
  route,
}: {
  permission: PermissionCode;
  children: ReactNode;
  route?: string;
}) {
  const { allowed, loading } = useCan(permission);
  const logged = useRef(false);

  useEffect(() => {
    if (!loading && !allowed && !logged.current) {
      logged.current = true;
      void logPermissionDenied(permission, { rota: route });
    }
  }, [allowed, loading, permission, route]);

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold">Acesso negado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Você não possui permissão para acessar este recurso.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Permissão exigida: <code className="rounded bg-muted px-1.5 py-0.5">{permission}</code>
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link to="/dashboard">Voltar ao dashboard</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
