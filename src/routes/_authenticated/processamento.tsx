import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  getCentralProcessamentoKpis, 
  iniciarProcessamentoAdm, 
  iniciarProcessamentoGrupoAdm,
  concluirProcessamentoAdm, 
  reatribuirProcessamentoAdm 
} from "@/lib/ausencias.functions";
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
  FileText,
  Users,
  Calendar,
  ChevronRight,
  ArrowRight,
  ChevronLeft
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ProcessamentoCard } from "@/components/processamento/processamento-card";
import { AusenciaCardData, StatusProcessamento } from "@/components/processamento/types";
import { calcularPrioridade, getSlaStatus } from "@/components/processamento/utils";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSession } from "@/hooks/use-session";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Painel360 } from "@/components/processamento/painel-360";



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
  const iniciarGrupoFn = useServerFn(iniciarProcessamentoGrupoAdm);
  const concluirFn = useServerFn(concluirProcessamentoAdm);
  const reatribuirFn = useServerFn(reatribuirProcessamentoAdm);

  const kpisQ = useQuery({ 
    queryKey: ["processamento", "kpis"], 
    queryFn: () => getKpisFn(),
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
          colaborador:colaboradores(
            nome_completo, 
            matricula,
            supervisor_usuario_id,
            supervisor:profiles!colaboradores_supervisor_profiles_fkey(
              nome,
              email,
              telefone_whatsapp
            )
          )
        `)
        .neq("status_processamento", "PROCESSADO")
        .order("registrado_em", { ascending: true });
      
      if (error) throw error;

      return (data || []).map(row => {
        const { nome, matricula, supervisor_nome } = resolveAusenciaIdentidade({ 
          ...row, 
          colaborador: row.colaborador as any
        });

        return {
          id: row.id, 
          protocolo: row.protocolo, 
          tipo: row.tipo_ausencia_nome || row.tipo, 
          motivo: row.motivo || row.manual_motivo,
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
          colaborador_nome: nome || (row.colaborador_id ? "Dados do colaborador indisponíveis" : "—"), 
          colaborador_matricula: matricula || (row.colaborador_id ? "Dados do colaborador indisponíveis" : "—"), 
          empresa_nome: row.empresa?.nome || "N/A",
          projeto_nome: row.projeto?.nome || "N/A", 
          supervisor_nome: supervisor_nome || (row.colaborador?.supervisor_usuario_id ? "Supervisor vinculado, mas não carregado" : "Colaborador sem Supervisor vinculado"), 
          origem_registro: row.origem_registro,
          cid: row.cid, 
          acidente_trabalho: row.acidente_trabalho_trajeto, 
          status_rh: row.status,
          possui_anexo: row.possui_anexo,
          arquivo_url: row.arquivo_url,
          arquivo_nome: row.arquivo_nome,
          arquivo_mime: row.arquivo_mime,
          horario_inicio: row.horario_inicio,
          horario_fim: row.horario_fim,
          colaborador_id: row.colaborador_id,
          projeto_id: row.projeto_id
        } as AusenciaCardData;
      });
    }
  });

  const agrupado = useMemo(() => {
    const list = (ausenciasQ.data || []).filter(a => 
      a.colaborador_nome.toLowerCase().includes(search.toLowerCase()) || 
      a.colaborador_matricula.includes(search) || 
      a.protocolo?.toLowerCase().includes(search.toLowerCase())
    );

    const mapa = new Map<string, AusenciaCardData[]>();
    for (const item of list) {
      const chave = `${item.colaborador_id || item.colaborador_matricula}-${item.projeto_id || "sem-projeto"}`;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(item);
    }
    return Array.from(mapa.values());
  }, [ausenciasQ.data, search]);

  const iniciarMut = useMutation({
    mutationFn: (id: string) => iniciarFn({ data: { ausencia_id: id } }),
    onSuccess: () => {
      toast.success("Processamento iniciado.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const iniciarGrupoMut = useMutation({
    mutationFn: (payload: { colaborador_id: string | null | undefined, colaborador_matricula: string, projeto_id: string }) => 
      iniciarGrupoFn({ data: payload }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Grupo assumido: ${res.count} de ${res.total} pendências elegíveis.`);
        queryClient.invalidateQueries({ queryKey: ["processamento"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      } else {
        toast.error(res.message || "Não foi possível assumir o grupo.");
      }
    },
    onError: (e: any) => toast.error(e.message)
  });

  const concluirMut = useMutation({
    mutationFn: (id: string) => concluirFn({ data: { ausencia_id: id } }),
    onSuccess: () => {
      toast.success("Processamento concluído.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const reatribuirMut = useMutation({
    mutationFn: (payload: { id: string, responsavel_anterior_id: string }) => 
      reatribuirFn({ data: { ausencia_id: payload.id, responsavel_anterior_id: payload.responsavel_anterior_id } }),
    onSuccess: () => {
      toast.success("Processamento reatribuído com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const assumirProximo = () => {
    const pendentes = (ausenciasQ.data || []).filter(a => a.status_processamento === "AGUARDANDO");
    if (pendentes.length > 0) {
      // Prioridade: maior SLA (mais antigo)
      const maisAntigo = [...pendentes].sort((a, b) => 
        new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime()
      )[0];
      
      iniciarGrupoMut.mutate({
        colaborador_id: maisAntigo.colaborador_id,
        colaborador_matricula: maisAntigo.colaborador_matricula,
        projeto_id: maisAntigo.projeto_id!
      });
    } else {
      toast.info("Nenhum registro aguardando.");
    }
  };

  return (
    <AppShell title="Central de Processamento" breadcrumb={["Operações", "Central de Processamento"]}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <KpiCard title="Minha Fila" value={(ausenciasQ.data || []).filter(a => a.responsavel_processamento_id === user?.id).length} icon={User} color="bg-indigo-50 text-indigo-600" />
          <KpiCard title="Colaboradores" value={agrupado.length} icon={Users} color="bg-violet-50 text-violet-600" />
          <KpiCard title="Aguardando" value={kpisQ.data?.backlog ?? "0"} icon={History} color="bg-slate-50 text-slate-600" />
          <KpiCard title="Em Processamento" value={kpisQ.data?.em_processamento ?? "0"} icon={TrendingUp} color="bg-blue-50 text-blue-600" />
          <KpiCard title="Concluídos Hoje" value={kpisQ.data?.processados_hoje ?? "0"} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600" />
          <KpiCard title="Fora SLA" value={kpisQ.data?.fora_sla ?? "0"} icon={AlertTriangle} color="bg-red-50 text-red-600" />
          <Button className="h-full bg-primary font-black shadow-lg hover:bg-primary/90 transition-all hover:scale-[1.02]" onClick={assumirProximo} disabled={iniciarMut.isPending}>
            <Zap className="h-4 w-4 mr-2 fill-current" /> ASSUMIR PRÓXIMO
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-card/30 p-3 rounded-xl border">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, matrícula, protocolo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => { queryClient.invalidateQueries({ queryKey: ["processamento"] }); toast.info("Dados atualizados."); }}>
              <RefreshCcw className={cn("h-4 w-4", (ausenciasQ.isFetching || kpisQ.isFetching) && "animate-spin")} />
            </Button>
            <Badge variant="secondary" className="h-10 px-4 font-bold text-xs uppercase tracking-wider bg-white">
              {kpisQ.data?.backlog ?? "0"} ocorrências • {agrupado.length} colaboradores
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ausenciasQ.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />) 
          : agrupado.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-3 bg-muted/20 rounded-2xl border-2 border-dashed">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <h3 className="font-bold text-lg">Tudo limpo!</h3>
                <p className="text-sm text-muted-foreground">Nenhum registro pendente no momento.</p>
              </div>
            </div>
          ) : agrupado.map((grupo, i) => {
            const principal = grupo[0];
            const total = grupo.length;
            const faltas = grupo.filter(g => g.tipo.toLowerCase().includes('falta')).length;
            const atestados = grupo.filter(g => g.tipo.toLowerCase().includes('atestado')).length;
            
            // Etapa 3: SLA do Card (Mais antiga)
            const maisAntiga = [...grupo].sort((a, b) => 
              new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime()
            )[0];

            return (
              <Card key={i} className={cn(
                "p-4 border-2 shadow-sm flex flex-col gap-3 transition-all hover:border-primary/30",
                maisAntiga.sla_status === "FORA" && "border-red-200 bg-red-50/10"
              )}>
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <h3 className="font-black text-lg leading-tight uppercase truncate max-w-[200px]" title={principal.colaborador_nome}>
                      {principal.colaborador_nome}
                    </h3>
                    <p className="text-xs text-muted-foreground font-bold">Matrícula {principal.colaborador_matricula}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {maisAntiga.sla_status === "FORA" ? (
                      <Badge variant="destructive" className="font-black text-[9px] uppercase animate-pulse">Crítico</Badge>
                    ) : (
                      <Badge variant="outline" className="font-black text-[9px] uppercase bg-white">Normal</Badge>
                    )}
                  </div>
                </div>
                
                <div className="text-[11px] font-bold text-muted-foreground space-y-1 bg-white/50 border p-3 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-mk9-surface-deep/5">
                      <Users className="h-3 w-3" />
                    </div>
                    <p className="truncate">{principal.projeto_nome}</p>
                  </div>
                  <p className="pl-7 opacity-70">Supervisor: {principal.supervisor_nome}</p>
                  
                  <div className="pt-2 flex items-center justify-between border-t mt-2">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-[9px] uppercase opacity-60 leading-none">Pendências</p>
                        <p className="text-sm font-black text-foreground">{total}</p>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div>
                        <p className="text-[9px] uppercase opacity-60 leading-none">Resumo</p>
                        <p className="text-[10px] font-black">
                          {faltas} Faltas • {atestados} Atestados
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] px-1 font-bold">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Mais antiga: {format(new Date(maisAntiga.registrado_em), 'dd/MM')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary">
                    <Calendar className="h-3 w-3" />
                    <span>SLA: {maisAntiga.tempo_aguardando} dias</span>
                  </div>
                </div>

                <div className="mt-auto pt-3 flex gap-2">
                  <Button 
                    variant="outline"
                    className="flex-1 font-bold text-xs h-9" 
                    onClick={() => { setRegistroSelecionado(principal); setDetalhesAbertos(true); }}
                  >
                    Ver {total} lançamentos
                  </Button>
                  <Button 
                    className="bg-primary hover:bg-primary/90 font-bold text-xs h-9 px-4" 
                    onClick={() => iniciarGrupoMut.mutate({
                      colaborador_id: principal.colaborador_id,
                      colaborador_matricula: principal.colaborador_matricula,
                      projeto_id: principal.projeto_id!
                    })}
                    disabled={iniciarGrupoMut.isPending}
                  >
                    {iniciarGrupoMut.isPending ? <RefreshCcw className="h-3 w-3 animate-spin" /> : "Assumir"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Sheet open={detalhesAbertos} onOpenChange={setDetalhesAbertos}>
        <SheetContent className="p-0 sm:max-w-md md:max-w-xl w-full border-none">
          {registroSelecionado && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-xl uppercase leading-none">{registroSelecionado.colaborador_nome}</h2>
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mt-1">
                    <span>Matrícula {registroSelecionado.colaborador_matricula}</span>
                    <div className="h-3 w-px bg-border" />
                    <span>{agrupado.find(g => 
                      (g[0].colaborador_id === registroSelecionado.colaborador_id || 
                       g[0].colaborador_matricula === registroSelecionado.colaborador_matricula) &&
                      g[0].projeto_id === registroSelecionado.projeto_id
                    )?.length || 1} pendências</span>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full h-8 w-8"
                  onClick={() => setDetalhesAbertos(false)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50/50">
                <div className="p-4 space-y-4">
                  {/* Etapa 4: Resumo no Drawer */}
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-white border rounded-xl p-3 flex flex-col items-center justify-center text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1">Total</p>
                      <p className="text-xl font-black">
                        {agrupado.find(g => 
                          (g[0].colaborador_id === registroSelecionado.colaborador_id || 
                           g[0].colaborador_matricula === registroSelecionado.colaborador_matricula) &&
                          g[0].projeto_id === registroSelecionado.projeto_id
                        )?.length || 1}
                      </p>
                    </div>
                    <div className="bg-white border rounded-xl p-3 flex flex-col items-center justify-center text-center">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1">Critério</p>
                      <Badge className="font-black text-[10px] uppercase h-5">
                        {agrupado.find(g => 
                          (g[0].colaborador_id === registroSelecionado.colaborador_id || 
                           g[0].colaborador_matricula === registroSelecionado.colaborador_matricula) &&
                          g[0].projeto_id === registroSelecionado.projeto_id
                        )?.some(item => item.sla_status === "FORA") ? "CRÍTICO" : "NORMAL"}
                      </Badge>
                    </div>
                  </div>

                  <h3 className="text-[11px] font-black text-muted-foreground uppercase tracking-widest px-1">
                    Linha do Tempo de Pendências
                  </h3>

                  <div className="space-y-3">
                    {agrupado.find(g => 
                      (g[0].colaborador_id === registroSelecionado.colaborador_id || 
                       g[0].colaborador_matricula === registroSelecionado.colaborador_matricula) &&
                      g[0].projeto_id === registroSelecionado.projeto_id
                    )?.sort((a, b) => new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime())
                    .map((item) => (
                      <div 
                        key={item.id}
                        className={cn(
                          "p-4 border rounded-xl cursor-pointer transition-all hover:shadow-md group relative overflow-hidden",
                          registroSelecionado.id === item.id 
                            ? "border-primary bg-white ring-1 ring-primary shadow-lg" 
                            : "bg-white hover:border-primary/20"
                        )}
                        onClick={() => setRegistroSelecionado(item)}
                      >
                        {registroSelecionado.id === item.id && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                        )}
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={item.sla_status === "FORA" ? "destructive" : "outline"} className="text-[9px] font-black uppercase">
                                {item.protocolo || "Sem Protocolo"}
                              </Badge>
                              <span className="text-[10px] font-black uppercase text-muted-foreground">
                                {format(new Date(item.registrado_em), 'dd/MM/yyyy')}
                              </span>
                            </div>
                            <h4 className="font-black text-sm uppercase flex items-center gap-2">
                              {item.tipo}
                              {item.id === registroSelecionado.id && (
                                <ArrowRight className="h-3 w-3 text-primary animate-pulse" />
                              )}
                            </h4>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none">SLA</p>
                            <p className={cn("text-sm font-black", item.sla_status === "FORA" ? "text-red-500" : "text-primary")}>
                              {item.tempo_aguardando}d
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t mt-auto bg-white shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-black text-primary uppercase bg-primary/5 p-2 rounded-lg border border-primary/10">
                  <Zap className="h-3 w-3 fill-current" />
                  Visualizando: {registroSelecionado.protocolo || registroSelecionado.tipo}
                </div>
                <Painel360 
                  data={registroSelecionado}
                  onIniciar={(id) => { iniciarMut.mutate(id); }}
                  onConcluir={(id) => { concluirMut.mutate(id); setDetalhesAbertos(false); }}
                  onReatribuir={(id, antId) => { reatribuirMut.mutate({ id, responsavel_anterior_id: antId }); }}
                  isProcessing={iniciarMut.isPending || concluirMut.isPending || reatribuirMut.isPending}
                  currentUserId={user?.id}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
