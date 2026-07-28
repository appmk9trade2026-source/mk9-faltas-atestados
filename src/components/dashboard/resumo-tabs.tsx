import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RankList, type RankRow } from "./rank-list";

/**
 * Agrupa as três tabelas resumidas (Empresas / Projetos / Supervisores)
 * em um único card com abas, reduzindo a altura do bloco "Onde devemos agir".
 * Mesmos dados, mesma ordenação — apenas reorganização visual.
 */
export function ResumoTabs({
  empresas,
  projetos,
  supervisores,
  loading,
}: {
  empresas: RankRow[];
  projetos: RankRow[];
  supervisores: RankRow[];
  loading: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Resumo por dimensão</CardTitle>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Quantidade de ausências registradas no período selecionado. Indica concentração, não desempenho.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="empresas">
          <TabsList className="mb-3">
            <TabsTrigger value="empresas">Empresas</TabsTrigger>
            <TabsTrigger value="projetos">Projetos</TabsTrigger>
            <TabsTrigger value="supervisores">Supervisores</TabsTrigger>
          </TabsList>
          <TabsContent value="empresas">
            <RankList rows={empresas} tone="atencao" loading={loading} limit={10} />
          </TabsContent>
          <TabsContent value="projetos">
            <RankList rows={projetos} tone="atencao" loading={loading} limit={10} />
          </TabsContent>
          <TabsContent value="supervisores">
            <RankList rows={supervisores} tone="atencao" loading={loading} limit={10} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
