import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRelatorioQualidade, QualidadeLancamentosRow } from "@/lib/qualidade.functions";
import { useState } from "react";
import { format, subDays } from "date-fns";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, TrendingDown, TrendingUp, Users, Target, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/qualidade-lancamentos")({
  component: QualidadeLancamentosPage,
});

function QualidadeLancamentosPage() {
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data } = useSuspenseQuery({
    queryKey: ["relatorio-qualidade", dataInicio, dataFim],
    queryFn: () => getRelatorioQualidade({ data: { dataInicio, dataFim } }),
  });

  const totals = (data || []).reduce(
    (acc, curr) => ({
      lancamentos: acc.lancamentos + Number(curr.total_lancamentos),
      correcoes: acc.correcoes + Number(curr.total_correcoes),
    }),
    { lancamentos: 0, correcoes: 0 }
  );

  const taxaAcertoGeral = totals.lancamentos > 0 
    ? ((totals.lancamentos - totals.correcoes) / totals.lancamentos) * 100 
    : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Qualidade de Lançamentos</h1>
        <p className="text-muted-foreground">
          Análise de integridade e correções de ausências por supervisor e projeto.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Lançamentos</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.lancamentos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Correções / Exclusões</CardTitle>
            <TrendingUp className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.correcoes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Acerto Geral</CardTitle>
            <TrendingDown className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taxaAcertoGeral.toFixed(1)}%</div>
            <Progress value={taxaAcertoGeral} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Período de Análise</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                value={dataInicio} 
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-8 text-xs"
              />
              <span className="text-muted-foreground">a</span>
              <Input 
                type="date" 
                value={dataFim} 
                onChange={(e) => setDataFim(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Ranking de Qualidade por Supervisor</CardTitle>
            <CardDescription>
              Desempenho individual baseado em correções e exclusões.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right">Lançamentos</TableHead>
                  <TableHead className="text-right">Correções</TableHead>
                  <TableHead className="text-right">Taxa de Acerto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as QualidadeLancamentosRow[])?.map((row, i) => (
                  <TableRow key={`${row.supervisor_id}-${row.projeto_id}-${i}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {row.supervisor_nome}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Target className="h-3 w-3 text-muted-foreground" />
                        {row.projeto_nome}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.total_lancamentos}</TableCell>
                    <TableCell className="text-right">{row.total_correcoes}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={Number(row.taxa_acerto) > 90 ? "default" : "destructive"}>
                        {Number(row.taxa_acerto).toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
EOF
