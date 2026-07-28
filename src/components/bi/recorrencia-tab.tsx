import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shield, Users } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Recorrencia = {
  gerado_em: string;
  janela_dias: number;
  limite_aplicado: number;
  minimo_privacidade: number;
  resumo: {
    colaboradores_analisados: number;
    colaboradores_recorrentes: number;
    percentual_recorrentes: number;
    total_ocorrencias_recorrentes: number;
    media_ocorrencias_por_recorrente: number;
  };
  por_faixa_ocorrencias: Array<{ faixa: string; qtd_colaboradores: number | null; suprimido: boolean }>;
  por_empresa: Array<{ empresa_nome: string; recorrentes: number | null; total: number | null; suprimido: boolean }>;
  por_projeto: Array<{ projeto_nome: string; recorrentes: number | null; suprimido: boolean }>;
  por_categoria: Array<{ categoria_nome: string; recorrentes: number | null; suprimido: boolean }>;
  por_tipo: Array<{ tipo_nome: string; recorrentes: number | null; suprimido: boolean }>;
  aviso: string;
};

export function RecorrenciaTab({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  const q = useQuery({
    queryKey: ["bi-rec", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await sb.rpc("bi_recorrencia_consultar", {
        p_filtros: { data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) throw error;
      return data as Recorrencia;
    },
  });

  const r = q.data;

  if (q.isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (q.isError || !r) {
    const msg = (q.error as Error | null)?.message ?? "";
    const negado = /acesso negado/i.test(msg);
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
        <div className="text-sm">
          {negado
            ? "Análise de recorrência disponível apenas para Super Admin, Compliance e RH."
            : q.isError
              ? "Não foi possível calcular a recorrência no momento."
              : "Sem dados no período selecionado"}
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Analisados" value={r.resumo.colaboradores_analisados} icon={<Users className="h-4 w-4" />} />
        <Kpi label="Recorrentes" value={r.resumo.colaboradores_recorrentes} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
        <Kpi label="% Recorrentes" value={`${r.resumo.percentual_recorrentes}%`} />
        <Kpi label="Média ocorrências" value={r.resumo.media_ocorrencias_por_recorrente} />
        <Kpi label="Janela (dias)" value={r.janela_dias} />
        <Kpi label="Limite aplicado" value={`≥ ${r.limite_aplicado}`} />
      </div>

      <div className="p-3 border rounded-lg bg-muted/40 text-xs flex items-start gap-2">
        <Shield className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div>
          <strong>Regra de privacidade:</strong> grupos com menos de {r.minimo_privacidade} colaboradores são
          exibidos como <Badge variant="outline">Protegido</Badge> e não podem ser exportados como número exato.
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por faixa de ocorrências</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={r.por_faixa_ocorrencias.map((f) => ({
                faixa: f.faixa, qtd: f.suprimido ? 0 : f.qtd_colaboradores ?? 0,
              }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="faixa" fontSize={11} />
                <YAxis fontSize={11} />
                <ReTooltip />
                <Bar dataKey="qtd" fill="var(--mk9-primary)" />
              </BarChart>
            </ResponsiveContainer>
            {r.por_faixa_ocorrencias.some((f) => f.suprimido) && (
              <p className="text-xs text-muted-foreground mt-2">Algumas faixas foram protegidas pela regra de grupo mínimo.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recorrência por empresa</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {r.por_empresa.slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">{e.empresa_nome}</span>
                {e.suprimido ? (
                  <Badge variant="outline">Protegido</Badge>
                ) : (
                  <span className="text-sm font-semibold">{e.recorrentes ?? 0}</span>
                )}
              </div>
            ))}
            {r.por_empresa.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recorrência por projeto (Top 10)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {r.por_projeto.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">{p.projeto_nome}</span>
                {p.suprimido ? <Badge variant="outline">Protegido</Badge> : <span className="text-sm font-semibold">{p.recorrentes ?? 0}</span>}
              </div>
            ))}
            {r.por_projeto.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recorrência por categoria</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {r.por_categoria.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">{c.categoria_nome}</span>
                {c.suprimido ? <Badge variant="outline">Protegido</Badge> : <span className="text-sm font-semibold">{c.recorrentes ?? 0}</span>}
              </div>
            ))}
            {r.por_categoria.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">{r.aviso}</p>
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
