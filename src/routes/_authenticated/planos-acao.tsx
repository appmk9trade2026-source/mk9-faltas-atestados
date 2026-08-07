import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarPlanosAcao } from "@/lib/planos-acao.functions";
import { useSession } from "@/hooks/use-session";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/planos-acao")({
  component: PlanosAcaoPage,
});

function PlanosAcaoPage() {
  const listPlanos = useServerFn(listarPlanosAcao);
  const { data: planos, isLoading } = useQuery({
    queryKey: ["planos-acao"],
    queryFn: () => listPlanos({}),
  });

  return (
    <AppShell title="Plano de Ação Gerencial">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Plano de Ação Gerencial</h1>
            <p className="text-muted-foreground">Acompanhe ações para melhoria dos indicadores operacionais.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           {["Ativos", "Vencidos", "Vencem em Breve", "Concluídos"].map(label => (
             <Card key={label}>
               <CardHeader className="py-3"><CardTitle className="text-sm font-medium">{label}</CardTitle></CardHeader>
               <CardContent><p className="text-2xl font-bold">0</p></CardContent>
             </Card>
           ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Carregando...</TableCell></TableRow>
                ) : !planos?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum plano de ação encontrado.</TableCell></TableRow>
                ) : (
                  planos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.titulo}</TableCell>
                      <TableCell>{p.tipo_alvo}</TableCell>
                      <TableCell>{(p as any).projeto?.nome ?? "-"}</TableCell>
                      <TableCell>{(p as any).responsavel?.nome ?? "-"}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell>{new Date(p.prazo).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
