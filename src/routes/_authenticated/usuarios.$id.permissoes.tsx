import * as React from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequirePermission } from "@/components/rbac/can";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchUserSummary,
  applyUserPermission,
  fetchRbacMatrix,
  type UserPermissionMode,
} from "@/lib/rbac";
import type { PermissionCode } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/usuarios/$id/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões do Usuário · CRM MK9" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UserPermissionsPage,
});

function UserPermissionsPage() {
  return (
    <AppShell title="Permissões do usuário" breadcrumb={["Administração", "Usuários", "Permissões"]}>
      <RequirePermission permission="permissao.visualizar" route="/usuarios/$id/permissoes">
        <UserPermissionsEditor />
      </RequirePermission>
    </AppShell>
  );
}

function UserPermissionsEditor() {
  const { id } = useParams({ from: "/_authenticated/usuarios/$id/permissoes" });
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome, email").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const matrixQ = useQuery({ queryKey: ["rbac-matrix"], queryFn: fetchRbacMatrix });
  const summaryQ = useQuery({
    queryKey: ["rbac-user-summary", id],
    queryFn: () => fetchUserSummary(id),
  });

  const mut = useMutation({
    mutationFn: (v: { code: PermissionCode; mode: UserPermissionMode }) =>
      applyUserPermission(id, v.code, v.mode),
    onSuccess: () => {
      toast.success("Override aplicado.");
      void qc.invalidateQueries({ queryKey: ["rbac-user-summary", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao aplicar override."),
  });

  if (matrixQ.isLoading || summaryQ.isLoading || !matrixQ.data || !summaryQ.data) {
    return <Skeleton className="h-96 w-full" />;
  }

  const summary = summaryQ.data;
  const permissions = matrixQ.data.permissions;
  const roleSet = new Set(summary.from_role);
  const allowSet = new Set(summary.allows);
  const denySet = new Set(summary.denies);

  function currentMode(code: PermissionCode): UserPermissionMode {
    if (denySet.has(code)) return "deny";
    if (allowSet.has(code)) return "allow";
    return "inherit";
  }

  const stats = {
    perfil: roleSet.size,
    allows: allowSet.size,
    denies: denySet.size,
    efetivas: summary.effective.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/usuarios"><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{profileQ.data?.nome ?? "Usuário"}</h2>
            <p className="text-sm text-muted-foreground">{profileQ.data?.email}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {summary.roles.map((r) => (
                <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <Stat label="Do perfil" value={stats.perfil} />
            <Stat label="Allows" value={stats.allows} tone="allow" />
            <Stat label="Denies" value={stats.denies} tone="deny" />
            <Stat label="Efetivas" value={stats.efetivas} tone="effective" />
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          As permissões controlam funcionalidades. O acesso aos dados continua limitado pelas regras de escopo e RLS.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Permissão</th>
                <th className="px-3 py-2 text-center font-medium">Perfil</th>
                <th className="px-3 py-2 text-center font-medium">Override</th>
                <th className="px-3 py-2 text-center font-medium">Efetivo</th>
                <th className="px-3 py-2 text-center font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => {
                const perfil = roleSet.has(p.code);
                const mode = currentMode(p.code);
                const effective = denySet.has(p.code) ? false : allowSet.has(p.code) || perfil;
                return (
                  <tr key={p.code} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <code className="text-[12px] font-mono">{p.code}</code>
                      <div className="text-[11px] text-muted-foreground">{p.description}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {perfil
                        ? <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">Permitido</Badge>
                        : <span className="text-[11px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {mode === "allow" && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40 text-[10px]">Permitir</Badge>}
                      {mode === "deny" && <Badge className="bg-destructive/15 text-destructive border-destructive/40 text-[10px]">Negar</Badge>}
                      {mode === "inherit" && <span className="text-[11px] text-muted-foreground">Herda</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {effective
                        ? <ShieldCheck className="mx-auto h-4 w-4 text-emerald-600" />
                        : <ShieldX className="mx-auto h-4 w-4 text-destructive" />}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex overflow-hidden rounded-md border">
                        {(["inherit", "allow", "deny"] as UserPermissionMode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={mut.isPending}
                            onClick={() => mut.mutate({ code: p.code, mode: m })}
                            className={cn(
                              "px-2 py-1 text-[11px] transition-colors",
                              mode === m
                                ? m === "allow"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : m === "deny"
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/60",
                            )}
                          >
                            {m === "inherit" ? "Herdar" : m === "allow" ? "Permitir" : "Negar"}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "allow" | "deny" | "effective" }) {
  return (
    <div>
      <div
        className={cn(
          "text-2xl font-semibold",
          tone === "allow" && "text-emerald-600",
          tone === "deny" && "text-destructive",
          tone === "effective" && "text-primary",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
