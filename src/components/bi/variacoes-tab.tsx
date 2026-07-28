import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Item = {
  entidade: string;
  periodo: string;
  observado: number;
  media_historica: number | null;
  desvio_padrao: number | null;
  diferenca_absoluta: number | null;
  diferenca_percentual: number | null;
  z_score: number | null;
  pontos_historicos: number;
  classificacao: "NORMAL" | "ATENCAO" | "ATIPICO" | "DADOS_INSUFICIENTES";
};

type Resp = {
  gerado_em: string;
  dimensao: string;
  metrica: string;
  granularidade: string;
  minimo_pontos: number;
  zscore_atencao: number;
  zscore_atipico: number;
  resumo?: {
    dimensoes_analisadas: number;
    atipicos: number;
    atencao: number;
    normais: number;
    sem_dados: number;
    maior_desvio_abs: number | null;
  };
  itens: Item[];
  mensagem: string;
};

const classColor: Record<string, string> = {
  ATIPICO: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  ATENCAO: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  NORMAL: "bg-muted text-muted-foreground",
  DADOS_INSUFICIENTES: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function VariacoesAtipicasTab({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  const [dimensao, setDimensao] = useState<string>("EMPRESA");
  const [metrica, setMetrica] = useState<string>("TOTAL_REGISTROS");
  const [gran, setGran] = useState<string>("MES");
  const [classif, setClassif] = useState<string>("TODAS");

  const q = useQuery({
    queryKey: ["bi-var", dimensao, metrica, gran, dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await sb.rpc("bi_detectar_variacoes_atipicas", {
        p_filtros: { dimensao, metrica, granularidade: gran, data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) throw error;
      return data as Resp;
    },
  });

  const itens = (q.data?.itens ?? []).filter(
    (i) => classif === "TODAS" || i.classificacao === classif,
  );

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Dimensão</Label>
          <Select value={dimensao} onValueChange={setDimensao}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GERAL">Geral</SelectItem>
              <SelectItem value="EMPRESA">Empresa</SelectItem>
              <SelectItem value="PROJETO">Projeto</SelectItem>
              <SelectItem value="CATEGORIA">Categoria</SelectItem>
              <SelectItem value="TIPO_AUSENCIA">Tipo</SelectItem>
              <SelectItem value="STATUS">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Métrica</Label>
          <Select value={metrica} onValueChange={setMetrica}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TOTAL_REGISTROS">Total de registros</SelectItem>
              <SelectItem value="COLABORADORES_AFETADOS">Colaboradores afetados</SelectItem>
              <SelectItem value="DIAS_AUSENCIA">Dias de ausência</SelectItem>
              <SelectItem value="HORAS_ESTIMADAS">Horas estimadas</SelectItem>
              <SelectItem value="PENDENTES">Pendentes</SelectItem>
              <SelectItem value="LANCADOS">Lançados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Granularidade</Label>
          <Select value={gran} onValueChange={setGran}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DIA">Dia</SelectItem>
              <SelectItem value="SEMANA">Semana</SelectItem>
              <SelectItem value="MES">Mês</SelectItem>
              <SelectItem value="TRIMESTRE">Trimestre</SelectItem>
              <SelectItem value="ANO">Ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Classificação</Label>
          <Select value={classif} onValueChange={setClassif}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas</SelectItem>
              <SelectItem value="ATIPICO">Atípico</SelectItem>
              <SelectItem value="ATENCAO">Atenção</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
              <SelectItem value="DADOS_INSUFICIENTES">Sem dados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Dimensões analisadas" value={q.data?.resumo?.dimensoes_analisadas ?? 0} icon={<Info className="h-4 w-4" />} />
        <Kpi label="Em atenção" value={q.data?.resumo?.atencao ?? 0} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
        <Kpi label="Atípicas" value={q.data?.resumo?.atipicos ?? 0} icon={<AlertTriangle className="h-4 w-4 text-red-500" />} />
        <Kpi label="Sem dados" value={q.data?.resumo?.sem_dados ?? 0} />
        <Kpi label="Maior |z-score|" value={q.data?.resumo?.maior_desvio_abs ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Variações identificadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <Skeleton className="h-40" />
          ) : q.isError ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {/acesso negado/i.test((q.error as Error).message)
                ? "Análise de variações disponível apenas para Super Admin, Compliance e RH."
                : "Não foi possível calcular as variações no momento."}
            </p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem variações no filtro atual.</p>

          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classif.</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Observado</TableHead>
                    <TableHead className="text-right">Média hist.</TableHead>
                    <TableHead className="text-right">Δ %</TableHead>
                    <TableHead className="text-right">z-score</TableHead>
                    <TableHead className="text-right">Pontos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.slice(0, 200).map((i, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Badge variant="outline" className={classColor[i.classificacao]}>{i.classificacao}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{i.entidade?.slice(0, 12) ?? "—"}</TableCell>
                      <TableCell className="text-xs">{i.periodo?.slice(0, 10)}</TableCell>
                      <TableCell className="text-right">{Number(i.observado ?? 0).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{i.media_historica != null ? Number(i.media_historica).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell className="text-right">
                        {i.diferenca_percentual != null && (
                          <span className={i.diferenca_percentual > 0 ? "text-orange-600" : i.diferenca_percentual < 0 ? "text-blue-600" : ""}>
                            {i.diferenca_percentual > 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : i.diferenca_percentual < 0 ? <TrendingDown className="inline h-3 w-3 mr-1" /> : null}
                            {i.diferenca_percentual}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{i.z_score ?? "—"}</TableCell>
                      <TableCell className="text-right">{i.pontos_historicos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">{q.data?.mensagem}</p>
          <p className="text-xs text-muted-foreground">
            Método: z-score = (observado − média histórica) / desvio-padrão. Limites: ATENÇÃO ≥ {q.data?.zscore_atencao ?? 2}, ATÍPICO ≥ {q.data?.zscore_atipico ?? 3}. Amostra mínima: {q.data?.minimo_pontos ?? 6} pontos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="p-3 border rounded-lg">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</div>
    </div>
  );
}
