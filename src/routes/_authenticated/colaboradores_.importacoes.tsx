import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileSpreadsheet, Upload } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/colaboradores_/importacoes")({
  component: HistoricoPage,
});

type ImportacaoRow = {
  id: string;
  arquivo_nome: string;
  arquivo_tamanho: number | null;
  usuario_id: string;
  total_linhas: number;
  importadas: number;
  atualizadas: number;
  ignoradas: number;
  erros: number;
  duracao_ms: number;
  status: string;
  detalhes: unknown;
  created_at: string;
};

function HistoricoPage() {
  const { roles } = useSession();
  const canImport = roles.includes("super_admin") || roles.includes("rh");
  const [selected, setSelected] = useState<ImportacaoRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["importacoes-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ImportacaoRow[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,nome,email");
      return data ?? [];
    },
  });
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  return (
    <AppShell title="Histórico de Importações" breadcrumb={["Operação", "Colaboradores", "Importações"]}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/colaboradores">
            <ArrowLeft className="mr-2 h-4 w-4" /> Colaboradores
          </Link>
        </Button>
        {canImport && (
          <Button asChild>
            <Link to="/colaboradores/importar">
              <Upload className="mr-2 h-4 w-4" /> Nova importação
            </Link>
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Importadas</TableHead>
              <TableHead className="text-right">Atualizadas</TableHead>
              <TableHead className="text-right">Erros</TableHead>
              <TableHead className="text-right">Tempo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={10}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && (data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                  <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  Nenhuma importação registrada.
                </TableCell>
              </TableRow>
            )}
            {(data ?? []).map((row) => {
              const prof = profileMap.get(row.usuario_id);
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">
                    {new Date(row.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-sm">{prof?.nome ?? prof?.email ?? "—"}</TableCell>
                  <TableCell className="text-sm">{row.arquivo_nome}</TableCell>
                  <TableCell className="text-right text-sm">{row.total_linhas}</TableCell>
                  <TableCell className="text-right text-sm">{row.importadas}</TableCell>
                  <TableCell className="text-right text-sm">{row.atualizadas}</TableCell>
                  <TableCell className="text-right text-sm">{row.erros}</TableCell>
                  <TableCell className="text-right text-sm">{(row.duracao_ms / 1000).toFixed(2)}s</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        row.status === "SUCESSO"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : row.status === "PARCIAL"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-red-500/15 text-red-600 dark:text-red-400"
                      }
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setSelected(row)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes da importação</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><span className="text-muted-foreground">Arquivo:</span> <b>{selected.arquivo_nome}</b></div>
                <div><span className="text-muted-foreground">Tamanho:</span> <b>{selected.arquivo_tamanho ? `${(selected.arquivo_tamanho/1024).toFixed(1)} KB` : "—"}</b></div>
                <div><span className="text-muted-foreground">Data:</span> <b>{new Date(selected.created_at).toLocaleString("pt-BR")}</b></div>
                <div><span className="text-muted-foreground">Tempo:</span> <b>{(selected.duracao_ms/1000).toFixed(2)}s</b></div>
                <div><span className="text-muted-foreground">Total:</span> <b>{selected.total_linhas}</b></div>
                <div><span className="text-muted-foreground">Importadas:</span> <b>{selected.importadas}</b></div>
                <div><span className="text-muted-foreground">Atualizadas:</span> <b>{selected.atualizadas}</b></div>
                <div><span className="text-muted-foreground">Erros:</span> <b>{selected.erros}</b></div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Detalhes</p>
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(selected.detalhes, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
