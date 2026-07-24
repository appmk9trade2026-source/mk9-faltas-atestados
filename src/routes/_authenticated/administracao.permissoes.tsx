import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Save, RotateCcw, ShieldAlert, Check, X, Minus } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RequirePermission } from "@/components/rbac/can";
import { useCan } from "@/components/rbac/can";
import type { AppRole } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import {
  fetchRbacMatrix,
  applyRoleMatrix,
  type MatrixChange,
  type RbacMatrix,
} from "@/lib/rbac";
import type { PermissionCode } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/administracao/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões · CRM MK9" },
      { name: "description", content: "Matriz de permissões por perfil e overrides individuais." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PermissoesPage,
});

const ROLES: { key: AppRole; label: string }[] = [
  { key: "super_admin", label: "Super Admin" },
  { key: "rh", label: "RH" },
  { key: "coordenador", label: "Coordenador" },
  { key: "compliance", label: "Compliance" },
  { key: "supervisor", label: "Supervisor" },
  { key: "operacao", label: "Operação" },
  { key: "visualizador", label: "Visualizador" },
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  empresa: "Empresas",
  projeto: "Projetos",
  colaborador: "Colaboradores",
  ausencia: "Ausências",
  atestado: "Atestados",
  usuario: "Usuários",
  relatorio: "Relatórios",
  historico: "Histórico",
  auditoria: "Auditoria",
  alerta: "Alertas",
  whatsapp: "WhatsApp",
  assistente: "Assistente IA",
  configuracao: "Configurações",
  permissao: "Permissões",
};

function PermissoesPage() {
  return (
    <AppShell title="Permissões" breadcrumb={["Administração", "Permissões"]}>
      <RequirePermission permission="permissao.visualizar" route="/administracao/permissoes">
        <MatrixEditor />
      </RequirePermission>
    </AppShell>
  );
}

type Pending = Map<string, MatrixChange>; // key = `${role}:${code}`

function pendKey(role: AppRole, code: PermissionCode) {
  return `${role}:${code}`;
}

