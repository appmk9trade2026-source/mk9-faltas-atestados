import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type UltimoRegistro = {
  id: string;
  registrado_em: string;
  colab_nome: string;
  empresa_nome: string;
  projeto_nome: string;
  tipo: string;
  status: string;
};

/**
 * BLOCO 5 — Últimas ocorrências.
 * Filtro de busca e status são aplicados no cliente sobre os dados já carregados.
 * Nenhuma alteração de consulta.
 */
export function UltimasOcorrencias({
  rows,
  loading,
}: {
  rows: UltimoRegistro[];
  loading: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return [r.colab_nome, r.empresa_nome, r.projeto_nome, r.tipo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, busca, status]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Últimas ocorrências</CardTitle>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Registros mais recentes dentro do período e filtros selecionados.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar colaborador, empresa…"
                aria-label="Busca rápida nas últimas ocorrências"
                className="h-9 w-[230px] pl-8"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="LANCADO">Lançado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(new Date(r.registrado_em), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">{r.colab_nome}</TableCell>
                  <TableCell className="text-sm">{r.empresa_nome}</TableCell>
                  <TableCell className="text-sm">{r.projeto_nome}</TableCell>
                  <TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell>
                  <TableCell>
                    <Badge
                      className={
                        r.status === "LANCADO"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/ausencias"
                      className="inline-flex items-center gap-1 rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Abrir ocorrências de ${r.colab_nome}`}
                    >
                      Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0 ? "Sem registros no período." : "Nenhum registro corresponde à busca."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
