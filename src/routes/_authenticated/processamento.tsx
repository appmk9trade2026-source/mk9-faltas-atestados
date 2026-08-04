import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  getCentralProcessamentoKpis, 
  iniciarProcessamentoAdm, 
  concluirProcessamentoAdm 
} from "@/lib/ausencias.functions";
import { resolveAusenciaIdentidade } from "@/lib/ausencia-identidade";
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
  AlertTriangle,
  UserRound,
  Play
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, MapPin, Hash, Phone, Mail } from "lucide-react";

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
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [registroSelecionado, setRegistroSelecionado] = useState<AusenciaCardData | null>(null);
  
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
          colaborador:colaboradores(nome_completo, matricula, email, telefone)
        `)
        .neq("status_processamento", "PROCESSADO")
        .order("registrado_em", { ascending: true });
        
      if (error) throw error;

      return (data || []).map(row => {
        const registradoEm = row.registrado_em;
        const aguardando = differenceInDays(new Date(), new Date(registradoEm));
        
        // Usar o resolver canônico para identidade e supervisor
        const { 
          nome, 
          matricula, 
          supervisor_nome,
          email,
          telefone
        } = resolveAusenciaIdentidade({
          ...row,
          colaborador: row.colaborador ? {
            ...row.colaborador,
            supervisor_nome: row.manual_supervisor_nome,
            supervisor_telefone: null
          } : null
        });

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
          colaborador_nome: nome || "N/A",
          colaborador_matricula: matricula || "N/A",
          empresa_nome: row.empresa?.nome || "N/A",
          projeto_nome: row.projeto?.nome || "N/A",
          supervisor_nome: supervisor_nome || "N/A",
          origem_registro: row.origem_registro,
          cid: row.cid,
          acidente_trabalho: row.acidente_trabalho_trajeto,
          status_rh: row.status
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
                  setRegistroSelecionado(data);
                  setDetalhesAbertos(true);
                }}
              />
            ))
          )}
        </div>

        {/* Sheet de Detalhes */}
        <Sheet open={detalhesAbertos} onOpenChange={setDetalhesAbertos}>
          <SheetContent className="sm:max-w-md md:max-w-lg w-full">
            <SheetHeader className="pr-6">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-[10px] font-bold">
                  PROTOCOLO: {registroSelecionado?.protocolo || "—"}
                </Badge>
                {registroSelecionado?.sla_status === "FORA" && (
                  <Badge variant="destructive" className="text-[10px] font-bold animate-pulse">
                    FORA DO SLA
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-xl">
                {registroSelecionado?.colaborador_nome}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {registroSelecionado?.empresa_nome} • {registroSelecionado?.projeto_nome}
              </SheetDescription>
            </SheetHeader>

            <Separator className="my-6" />

            {registroSelecionado && (
              <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                <div className="space-y-6">
                  {/* Seção Dados do Colaborador */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <UserRound className="h-3.5 w-3.5" />
                      Dados do Colaborador
                    </h4>
                    <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-muted-foreground">Matrícula</p>
                        <p className="text-sm font-medium">{registroSelecionado.colaborador_matricula}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-muted-foreground">Supervisor</p>
                        <p className="text-sm font-medium">{registroSelecionado.supervisor_nome}</p>
                      </div>
                    </div>
                  </div>

                  {/* Seção Detalhes da Ausência */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      Detalhes da Ausência
                    </h4>
                    <div className="space-y-4 bg-card border rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Tipo</p>
                          <Badge variant="secondary" className="font-semibold">{registroSelecionado.tipo}</Badge>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Período</p>
                          <p className="text-sm font-medium">
                            {new Date(registroSelecionado.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")} 
                            {registroSelecionado.data_fim && ` até ${new Date(registroSelecionado.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                      </div>

                      {registroSelecionado.motivo && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground">Observações / Motivo</p>
                          <p className="text-sm text-foreground/90 bg-muted/50 p-2 rounded italic">
                            "{registroSelecionado.motivo}"
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-900/10 p-2 rounded border border-amber-100 dark:border-amber-900/20">
                        <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        Registrado em {new Date(registroSelecionado.registrado_em).toLocaleString("pt-BR")}
                        <span className="font-bold">({registroSelecionado.tempo_aguardando} dias na fila)</span>
                      </div>
                    </div>
                  </div>

                  {/* Histórico de Processamento */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <History className="h-3.5 w-3.5" />
                      Status de Processamento
                    </h4>
                    <div className="bg-muted/30 p-4 rounded-lg border border-dashed flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Status Atual:</span>
                        <Badge className={cn(
                          "text-[10px] uppercase font-bold",
                          registroSelecionado.status_processamento === "AGUARDANDO" ? "bg-amber-500 text-white" : 
                          registroSelecionado.status_processamento === "EM_PROCESSAMENTO" ? "bg-blue-600 text-white" : 
                          "bg-emerald-600 text-white"
                        )}>
                          {registroSelecionado.status_processamento.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      
                      {registroSelecionado.responsavel_processamento_nome && (
                        <div className="flex items-center justify-between border-t border-border/50 pt-2">
                          <span className="text-xs">Responsável:</span>
                          <span className="text-sm font-semibold text-primary">{registroSelecionado.responsavel_processamento_nome}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas dentro do Sheet */}
                  <div className="pt-6 flex gap-3">
                    {registroSelecionado.status_processamento === "AGUARDANDO" ? (
                      <Button 
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          iniciarMut.mutate(registroSelecionado.id);
                          setDetalhesAbertos(false);
                        }}
                        disabled={iniciarMut.isPending}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Iniciar Processamento
                      </Button>
                    ) : (
                      <Button 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          concluirMut.mutate(registroSelecionado.id);
                          setDetalhesAbertos(false);
                        }}
                        disabled={concluirMut.isPending || (registroSelecionado.responsavel_processamento_id !== user?.id)}
                        title={registroSelecionado.responsavel_processamento_id !== user?.id ? "Apenas o responsável pode concluir" : ""}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Concluir Registro
                      </Button>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppShell>
  );
}