function MatrixEditor() {
  const qc = useQueryClient();
  const { allowed: canEdit } = useCan("permissao.editar");
  const [search, setSearch] = React.useState("");
  const [moduleFilter, setModuleFilter] = React.useState<string>("all");
  const [pending, setPending] = React.useState<Pending>(new Map());
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const q = useQuery({ queryKey: ["rbac-matrix"], queryFn: fetchRbacMatrix });

  const mut = useMutation({
    mutationFn: (changes: MatrixChange[]) => applyRoleMatrix(changes),
    onSuccess: (res) => {
      toast.success(`${res.applied} alteração(ões) aplicadas.`);
      setPending(new Map());
      void qc.invalidateQueries({ queryKey: ["rbac-matrix"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  if (q.isLoading || !q.data) return <MatrixSkeleton />;

  const matrix = q.data;
  const grantedSet = new Set(matrix.role_permissions.map((r) => pendKey(r.role, r.permission_code)));
  const critical = new Set(matrix.critical_super_admin);

  // computa estado efetivo considerando pending
  function isGranted(role: AppRole, code: PermissionCode): boolean {
    const k = pendKey(role, code);
    const p = pending.get(k);
    if (p) return p.action === "grant";
    return grantedSet.has(k);
  }

  function togglePermission(role: AppRole, code: PermissionCode) {
    if (!canEdit) return;
    if (role === "super_admin" && critical.has(code) && isGranted(role, code)) {
      toast.error("Esta permissão é crítica para o Super Admin e não pode ser removida.");
      return;
    }
    const k = pendKey(role, code);
    const current = isGranted(role, code);
    const desired = !current;
    const originallyGranted = grantedSet.has(k);
    const next = new Map(pending);
    if (desired === originallyGranted) {
      next.delete(k);
    } else {
      next.set(k, { role, permission_code: code, action: desired ? "grant" : "revoke" });
    }
    setPending(next);
  }

  const modules = Array.from(new Set(matrix.permissions.map((p) => p.module)));
  const filtered = matrix.permissions.filter((p) => {
    if (moduleFilter !== "all" && p.module !== moduleFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.code.toLowerCase().includes(s) ||
      p.description?.toLowerCase().includes(s) ||
      (MODULE_LABELS[p.module] ?? p.module).toLowerCase().includes(s)
    );
  });

  const grouped = new Map<string, typeof filtered>();
  for (const p of filtered) {
    if (!grouped.has(p.module)) grouped.set(p.module, []);
    grouped.get(p.module)!.push(p);
  }

  const changeCount = pending.size;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, descrição ou módulo…"
              className="pl-9"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">Todos os módulos</option>
            {modules.map((m) => (
              <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            {changeCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {changeCount} alteração(ões) pendente(s)
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPending(new Map())}
              disabled={changeCount === 0 || mut.isPending}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" /> Descartar
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={changeCount === 0 || !canEdit || mut.isPending}
            >
              <Save className="mr-1.5 h-4 w-4" /> Salvar alterações
            </Button>
          </div>
        </div>
        {!canEdit && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Você tem acesso somente de leitura. Apenas Super Admin pode editar a matriz.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          As permissões controlam funcionalidades. O acesso aos dados continua limitado pelas regras de escopo e RLS.
        </p>
      </Card>

      <TooltipProvider delayDuration={200}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium">Permissão</th>
                  {ROLES.map((r) => (
                    <th key={r.key} className="px-2 py-2 text-center font-medium">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([mod, perms]) => (
                  <React.Fragment key={mod}>
                    <tr className="border-b bg-muted/20">
                      <td colSpan={ROLES.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {MODULE_LABELS[mod] ?? mod}
                      </td>
                    </tr>
                    {perms.map((p) => (
                      <tr key={p.code} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-background px-3 py-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col">
                                <code className="text-[12px] font-mono text-foreground">{p.code}</code>
                                <span className="text-[11px] text-muted-foreground">{p.description}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{p.description ?? p.code}</TooltipContent>
                          </Tooltip>
                        </td>
                        {ROLES.map((r) => {
                          const granted = isGranted(r.key, p.code);
                          const k = pendKey(r.key, p.code);
                          const isPending = pending.has(k);
                          const isCritical = r.key === "super_admin" && critical.has(p.code);
                          return (
                            <td key={r.key} className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => togglePermission(r.key, p.code)}
                                disabled={!canEdit || isCritical}
                                title={isCritical ? "Permissão crítica — não pode ser removida" : granted ? "Permitido" : "Não configurado"}
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-all",
                                  granted
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    : "border-border/60 bg-muted/40 text-muted-foreground",
                                  isPending && "ring-2 ring-amber-500/60",
                                  (!canEdit || isCritical) && "cursor-not-allowed opacity-70",
                                  canEdit && !isCritical && "hover:scale-105",
                                )}
                                aria-pressed={granted}
                                aria-label={`${r.label} · ${p.code}`}
                              >
                                {granted ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={ROLES.length + 1} className="p-8 text-center text-sm text-muted-foreground">
                      Nenhuma permissão encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </TooltipProvider>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded border border-emerald-500/40 bg-emerald-500/15 text-emerald-600"><Check className="h-3 w-3" /></span> Permitido</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded border bg-muted/40 text-muted-foreground"><Minus className="h-3 w-3" /></span> Não configurado</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded ring-2 ring-amber-500/60" /> Pendente</span>
          <span className="inline-flex items-center gap-1.5"><X className="h-3 w-3" /> Deny individual: definido na tela do usuário</span>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar alterações da matriz?</AlertDialogTitle>
            <AlertDialogDescription>
              {changeCount} alteração(ões) serão aplicadas aos perfis. Cada alteração é registrada em auditoria e invalida o cache de permissões em uso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                mut.mutate(Array.from(pending.values()));
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
