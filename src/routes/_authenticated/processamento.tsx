import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  getCentralProcessamentoKpis, 
  iniciarProcessamentoAdm, 
  concluirProcessamentoAdm 
} from "@/lib/ausencias.functions";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Filter, 
  RefreshCcw, 
  LayoutGrid, 
  List, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  History,
  AlertTriangle
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/processamento")({
  head: () => ({ meta: [{ title: "Central de Processamento · CRM MK9" }] }),
  component: CentralProcessamentoPage,
});

function KpiCard({ title, value, icon: Icon, description, color }: any) {
  return (
    <Card className="overflow-hidden border-none shadow-sm bg-card/50">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
            {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
          </div>
          <div className={cn("p-2.5 rounded-xl", color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CentralProcessamentoPage() {
  const { user, roles } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("all");
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<string>("all");
  
  const getKpisFn = useServerFn(getCentralProcessamentoKpis);
  const iniciarFn = useServerFn(iniciarProcessamentoAdm);
  const concluirFn = useServerFn(concluirProcessamentoAdm);

  const kpisQ = useQuery({
    queryKey: ["processamento", "kpis"],
    queryFn: () => getKpisFn(),
    refetchInterval: 30000, // Refresh every 30s
  });

  const ausenciasQ = useQuery({
    queryKey: ["processamento", "fila"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ausencias")
        .select(`
          *,
          empresa:empresas(nome),
          projeto:projetos(nome),
          colaborador:colaboradores(nome_completo, matricula)
        `)
        .neq("status_processamento", "PROCESSADO")
        .order("registrado_em", { ascending: true });
        
      if (error) throw error;

      return (data || []).map(row => {
        const registradoEm = row.registrado_em;
        const aguardando = differenceInDays(new Date(), new Date(registradoEm));
        
        const card: AusenciaCardData = {
          id: row.id,
          protocolo: row.protocolo,
          tipo: row.tipo_ausencia_nome || row.tipo,
          motivo: row.motivo,
          data_inicio: row.data_inicio,
          data_fim: row.data_fim,
          registrado_em: row.registrado_em,
          status_processamento: row.status_processamento as StatusProcessamento,
          responsavel_processamento_id: row.responsavel_processamento_id,
          responsavel_processamento_nome: row.responsavel_processamento_nome,
          prioridade: calcularPrioridade(registradoEm),
          tempo_aguardando: aguardando,
          sla_status: getSlaStatus(registradoEm),
          colaborador_nome: row.colaborador?.nome_completo || row.manual_nome || "N/A",
          colaborador_matricula: row.colaborador?.matricula || row.manual_matricula || "N/A",
          empresa_nome: row.empresa?.nome || "N/A",
          projeto_nome: row.projeto?.nome || "N/A",
          supervisor_nome: row.manual_supervisor_nome || "N/A" // Simplified
        };
        return card;
      });
    }
  });

  const filtered = useMemo(() => {
    let list = ausenciasQ.data || [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => 
        a.colaborador_nome.toLowerCase().includes(q) || 
        a.colaborador_matricula.toLowerCase().includes(q) ||
        a.protocolo?.toLowerCase().includes(q)
      );
    }
    if (statusFiltro !== "all") {
      list = list.filter(a => a.status_processamento === statusFiltro);
    }
    if (prioridadeFiltro !== "all") {
      list = list.filter(a => a.prioridade === prioridadeFiltro);
    }
    return list;
  }, [ausenciasQ.data, search, statusFiltro, prioridadeFiltro]);

  const iniciarMut = useMutation({
    mutationFn: (id: string) => iniciarFn({ data: { ausencia_id: id } }),
    onSuccess: () => {
      toast.success("Processamento iniciado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao iniciar processamento");
    }
  });

  const concluirMut = useMutation({
    mutationFn: (id: string) => concluirFn({ data: { ausencia_id: id } }),
    onSuccess: () => {
      toast.success("Registro processado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao concluir processamento");
    }
  });

  return (
    <AppShell title="Central de Processamento" breadcrumb={["Operações", "Central de Processamento"]}>
      <div className="space-y-6">
        {/* Topo KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard 
            title="Fila Total" 
            value={kpisQ.data?.backlog ?? "—"} 
            icon={History} 
            color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            description="Registros aguardando"
          />
          <KpiCard 
            title="Em Processo" 
            value={kpisQ.data?.em_processamento ?? "—"} 
            icon={TrendingUp} 
            color="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
            description="Atribuídos agora"
          />
          <KpiCard 
            title="Concluídos Hoje" 
            value={kpisQ.data?.processados_hoje ?? "—"} 
            icon={CheckCircle2} 
            color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
            description="Finalizados"
          />
          <KpiCard 
            title="Fora do SLA" 
            value={kpisQ.data?.fora_sla ?? "—"} 
            icon={AlertTriangle} 
            color="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
            description="4+ dias aguardando"
          />
        </div>

        {/* Filtros e Controles */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-1 items-center gap-3 w-full">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por colaborador ou protocolo..." 
                className="pl-9 h-10" 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-[180px] h-10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="AGUARDANDO">Aguardando</SelectItem>
                <SelectItem value="EM_PROCESSAMENTO">Em Processamento</SelectItem>
              </SelectContent>
            </Select>
            <Select value={prioridadeFiltro} onValueChange={setPrioridadeFiltro}>
              <SelectTrigger className="w-[180px] h-10">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Prioridades</SelectItem>
                <SelectItem value="NORMAL">🟢 Normal</SelectItem>
                <SelectItem value="ATENCAO">🟡 Atenção</SelectItem>
                <SelectItem value="CRITICO">🔴 Crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10" 
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["processamento"] });
                toast.info("Dados atualizados.");
              }}
            >
              <RefreshCcw className={cn("h-4 w-4", (ausenciasQ.isFetching || kpisQ.isFetching) && "animate-spin")} />
            </Button>
            <Badge variant="secondary" className="h-10 px-4 font-normal text-xs">
              {filtered.length} registros na fila
            </Badge>
          </div>
        </div>

        {/* Fila de Trabalho */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ausenciasQ.isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-48">
                <CardContent className="p-4 space-y-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-8 w-1/2" />
                </CardContent>
              </Card>
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-3 bg-card/30 rounded-2xl border-2 border-dashed">
              <div className="p-4 bg-muted rounded-full">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Nada para processar aqui</h3>
                <p className="text-sm text-muted-foreground">Todos os registros do seu filtro já foram processados ou a fila está vazia.</p>
              </div>
            </div>
          ) : (
            filtered.map((ausencia) => (
              <ProcessamentoCard 
                key={ausencia.id} 
                data={ausencia} 
                currentUserId={user?.id}
                isProcessing={iniciarMut.isPending || concluirMut.isPending}
                onIniciar={(id) => iniciarMut.mutate(id)}
                onConcluir={(id) => concluirMut.mutate(id)}
                onVerDetalhes={(data) => {
                  toast.info("Ver detalhes (Sheet Lateral) será implementado na próxima onda.");
                }}
              />
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
