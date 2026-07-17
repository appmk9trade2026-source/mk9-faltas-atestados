import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIA_CORES, fetchCategorias, fetchTiposComCategoria, type Categoria, type TipoComCategoria } from "@/lib/categorias";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios · CRM MK9" }] }),
  component: RelatoriosPage,
});

type AusRow = {
  id: string;
  data_inicio: string;
  data_fim: string;
  dias: number;
  status: string;
  tipo_ausencia_id: string | null;
  tipo_ausencia_nome: string | null;
  empresa: { nome: string } | null;
  projeto: { nome: string } | null;
  colaborador: { nome_completo: string; matricula: string } | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function RelatoriosPage() {
  const [inicio, setInicio] = useState(firstOfMonthISO());
  const [fim, setFim] = useState(todayISO());
  const [agrupar, setAgrupar] = useState<"categoria" | "tipo_oficial" | "empresa" | "projeto">("categoria");

  const categoriasQ = useQuery<Categoria[]>({ queryKey: ["categorias-ausencia"], queryFn: fetchCategorias, staleTime: 10 * 60_000 });
  const tiposQ = useQuery<TipoComCategoria[]>({ queryKey: ["tipos-ausencia-com-categoria"], queryFn: fetchTiposComCategoria, staleTime: 10 * 60_000 });
  const categorias = categoriasQ.data ?? [];
  const tipos = tiposQ.data ?? [];

  const dadosQ = useQuery({
    queryKey: ["relatorios-ausencias", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ausencias")
        .select("id, data_inicio, data_fim, dias, status, tipo_ausencia_id, tipo_ausencia_nome, empresa:empresas(nome), projeto:projetos(nome), colaborador:colaboradores(nome_completo, matricula)")
        .lte("data_inicio", fim)
        .gte("data_fim", inicio)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AusRow[];
    },
  });

  const rows = dadosQ.data ?? [];

  const grupos = useMemo(() => {
    const map = new Map<string, { chave: string; label: string; cor?: string; total: number; dias: number; pendentes: number; lancadas: number }>();
    for (const r of rows) {
      let chave = "—", label = "—", cor: string | undefined;
      if (agrupar === "categoria") {
        const t = tipos.find((x) => x.id === r.tipo_ausencia_id);
        const c = t ? categorias.find((cc) => cc.id === t.categoria_ausencia_id) : undefined;
        chave = c?.id ?? "sem"; label = c?.nome ?? "(Sem categoria)"; cor = c?.cor ?? (c ? CATEGORIA_CORES[c.codigo] : undefined);
      } else if (agrupar === "tipo_oficial") {
        chave = r.tipo_ausencia_id ?? "sem"; label = r.tipo_ausencia_nome ?? "(Sem tipo)";
      } else if (agrupar === "empresa") {
        chave = r.empresa?.nome ?? "—"; label = chave;
      } else {
        chave = r.projeto?.nome ?? "—"; label = chave;
      }
      const cur = map.get(chave) ?? { chave, label, cor, total: 0, dias: 0, pendentes: 0, lancadas: 0 };
      cur.total += 1;
      cur.dias += r.dias ?? 0;
      if (r.status === "PENDENTE") cur.pendentes += 1;
      if (r.status === "LANCADO") cur.lancadas += 1;
      map.set(chave, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows, agrupar, categorias, tipos]);

  const totalGeral = rows.length;

  function exportar(kind: "csv" | "xlsx") {
    if (!grupos.length) {
      toast.info("Nada para exportar.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const resumo = grupos.map((g) => ({
      Grupo: g.label, Total: g.total, Dias: g.dias, Pendentes: g.pendentes, Lancadas: g.lancadas,
      Percentual: totalGeral ? Math.round((g.total / totalGeral) * 1000) / 10 : 0,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");

    const detalhado = rows.map((r) => {
      const t = tipos.find((x) => x.id === r.tipo_ausencia_id);
      const c = t ? categorias.find((cc) => cc.id === t.categoria_ausencia_id) : undefined;
      return {
        Colaborador: r.colaborador?.nome_completo ?? "",
        Matricula: r.colaborador?.matricula ?? "",
        Empresa: r.empresa?.nome ?? "",
        Projeto: r.projeto?.nome ?? "",
        Categoria: c?.nome ?? "",
        TipoOficial: r.tipo_ausencia_nome ?? t?.nome ?? "",
        DataInicio: r.data_inicio,
        DataFim: r.data_fim,
        Dias: r.dias,
        Status: r.status,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhado), "Detalhado");

    const filename = `relatorio-ausencias-${todayISO()}`;
    if (kind === "csv") {
      const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(resumo));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${filename}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, `${filename}.xlsx`);
    }
  }

  return (
    <AppShell title="Relatórios" breadcrumb={["Relatórios"]}>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Agrupar por</Label>
            <Select value={agrupar} onValueChange={(v) => setAgrupar(v as typeof agrupar)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="categoria">Categoria</SelectItem>
                <SelectItem value="tipo_oficial">Tipo oficial</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="projeto">Projeto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => exportar("csv")}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={() => exportar("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {dadosQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                  <TableHead className="text-right">Lançadas</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.chave}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {g.cor && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.cor }} />}
                        {g.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.dias}</TableCell>
                    <TableCell className="text-right"><Badge variant="secondary">{g.pendentes}</Badge></TableCell>
                    <TableCell className="text-right"><Badge>{g.lancadas}</Badge></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {totalGeral ? Math.round((g.total / totalGeral) * 1000) / 10 : 0}%
                    </TableCell>
                  </TableRow>
                ))}
                {grupos.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
