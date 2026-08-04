import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCentralProcessamentoKpis, iniciarProcessamentoAdm, concluirProcessamentoAdm } from "@/lib/ausencias.functions";
import { resolveAusenciaIdentidade } from "@/lib/ausencia-identidade";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCcw, History, TrendingUp, CheckCircle2, AlertTriangle, Zap } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ProcessamentoCard } from "@/components/processamento/processamento-card";
import { AusenciaCardData, StatusProcessamento } from "@/components/processamento/types";
import { calcularPrioridade, getSlaStatus } from "@/components/processamento/utils";
import { differenceInDays } from "date-fns";
import { useSession } from "@/hooks/use-session";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/processamento")({
  head: () => ({ meta: [{ title: "Central de Processamento · CRM MK9" }] }),
  component: CentralProcessamentoPage,
});

function KpiCard({ title, value, icon: Icon, color }: any) {
  return (
    <Card className="border-none shadow-sm bg-card/50">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{title}</p>
          <h3 className="text-xl font-black">{value}</h3>
        </div>
        <div className={cn("p-2 rounded-lg", color)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function CentralProcessamentoPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [registroSelecionado, setRegistroSelecionado] = useState<AusenciaCardData | null>(null);

  const getKpisFn = useServerFn(getCentralProcessamentoKpis);
  const iniciarFn = useServerFn(iniciarProcessamentoAdm);
  const concluirFn = useServerFn(concluirProcessamentoAdm);

  const kpisQ = useQuery({ queryKey: ["processamento", "kpis"], queryFn: () => getKpisFn() });

  const ausenciasQ = useQuery({
    queryKey: ["processamento", "fila"],
    queryFn: async () => {
      const { data } = await supabase.from("ausencias").select("*, empresa:empresas(nome), projeto:projetos(nome), colaborador:colaboradores(nome_completo, matricula)").neq("status_processamento", "PROCESSADO");
      return (data || []).map(row => {
        const { nome, matricula, supervisor_nome } = resolveAusenciaIdentidade({ ...row, colaborador: row.colaborador ? { ...row.colaborador, supervisor_nome: row.manual_supervisor_nome } : null });
        return {
          id: row.id, protocolo: row.protocolo, tipo: row.tipo_ausencia_nome || row.tipo, motivo: row.motivo,
          data_inicio: row.data_inicio, data_fim: row.data_fim, dias: row.dias, registrado_em: row.registrado_em,
          lancado_em: row.lancado_em, processamento_iniciado_em: row.processamento_iniciado_em, processamento_concluido_em: row.processamento_concluido_em,
          status_processamento: row.status_processamento, responsavel_processamento_id: row.responsavel_processamento_id,
          responsavel_processamento_nome: row.responsavel_processamento_nome, prioridade: calcularPrioridade(row.registrado_em),
          tempo_aguardando: differenceInDays(new Date(), new Date(row.registrado_em)), sla_status: getSlaStatus(row.registrado_em),
          colaborador_nome: nome || "N/A", colaborador_matricula: matricula || "N/A", empresa_nome: row.empresa?.nome || "N/A",
          projeto_nome: row.projeto?.nome || "N/A", supervisor_nome: supervisor_nome || "N/A", origem_registro: row.origem_registro,
          cid: row.cid, acidente_trabalho: row.acidente_trabalho_trajeto, status_rh: row.status
        } as AusenciaCardData;
      });
    }
  });

  const sortedAndFiltered = useMemo(() => {
    let list = (ausenciasQ.data || []).filter(a => 
      a.colaborador_nome.toLowerCase().includes(search.toLowerCase()) || 
      a.colaborador_matricula.includes(search) || a.protocolo?.includes(search)
    );
    return list.sort((a, b) => {
      if (a.sla_status === "FORA" && b.sla_status !== "FORA") return -1;
      if (b.sla_status === "FORA" && a.sla_status !== "FORA") return 1;
      return b.tempo_aguardando - a.tempo_aguardando;
    });
  }, [ausenciasQ.data, search]);

  const iniciarMut = useMutation({
    mutationFn: (id: string) => iniciarFn({ data: { ausencia_id: id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["processamento"] })
  });

  const assumirProximo = () => {
    const proximo = sortedAndFiltered.find(a => a.status_processamento === "AGUARDANDO");
    if (proximo) iniciarMut.mutate(proximo.id);
    else toast.info("Nenhum registro aguardando.");
  };

  return (
    <AppShell title="Central de Processamento" breadcrumb={["Operações", "Central de Processamento"]}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <KpiCard title="Minha Fila" value={sortedAndFiltered.filter(a => a.responsavel_processamento_id === user?.id).length} icon={User} color="bg-indigo-50 text-indigo-600" />
          <KpiCard title="Aguardando" value={kpisQ.data?.backlog ?? "—"} icon={History} color="bg-slate-100 text-slate-600" />
          <KpiCard title="Processando" value={kpisQ.data?.em_processamento ?? "—"} icon={TrendingUp} color="bg-blue-50 text-blue-600" />
          <KpiCard title="Concluídos Hoje" value={kpisQ.data?.processados_hoje ?? "—"} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600" />
          <KpiCard title="Fora SLA" value={kpisQ.data?.fora_sla ?? "—"} icon={AlertTriangle} color="bg-red-50 text-red-600" />
          <Button className="h-full bg-primary font-bold shadow-lg" onClick={assumirProximo}>
            <Zap className="h-4 w-4 mr-2" /> Assumir Próximo
          </Button>
        </div>

        <div className="flex gap-2">
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["processamento"] })}><RefreshCcw className="h-4 w-4" /></Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ausenciasQ.isLoading ? <Skeleton className="h-48 col-span-3" /> : sortedAndFiltered.map((a, i) => (
            <ProcessamentoCard key={a.id} data={a} currentUserId={user?.id} isNextInLine={i === 0 && a.status_processamento === "AGUARDANDO"} 
              onIniciar={(id) => iniciarMut.mutate(id)} onConcluir={() => {}} onVerDetalhes={(d) => { setRegistroSelecionado(d); setDetalhesAbertos(true); }} isProcessing={false} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}