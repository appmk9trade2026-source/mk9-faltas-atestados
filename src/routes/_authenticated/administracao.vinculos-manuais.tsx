import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FolderKanban,
  Info,
  Link2,
  Loader2,
  RefreshCcw,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { friendlyRbacError } from "@/lib/rbac/errors";

export const Route = createFileRoute("/_authenticated/administracao/vinculos-manuais")({
  head: () => ({
    meta: [
      { title: "Vínculos de Lançamentos Manuais · CRM MK9" },
      {
        name: "description",
        content:
          "Rotina administrativa para revisar e confirmar o vínculo de ausências manuais históricas ao cadastro de colaboradores.",
      },
      { property: "og:title", content: "Vínculos de Lançamentos Manuais · CRM MK9" },
      {
        property: "og:description",
        content: "Prévia e confirmação administrativa de vínculos históricos de ausências manuais no CRM MK9.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VinculosManuaisPage,
});

type Sugestao = {
  matricula_normalizada: string;
  empresa_id: string;
  empresa_nome: string | null;
  projeto_ids: string[] | null;
  projeto_nome: string | null;
  nomes: string[] | null;
  supervisores: string[] | null;
  ausencia_ids: string[] | null;
  protocolos: string[] | null;
  total: number;
  colaborador_existente_id: string | null;
  colaborador_existente_nome: string | null;
  consistente: boolean;
};

function VinculosManuaisPage() {
  const { roles } = useSession();
  const scope = useSessionScope();
  const qc = useQueryClient();
  const [busca, setBusca] = React.useState("");
  const [alvo, setAlvo] = React.useState<Sugestao | null>(null);

  const permitido = roles.includes("super_admin") || roles.includes("rh") || roles.includes("compliance");

  const q = useQuery({
    queryKey: ["ausencias-manuais-orfas", ...scope.keyParts],
    enabled: scope.ready && permitido,
    queryFn: async (): Promise<Sugestao[]> => {
      const { data, error } = await supabase.rpc("ausencias_manuais_orfas_sugestoes");
      if (error) throw error;
      return (data ?? []) as unknown as Sugestao[];
    },
  });

  const vincular = useMutation({
    mutationFn: async (s: Sugestao) => {
      const { data, error } = await supabase.rpc("vincular_ausencias_manuais_historico", {
        _matricula: s.matricula_normalizada,
        _empresa_id: s.empresa_id,
        _ausencia_ids: s.ausencia_ids ?? [],
        _confirmar: true,
      } as never);
      if (error) throw error;
      return (data ?? {}) as {
        colaborador_id?: string;
        colaborador_criado?: boolean;
        ausencias_vinculadas?: number;
      };
    },
    onSuccess: (r) => {
      toast.success(
        r.colaborador_criado
          ? `Colaborador cadastrado e ${r.ausencias_vinculadas ?? 0} ausência(s) vinculada(s).`
          : `${r.ausencias_vinculadas ?? 0} ausência(s) vinculada(s) ao colaborador existente.`,
      );
      setAlvo(null);
      qc.invalidateQueries({ queryKey: ["ausencias-manuais-orfas"] });
      qc.invalidateQueries({ queryKey: ["ausencias"] });
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e) => {
      setAlvo(null);
      const f = friendlyRbacError(e);
      toast.error(f.title, { description: f.description });
    },
  });

  const linhas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const list = q.data ?? [];
    if (!termo) return list;
    return list.filter((s) =>
      `${s.matricula_normalizada} ${(s.nomes ?? []).join(" ")} ${s.empresa_nome ?? ""} ${s.projeto_nome ?? ""}`
        .toLowerCase()
        .includes(termo),
    );
  }, [q.data, busca]);

  if (!permitido) {
    return (
      <AppShell title="Vínculos de Lançamentos Manuais">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Esta rotina administrativa está disponível apenas para Super Admin e RH.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Vínculos de Lançamentos Manuais"
      breadcrumb={["Administração", "Vínculos de Lançamentos Manuais"]}
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Link2 className="h-6 w-6 text-primary" />
              Vínculos de lançamentos manuais
            </h1>
            <p className="text-sm text-muted-foreground">
              Ausências registradas manualmente antes da criação automática de colaborador. Nada é
              alterado sem a sua confirmação.
            </p>
          </div>
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </header>

        <Card className="border-blue-500/25 bg-blue-500/5 p-4">
          <div className="flex gap-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-muted-foreground">
              Novos lançamentos manuais já criam ou reutilizam o colaborador automaticamente. Esta
              tela trata apenas o histórico: os dados do snapshot são preservados e o vínculo é
              aplicado somente aos registros selecionados, com auditoria.
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por matrícula, nome, empresa ou projeto"
              className="pl-9"
            />
          </div>

          {q.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">Nenhum lançamento manual sem vínculo</p>
              <p className="text-xs text-muted-foreground">
                Todos os registros manuais já estão associados a um colaborador.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Colaborador (snapshot)</TableHead>
                    <TableHead className="hidden md:table-cell">Empresa</TableHead>
                    <TableHead className="hidden lg:table-cell">Projeto</TableHead>
                    <TableHead className="hidden xl:table-cell">Supervisor</TableHead>
                    <TableHead className="text-center">Ausências</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((s) => (
                    <TableRow key={`${s.empresa_id}-${s.matricula_normalizada}`}>
                      <TableCell className="font-mono text-xs">{s.matricula_normalizada}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{(s.nomes ?? [])[0] ?? "—"}</span>
                          {!s.consistente && (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              Dados divergentes entre os registros
                            </span>
                          )}
                          {s.colaborador_existente_id && (
                            <span className="mt-0.5 text-xs text-muted-foreground">
                              Cadastro existente: {s.colaborador_existente_nome}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {s.empresa_nome ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FolderKanban className="h-3.5 w-3.5" />
                          {s.projeto_nome ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {(s.supervisores ?? [])[0] ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{s.total}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setAlvo(s)}>
                          <UserRoundPlus className="mr-2 h-4 w-4" />
                          Revisar e vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar vínculo histórico</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {alvo?.colaborador_existente_id
                    ? "As ausências serão vinculadas ao colaborador já cadastrado."
                    : "Um colaborador será cadastrado a partir do snapshot e as ausências serão vinculadas a ele."}
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Matrícula: {alvo?.matricula_normalizada}</li>
                  <li>Nome: {(alvo?.nomes ?? [])[0] ?? "—"}</li>
                  <li>Empresa: {alvo?.empresa_nome ?? "—"}</li>
                  <li>Projeto: {alvo?.projeto_nome ?? "—"}</li>
                  <li>Ausências afetadas: {alvo?.total ?? 0}</li>
                </ul>
                <p className="text-xs">
                  O snapshot manual permanece salvo e nenhum colaborador existente é sobrescrito.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vincular.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (alvo) vincular.mutate(alvo);
              }}
              disabled={vincular.isPending}
            >
              {vincular.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar vínculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
