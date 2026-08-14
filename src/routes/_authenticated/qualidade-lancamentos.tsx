import { AppShell } from "@/components/layout/app-shell";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRelatorioQualidade, QualidadeLancamentosRow, getErrosSupervisor } from "@/lib/qualidade.functions";
import { useState } from "react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { 
  BarChart3, 
  TrendingDown, 
  TrendingUp, 
  Users, 
  Target, 
  Calendar, 
  ArrowLeft, 
  AlertCircle,
  Eye,
  ExternalLink,
  History
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/qualidade-lancamentos")({
  component: QualidadeLancamentosPage,
});

function QualidadeLancamentosPage() {
  const navigate = useNavigate();
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedSup, setSelectedSup] = useState<{ id: string; nome: string; projetoId: string; projetoNome: string } | null>(null);

  const { data, error } = useSuspenseQuery({
    queryKey: ["relatorio-qualidade", dataInicio, dataFim],
    queryFn: () => getRelatorioQualidade({ data: { dataInicio, dataFim } }),
  });

  const { data: errosSup, isLoading: loadingErros } = useSuspenseQuery({
    queryKey: ["erros-supervisor", selectedSup?.id, selectedSup?.projetoId, dataInicio, dataFim],
    queryFn: () => selectedSup ? getErrosSupervisor({ 
      data: { 
        supervisorId: selectedSup.id, 
        projetoId: selectedSup.projetoId,
        dataInicio,
        dataFim
      } 
    }) : Promise.resolve([]),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <TrendingDown className="h-12 w-12 text-destructive opacity-20" />
        <h2 className="text-xl font-semibold">Erro ao carregar indicadores</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Não foi possível carregar os indicadores de qualidade para o período selecionado.
        </p>
      </div>
    );
  }

  const totals = (data || []).reduce(
    (acc: { lancamentos: number; correcoes: number; erros: number }, curr: QualidadeLancamentosRow) => ({
      lancamentos: acc.lancamentos + Number(curr.total_lancamentos),
      correcoes: acc.correcoes + Number(curr.total_correcoes),
      erros: acc.erros + Number(curr.lancamentos_com_erro),
    }),
    { lancamentos: 0, correcoes: 0, erros: 0 }
  );

  const hasData = totals.lancamentos > 0;
  const taxaAcertoGeral = hasData
    ? ((totals.lancamentos - totals.erros) / totals.lancamentos) * 100 
    : null;

  return (
    <AppShell title="Qualidade de Lançamentos" breadcrumb={["Gestão", "Qualidade"]}>
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate({ to: "/dashboard" })}
              className="h-8 gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Badge variant="outline" className="text-[10px] font-mono py-0 h-5">MK9-QAL-F2</Badge>
          </div>
          <p className="text-muted-foreground">
            Gestão de indicadores e auditoria de erros operacionais por supervisor.
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
            <p className="text-[10px] text-muted-foreground mt-1">Esforço operacional total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Erros Identificados</CardTitle>
            <TrendingUp className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{totals.erros}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Falhas atribuíveis ao supervisor</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Acerto Geral</CardTitle>
            <Target className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {taxaAcertoGeral !== null ? `${taxaAcertoGeral.toFixed(1)}%` : "N/A"}
            </div>
            <Progress 
              value={taxaAcertoGeral !== null ? taxaAcertoGeral : 0} 
              className={`mt-2 h-2 ${taxaAcertoGeral !== null && taxaAcertoGeral < 90 ? "[&>div]:bg-destructive" : "[&>div]:bg-emerald-500"}`} 
            />
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead className="text-right">Taxa Acerto</TableHead>
                  <TableHead className="text-right">Erros / 100</TableHead>
                  <TableHead>Principal Causa</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data || data.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Nenhum lançamento encontrado no período selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data as QualidadeLancamentosRow[])?.map((row, i) => (
                    <TableRow key={`${row.supervisor_id}-${row.projeto_id}-${i}`} className="group hover:bg-muted/50 transition-colors">
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
                      <TableCell className="text-right font-semibold text-destructive">{row.lancamentos_com_erro}</TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={row.taxa_acerto === null ? "outline" : Number(row.taxa_acerto) >= 95 ? "default" : Number(row.taxa_acerto) >= 90 ? "secondary" : "destructive"}
                          className={row.taxa_acerto !== null && Number(row.taxa_acerto) >= 95 ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                        >
                          {row.taxa_acerto !== null ? `${Number(row.taxa_acerto).toFixed(1)}%` : "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.erros_por_100 !== null ? Number(row.erros_por_100).toFixed(1) : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {row.principal_causa?.replace(/_/g, " ") || "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setSelectedSup({ 
                            id: row.supervisor_id, 
                            nome: row.supervisor_nome,
                            projetoId: row.projeto_id,
                            projetoNome: row.projeto_nome
                          })}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
      </div>

      <Sheet open={!!selectedSup} onOpenChange={(open) => !open && setSelectedSup(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Auditoria de Erros: {selectedSup?.nome}
            </SheetTitle>
            <SheetDescription>
              Protocolos com erro no projeto {selectedSup?.projetoNome} entre {format(parseISO(dataInicio), "dd/MM/yyyy")} e {format(parseISO(dataFim), "dd/MM/yyyy")}.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <ScrollArea className="h-[calc(100vh-200px)] pr-4">
              {loadingErros ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 w-full animate-pulse bg-muted rounded-lg" />
                  ))}
                </div>
              ) : !errosSup || errosSup.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground opacity-20 mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum erro detalhado encontrado.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {errosSup.map((erro: any) => (
                    <div 
                      key={erro.id} 
                      className="group relative flex flex-col gap-2 rounded-lg border border-border/60 p-4 hover:border-blue-500/50 hover:bg-blue-500/[0.02] transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                              #{erro.protocolo}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 h-4 uppercase">
                              {erro.tipo_ausencia?.nome}
                            </Badge>
                          </div>
                          <h4 className="text-sm font-semibold mt-1">
                            {erro.manual_nome || "Colaborador Base"}
                          </h4>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => navigate({ to: "/ausencias", search: { q: erro.protocolo } })}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-y-2 mt-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(erro.data_inicio), "dd/MM/yy")}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <History className="h-3 w-3" />
                          Registrado: {format(parseISO(erro.registrado_em), "dd/MM/yy HH:mm")}
                        </div>
                      </div>

                      <div className={`mt-2 rounded p-2 border ${erro.e_erro_supervisor !== false ? "bg-destructive/5 border-destructive/10" : "bg-muted/50 border-border"}`}>
                        <p className={`text-[11px] font-bold uppercase ${erro.e_erro_supervisor !== false ? "text-destructive" : "text-muted-foreground"}`}>
                          {erro.motivo_exclusao_categoria_v2?.replace(/_/g, " ") || "SEM CATEGORIA"}
                        </p>
                        {erro.motivo_exclusao_detalhe && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 italic">
                            "{erro.motivo_exclusao_detalhe}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
