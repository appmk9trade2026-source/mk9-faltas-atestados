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
import { 
  Search, 
  RefreshCcw, 
  History, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  User,
  Clock,
  UserRound,
  FileText
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
        <div className="min-w-0">
          <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider truncate">{title}</p>
          <h3 className="text-xl font-black">{value}</h3>
        </div>
        <div className={cn("p-2 rounded-lg shrink-0", color)}>
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

  const kpisQ = useQuery({ 
    queryKey: ["processamento", "kpis"], 
    queryFn: () => getKpisFn(),
    refetchInterval: 60000
  });

  const ausenciasQ = useQuery({
    queryKey: ["processamento", "fila"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ausencias")
        .select("*, empresa:empresas(nome), projeto:projetos(nome), colaborador:colaboradores(nome_completo, matricula)")
        .neq("status_processamento", "PROCESSADO")
        .order("registrado_em", { ascending: true });
      
      if (error) throw error;

      return (data || []).map(row => {
        const { nome, matricula, supervisor_nome } = resolveAusenciaIdentidade({ 
          ...row, 
          colaborador: row.colaborador ? { ...row.colaborador, supervisor_nome: row.manual_supervisor_nome } : null 
        });
        return {
          id: row.id, 
          protocolo: row.protocolo, 
          tipo: row.tipo_ausencia_nome || row.tipo, 
          motivo: row.motivo,
          data_inicio: row.data_inicio, 
          data_fim: row.data_fim, 
          dias: row.dias, 
          registrado_em: row.registrado_em,
          lancado_em: row.lancado_em, 
          processamento_iniciado_em: row.processamento_iniciado_em, 
          processamento_concluido_em: row.processamento_concluido_em,
          status_processamento: row.status_processamento as StatusProcessamento, 
          responsavel_processamento_id: row.responsavel_processamento_id,
          responsavel_processamento_nome: row.responsavel_processamento_nome, 
          prioridade: calcularPrioridade(row.registrado_em),
          tempo_aguardando: differenceInDays(new Date(), new Date(row.registrado_em)), 
          sla_status: getSlaStatus(row.registrado_em),
          colaborador_nome: nome || "N/A", 
          colaborador_matricula: matricula || "N/A", 
          empresa_nome: row.empresa?.nome || "N/A",
          projeto_nome: row.projeto?.nome || "N/A", 
          supervisor_nome: supervisor_nome || "N/A", 
          origem_registro: row.origem_registro,
          cid: row.cid, 
          acidente_trabalho: row.acidente_trabalho_trajeto, 
          status_rh: row.status
        } as AusenciaCardData;
      });
    }
  });

  const sortedAndFiltered = useMemo(() => {
    let list = (ausenciasQ.data || []).filter(a => 
      a.colaborador_nome.toLowerCase().includes(search.toLowerCase()) || 
      a.colaborador_matricula.includes(search) || 
      a.protocolo?.toLowerCase().includes(search.toLowerCase())
    );
    return list.sort((a, b) => {
      // 1. Fora do SLA
      if (a.sla_status === "FORA" && b.sla_status !== "FORA") return -1;
      if (b.sla_status === "FORA" && a.sla_status !== "FORA") return 1;
      // 2. Maior tempo aguardando
      if (b.tempo_aguardando !== a.tempo_aguardando) return b.tempo_aguardando - a.tempo_aguardando;
      // 3. Prioridade Alta
      const pOrder = { CRITICO: 3, ATENCAO: 2, NORMAL: 1 };
      if (pOrder[b.prioridade] !== pOrder[a.prioridade]) return pOrder[b.prioridade] - pOrder[a.prioridade];
      // 4. Mais antigos (registrado_em)
      return new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime();
    });
  }, [ausenciasQ.data, search]);

  const iniciarMut = useMutation({
    mutationFn: (id: string) => iniciarFn({ data: { ausencia_id: id } }),
    onSuccess: () => {
      toast.success("Processamento iniciado.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const concluirMut = useMutation({
    mutationFn: (id: string) => concluirFn({ data: { ausencia_id: id } }),
    onSuccess: () => {
      toast.success("Processamento concluído.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const assumirProximo = () => {
    const proximo = sortedAndFiltered.find(a => a.status_processamento === "AGUARDANDO");
    if (proximo) iniciarMut.mutate(proximo.id);
    else toast.info("Nenhum registro aguardando.");
  };

  const timelineSteps = [
    { id: "REGISTRO", label: "Registrado", icon: FileText, date: registroSelecionado?.registrado_em },
    { id: "LANCADO", label: "Lançado RH", icon: CheckCircle2, date: registroSelecionado?.lancado_em },
    { id: "AGUARDANDO", label: "Aguardando", icon: History, date: registroSelecionado?.status_processamento === "AGUARDANDO" ? new Date().toISOString() : null },
    { id: "EM_PROCESSAMENTO", label: "Em Processamento", icon: TrendingUp, date: registroSelecionado?.processamento_iniciado_em },
    { id: "PROCESSADO", label: "Processado", icon: Zap, date: registroSelecionado?.processamento_concluido_em },
  ];

  const currentStepIndex = registroSelecionado?.status_processamento === "PROCESSADO" ? 4 
    : registroSelecionado?.status_processamento === "EM_PROCESSAMENTO" ? 3
    : registroSelecionado?.status_processamento === "AGUARDANDO" ? 2
    : registroSelecionado?.lancado_em ? 1 : 0;

  return (
    <AppShell title="Central de Processamento" breadcrumb={["Operações", "Central de Processamento"]}>
      <div className="space-y-6">
        {/* Etapa 1: Cabeçalho Operacional */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard title="Minha Fila" value={sortedAndFiltered.filter(a => a.responsavel_processamento_id === user?.id).length} icon={User} color="bg-indigo-50 text-indigo-600" />
          <KpiCard title="Aguardando" value={kpisQ.data?.backlog ?? "0"} icon={History} color="bg-slate-50 text-slate-600" />
          <KpiCard title="Em Processamento" value={kpisQ.data?.em_processamento ?? "0"} icon={TrendingUp} color="bg-blue-50 text-blue-600" />
          <KpiCard title="Concluídos Hoje" value={kpisQ.data?.processados_hoje ?? "0"} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600" />
          <KpiCard title="Fora SLA" value={kpisQ.data?.fora_sla ?? "0"} icon={AlertTriangle} color="bg-red-50 text-red-600" />
          <Button className="h-full bg-primary font-black shadow-lg hover:bg-primary/90 transition-all hover:scale-[1.02]" onClick={assumirProximo} disabled={iniciarMut.isPending}>
            <Zap className="h-4 w-4 mr-2 fill-current" /> ASSUMIR PRÓXIMO
          </Button>
        </div>

        {/* Etapa 7 & 8: Busca e Filtros */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-card/30 p-3 rounded-xl border">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, matrícula, protocolo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => { queryClient.invalidateQueries({ queryKey: ["processamento"] }); toast.info("Dados atualizados."); }}>
              <RefreshCcw className={cn("h-4 w-4", (ausenciasQ.isFetching || kpisQ.isFetching) && "animate-spin")} />
            </Button>
            <Badge variant="secondary" className="h-10 px-4 font-bold text-xs uppercase tracking-wider">
              {sortedAndFiltered.length} na fila
            </Badge>
          </div>
        </div>

        {/* Etapa 2: Fila Inteligente */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ausenciasQ.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />) 
          : sortedAndFiltered.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-3 bg-muted/20 rounded-2xl border-2 border-dashed">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <h3 className="font-bold text-lg">Tudo limpo!</h3>
                <p className="text-sm text-muted-foreground">Nenhum registro pendente no momento.</p>
              </div>
            </div>
          ) : sortedAndFiltered.map((a, i) => (
            <ProcessamentoCard 
              key={a.id} 
              data={a} 
              currentUserId={user?.id} 
              isNextInLine={i === 0 && a.status_processamento === "AGUARDANDO"} 
              onIniciar={(id) => iniciarMut.mutate(id)} 
              onConcluir={(id) => concluirMut.mutate(id)} 
              onVerDetalhes={(d) => { setRegistroSelecionado(d); setDetalhesAbertos(true); }} 
              isProcessing={iniciarMut.isPending || concluirMut.isPending} 
            />
          ))}
        </div>
      </div>

      {/* Etapa 9: Detalhe Sheet com Timeline */}
      <Sheet open={detalhesAbertos} onOpenChange={setDetalhesAbertos}>
        <SheetContent className="sm:max-w-md md:max-w-xl w-full">
          <SheetHeader className="pr-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[10px] font-bold uppercase">PROTOCOL: {registroSelecionado?.protocolo || "—"}</Badge>
              {registroSelecionado?.sla_status === "FORA" && <Badge variant="destructive" className="text-[10px] font-black animate-pulse">FORA DO SLA</Badge>}
            </div>
            <SheetTitle className="text-2xl font-black leading-none">{registroSelecionado?.colaborador_nome}</SheetTitle>
            <SheetDescription className="text-sm font-medium">{registroSelecionado?.empresa_nome} • {registroSelecionado?.projeto_nome}</SheetDescription>
          </SheetHeader>

          <Separator className="my-6" />

          {registroSelecionado && (
            <ScrollArea className="h-[calc(100vh-180px)] pr-4">
              <div className="space-y-8">
                {/* Timeline Visual */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <History className="h-3 w-3" /> FLUXO OPERACIONAL
                  </h4>
                  <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-muted">
                    {timelineSteps.map((step, idx) => {
                      const isActive = idx <= currentStepIndex;
                      const isLast = idx === currentStepIndex;
                      return (
                        <div key={step.id} className="relative">
                          <div className={cn("absolute -left-[23px] top-0 h-4 w-4 rounded-full border-2 bg-background z-10", isActive ? "border-primary bg-primary" : "border-muted")}>
                            {isActive && <CheckCircle2 className="h-3 w-3 text-white m-[1px]" />}
                          </div>
                          <div className={cn("space-y-0.5", isActive ? "text-foreground" : "text-muted-foreground")}>
                            <p className={cn("text-xs font-bold uppercase tracking-tight", isLast && "text-primary")}>{step.label}</p>
                            {step.date && <p className="text-[10px] opacity-70 font-medium">{new Date(step.date).toLocaleString("pt-BR")}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detalhes Ricos */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 p-3 bg-muted/30 rounded-lg border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Matrícula</p>
                    <p className="text-sm font-black">{registroSelecionado.colaborador_matricula}</p>
                  </div>
                  <div className="space-y-1 p-3 bg-muted/30 rounded-lg border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Supervisor</p>
                    <p className="text-sm font-black truncate">{registroSelecionado.supervisor_nome}</p>
                  </div>
                  <div className="space-y-1 p-3 bg-muted/30 rounded-lg border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Status RH</p>
                    <Badge variant="secondary" className="font-bold text-[11px]">{registroSelecionado.status_rh}</Badge>
                  </div>
                  <div className="space-y-1 p-3 bg-muted/30 rounded-lg border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Prioridade</p>
                    <Badge variant="outline" className={cn("font-bold text-[11px]", registroSelecionado.prioridade === 'CRITICO' ? 'text-red-600 border-red-200' : 'text-primary')}>{registroSelecionado.prioridade}</Badge>
                  </div>
                </div>

                <div className="space-y-3">
                   <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <FileText className="h-3 w-3" /> DETALHES DA AUSÊNCIA
                  </h4>
                  <div className="p-4 bg-card border rounded-xl space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Tipo</p>
                        <p className="text-sm font-bold">{registroSelecionado.tipo}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">CID</p>
                        <p className="text-sm font-black text-primary">{registroSelecionado.cid || "NÃO INFORMADO"}</p>
                      </div>
                    </div>
                    {registroSelecionado.acidente_trabalho && (
                      <Badge variant="destructive" className="w-full justify-center py-1 font-black">ACIDENTE DE TRABALHO</Badge>
                    )}
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Motivo / Observações</p>
                      <p className="text-sm text-foreground/80 italic bg-muted/50 p-3 rounded-lg mt-1">"{registroSelecionado.motivo || 'Nenhuma observação informada.'}"</p>
                    </div>
                  </div>
                </div>

                {/* Ações no Detalhe */}
                <div className="pt-6 flex gap-3">
                  {registroSelecionado.status_processamento === "AGUARDANDO" && (
                    <Button className="flex-1 bg-blue-600 font-bold" onClick={() => { iniciarMut.mutate(registroSelecionado.id); setDetalhesAbertos(false); }}>Assumir Processamento</Button>
                  )}
                  {registroSelecionado.status_processamento === "EM_PROCESSAMENTO" && (
                    <Button className="flex-1 bg-emerald-600 font-bold" onClick={() => { concluirMut.mutate(registroSelecionado.id); setDetalhesAbertos(false); }}>Concluir Processamento</Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}