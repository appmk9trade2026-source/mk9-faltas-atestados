import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, UserCog, Users, Building2, Briefcase, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/coordenacao/supervisores")({
  head: () => ({
    meta: [
      { title: "Meus Supervisores · CRM MK9" },
      { name: "description", content: "Supervisores vinculados à sua coordenação." },
    ],
  }),
  component: MeusSupervisoresPage,
});

type SupervisorRow = {
  supervisor_id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  colaboradores_count: number;
  empresas: Array<{ id: string; nome: string }> | null;
  projetos: Array<{ id: string; nome: string }> | null;
};

function MeusSupervisoresPage() {
  const scope = useSessionScope();
  const { user, roles } = useSession();
  const isCoordenador = roles.includes("coordenador");
  const [query, setQuery] = useState("");

  const q = useQuery({
    queryKey: ["coordenacao", "meus-supervisores", ...scope.keyParts, user?.id],
    enabled: scope.ready && !!user?.id && isCoordenador,
    queryFn: async (): Promise<SupervisorRow[]> => {
      const { data, error } = await supabase.rpc(
        "coordenacao_supervisores_por_coordenador",
        { _coord_id: user!.id },
      );
      if (error) throw error;
      return (data ?? []) as unknown as SupervisorRow[];
    },
  });

  const rows = q.data ?? [];
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.nome ?? "").toLowerCase().includes(s) ||
        (r.email ?? "").toLowerCase().includes(s),
    );
  }, [rows, query]);

  const totalColabs = rows.reduce((acc, r) => acc + (r.colaboradores_count ?? 0), 0);
  const ativos = rows.filter((r) => r.ativo).length;

  if (!isCoordenador) {
    return (
      <AppShell title="Meus Supervisores" breadcrumb={["Coordenação", "Supervisores"]}>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Esta área é exclusiva do perfil Coordenador.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Meus Supervisores" breadcrumb={["Coordenação", "Supervisores"]}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={<UserCog className="h-4 w-4" />} label="Supervisores" value={rows.length} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Colaboradores" value={totalColabs} />
        <Kpi icon={<Briefcase className="h-4 w-4" />} label="Ativos" value={ativos} />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Lista de supervisores</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : q.isError ? (
            <div className="text-destructive text-sm">Erro ao carregar supervisores.</div>
          ) : filtered.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {rows.length === 0
                ? "Você ainda não possui supervisores vinculados."
                : "Nenhum resultado para a busca."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supervisor</TableHead>
                    <TableHead className="text-center">Colaboradores</TableHead>
                    <TableHead>Empresas</TableHead>
                    <TableHead>Projetos</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.supervisor_id}>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.nome ?? "—"}</div>
                          <div className="text-muted-foreground truncate text-xs">
                            {s.email ?? "—"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{s.colaboradores_count ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(s.empresas ?? []).slice(0, 3).map((e) => (
                            <Badge key={e.id} variant="outline" className="gap-1">
                              <Building2 className="h-3 w-3" />
                              {e.nome}
                            </Badge>
                          ))}
                          {(s.empresas ?? []).length > 3 && (
                            <Badge variant="outline">+{(s.empresas ?? []).length - 3}</Badge>
                          )}
                          {(!s.empresas || s.empresas.length === 0) && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(s.projetos ?? []).slice(0, 3).map((p) => (
                            <Badge key={p.id} variant="secondary">
                              {p.nome}
                            </Badge>
                          ))}
                          {(s.projetos ?? []).length > 3 && (
                            <Badge variant="outline">+{(s.projetos ?? []).length - 3}</Badge>
                          )}
                          {(!s.projetos || s.projetos.length === 0) && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.ativo ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
