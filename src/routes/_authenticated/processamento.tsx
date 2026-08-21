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
  ChevronLeft,
  Columns,
  List,
  Layout
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { SupportHelpButton } from "@/components/support/support-help-button";
import { useSupport } from "@/components/support/support-provider";
import { parseRbacError } from "@/lib/rbac/errors";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Painel360 } from "@/components/processamento/painel-360";



export const Route = createFileRoute("/_authenticated/processamento")({
  beforeLoad: async ({ context }) => {
    // PROTEÇÃO P0: Bloqueio estrito de acesso para perfis não administrativos
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", (context as any).userId);
    
    const userRoles = roles?.map((r: any) => r.role) || [];
    const hasAccess = userRoles.some((r: any) => ["super_admin", "rh", "compliance"].includes(r));

    if (!hasAccess) {
      throw new Error("UNAUTHORIZED: Acesso restrito ao RH e Administradores.");
    }
  },
  head: () => ({ meta: [{ title: "Central de Processamento · CRM MK9" }] }),
  component: CentralProcessamentoPage,
});

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function KpiCard({ title, value, icon: Icon, color, onClick, active, tooltip }: any) {
  const content = (
    <Card 
      className={cn(
        "border-2 shadow-sm transition-all cursor-pointer select-none relative overflow-hidden group",
        active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-transparent bg-card/50 hover:border-primary/30 hover:bg-card/80",
        "h-full"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-pressed={active}
      aria-label={`${title}: ${value}`}
    >
      <CardContent className="p-4 flex items-center justify-between h-full">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider truncate group-hover:text-primary transition-colors">
            {title}
          </p>
          <h3 className={cn("text-xl font-black transition-all", active ? "text-primary scale-110 origin-left" : "")}>
            {value}
          </h3>
        </div>
        <div className={cn(
          "p-2 rounded-lg shrink-0 transition-all group-hover:scale-110", 
          active ? "bg-primary text-white shadow-md" : color
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
      {active && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-primary animate-in slide-in-from-left duration-300" />
      )}
    </Card>
  );

  if (!tooltip) return content;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px] text-center font-medium">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CentralProcessamentoPage() {
  const { user } = useSession();
  const { openSupport } = useSupport();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);
  const [registroSelecionado, setRegistroSelecionado] = useState<AusenciaCardData | null>(null);
  const [tabAtiva, setTabAtiva] = useState<"AGUARDANDO" | "MINHA_FILA">("AGUARDANDO");
  const [filterKpi, setFilterKpi] = useState<string | null>(null);

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
          tipo_ausencia_nome: row.tipo_ausencia_nome,


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
    const list = (ausenciasQ.data || []).filter(a => {
      const matchSearch = a.colaborador_nome.toLowerCase().includes(search.toLowerCase()) || 
        a.colaborador_matricula.includes(search) || 
        a.protocolo?.toLowerCase().includes(search.toLowerCase());
      
      if (!matchSearch) return false;

      // Se existir filtro por KPI, ele manda no comportamento inicial da listagem
      if (filterKpi) {
        if (filterKpi === "MINHA_FILA") return a.responsavel_processamento_id === user?.id && a.status_processamento === "EM_PROCESSAMENTO";
        if (filterKpi === "AGUARDANDO") return a.status_processamento === "AGUARDANDO";
        if (filterKpi === "EM_PROCESSAMENTO") return a.status_processamento === "EM_PROCESSAMENTO";
        if (filterKpi === "CONCLUIDOS_HOJE") {
          if (!a.processamento_concluido_em) return false;
          const hoje = format(new Date(), "yyyy-MM-dd");
          const dataConclusao = format(new Date(a.processamento_concluido_em), "yyyy-MM-dd");
          return dataConclusao === hoje;
        }
        if (filterKpi === "FORA_SLA") return a.status_processamento !== "PROCESSADO" && a.sla_status === "FORA";
        if (filterKpi === "COLABORADORES") return a.status_processamento !== "PROCESSADO";
      }

      // Fallback para filtros de aba padrão se nenhum KPI estiver selecionado
      if (tabAtiva === "MINHA_FILA") {
        return a.responsavel_processamento_id === user?.id && a.status_processamento === "EM_PROCESSAMENTO";
      } else {
        return a.status_processamento === "AGUARDANDO";
      }
    });

    const mapa = new Map<string, AusenciaCardData[]>();
    for (const item of list) {
      const colabKey = item.colaborador_id || `m-${item.colaborador_matricula}`;
      const projKey = item.projeto_id || "sem-projeto";
      const chave = `${colabKey}|${projKey}`;
      
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(item);
    }
    return Array.from(mapa.values());
  }, [ausenciasQ.data, search, tabAtiva, user?.id]);

  const iniciarMut = useMutation({
    mutationFn: (id: string) => iniciarFn({ data: { ausencia_id: id } }),
    onSuccess: (_, initiatedId) => {
      toast.success("Processamento iniciado.");
      
      // Se estivermos no drawer, atualizar o registro selecionado para refletir o status EM_PROCESSAMENTO
      if (registroSelecionado && registroSelecionado.id === initiatedId) {
        setRegistroSelecionado({
          ...registroSelecionado,
          status_processamento: "EM_PROCESSAMENTO",
          responsavel_processamento_id: user?.id || null,
          responsavel_processamento_nome: user?.user_metadata?.nome || "Você"
        });
      }

      queryClient.invalidateQueries({ queryKey: ["processamento"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },

    onError: (e: any) => {
      const errData = parseRbacError(e);
      if (typeof e.message === 'string' && e.message.trim().startsWith('<!DOCTYPE html>')) {
        toast.error("Erro Crítico: Resposta inesperada do servidor (HTML).", {
          action: {
            label: "Ajuda",
            onClick: () => openSupport({
              sourceModule: "Central de Processamento",
              safeCode: "HTML-ERR-PROC",
              suggestedCategory: "ERRO_SISTEMA"
            })
          }
        });
        console.error("HTML Guard detectou crash de runtime:", e.message);
      } else {
        toast.error("Erro ao iniciar processamento.", {
          description: e.message || "Erro técnico na atribuição.",
          action: errData.code === "TECHNICAL_ERROR" || errData.code === "UNKNOWN" ? {
            label: "Ajuda",
            onClick: () => openSupport({
              sourceModule: "Central de Processamento",
              entityType: "ausencia",
              entityId: registroSelecionado?.id,
              safeCode: errData.correlationId || "SAFE-ERR-PROC",
              suggestedCategory: "ERRO_SISTEMA"
            })
          } : undefined
        });
      }
    }

  });

  const iniciarGrupoMut = useMutation({
    mutationFn: (payload: { colaborador_id: string | null | undefined, colaborador_matricula: string, projeto_id: string }) => 
      iniciarGrupoFn({ data: payload }),
    onSuccess: (res: any) => {
      if (res.success) {
        toast.success(`Grupo assumido: ${res.count} de ${res.total} pendências elegíveis.`);
        setTabAtiva("MINHA_FILA"); // Mudar automaticamente para facilitar fluxo
        queryClient.invalidateQueries({ queryKey: ["processamento"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      } else {
        toast.error(res.message || "Não foi possível assumir o grupo.");
      }
    },
    onError: (e: any) => {
      if (typeof e.message === 'string' && e.message.trim().startsWith('<!DOCTYPE html>')) {
        toast.error("Erro Crítico: Resposta inesperada do servidor (HTML).");
      } else {
        toast.error(e.message || "Erro ao processar grupo.");
      }
    }
  });

  const concluirMut = useMutation({
    mutationFn: (id: string) => concluirFn({ data: { ausencia_id: id } }),
    onSuccess: (_, concludedId) => {
      toast.success("Processamento concluído.");
      
      // Auto-navegação para o próximo pendente do mesmo grupo
      if (registroSelecionado && registroSelecionado.id === concludedId) {
        const colabKey = registroSelecionado.colaborador_id || `m-${registroSelecionado.colaborador_matricula}`;
        const projKey = registroSelecionado.projeto_id || "sem-projeto";
        const chave = `${colabKey}|${projKey}`;
        
        const restantes = (ausenciasQ.data || []).filter(a => {
          const aColabKey = a.colaborador_id || `m-${a.colaborador_matricula}`;
          const aProjKey = a.projeto_id || "sem-projeto";
          return `${aColabKey}|${aProjKey}` === chave && 
                 a.status_processamento !== "PROCESSADO" && 
                 a.id !== concludedId;
        });

        if (restantes.length > 0) {
          const proximo = [...restantes].sort((a, b) => 
            new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime()
          )[0];
          setRegistroSelecionado(proximo);
        } else {
          setDetalhesAbertos(false);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["processamento"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },

    onError: (e: any) => {
      const errData = parseRbacError(e);
      if (typeof e.message === 'string' && e.message.trim().startsWith('<!DOCTYPE html>')) {
        toast.error("Erro Crítico: Resposta inesperada do servidor (HTML).", {
          action: {
            label: "Ajuda",
            onClick: () => openSupport({
              sourceModule: "Central de Processamento",
              safeCode: "HTML-ERR-CONCLUDE",
              suggestedCategory: "ERRO_SISTEMA"
            })
          }
        });
      } else {
        toast.error("Erro ao concluir processamento.", {
          description: e.message || "Erro técnico na conclusão.",
          action: errData.code === "TECHNICAL_ERROR" || errData.code === "UNKNOWN" ? {
            label: "Ajuda",
            onClick: () => openSupport({
              sourceModule: "Central de Processamento",
              entityType: "ausencia",
              entityId: registroSelecionado?.id,
              safeCode: errData.correlationId || "SAFE-ERR-CONCLUDE",
              suggestedCategory: "ERRO_SISTEMA"
            })
          } : undefined
        });
      }
    }

  });

  const reatribuirMut = useMutation({
    mutationFn: (payload: { id: string, responsavel_anterior_id: string }) => 
      reatribuirFn({ data: { ausencia_id: payload.id, responsavel_anterior_id: payload.responsavel_anterior_id } }),
    onSuccess: (_, variables) => {
      toast.success("Processamento reatribuído com sucesso.");
      
      // Se estivermos no drawer, atualizar o registro selecionado
      if (registroSelecionado && registroSelecionado.id === variables.id) {
        setRegistroSelecionado({
          ...registroSelecionado,
          status_processamento: "EM_PROCESSAMENTO",
          responsavel_processamento_id: user?.id || null,
          responsavel_processamento_nome: user?.user_metadata?.nome || "Você"
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["processamento"] });
    },

    onError: (e: any) => {
      if (typeof e.message === 'string' && e.message.trim().startsWith('<!DOCTYPE html>')) {
        toast.error("Erro Crítico: Resposta inesperada do servidor (HTML).");
      } else {
        toast.error(e.message || "Erro ao reatribuir processamento.");
      }
    }
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
    <AppShell title="Central de Processamento" breadcrumb={["Operações", "Central de Processamento"]} actions={<SupportHelpButton context={{ sourceModule: "Central de Processamento", suggestedCategory: "PROCESSAMENTO_INTERNO" }} />}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <KpiCard 
            title="Minha Fila" 
            value={(ausenciasQ.data || []).filter(a => a.responsavel_processamento_id === user?.id && a.status_processamento === 'EM_PROCESSAMENTO').length} 
            icon={User} 
            color="bg-indigo-50 text-indigo-600" 
            onClick={() => setFilterKpi(filterKpi === "MINHA_FILA" ? null : "MINHA_FILA")}
            active={filterKpi === "MINHA_FILA"}
            tooltip="Registros atualmente atribuídos a você."
          />
          <KpiCard 
            title="Colaboradores" 
            value={agrupado.length} 
            icon={Users} 
            color="bg-violet-50 text-violet-600" 
            onClick={() => setFilterKpi(filterKpi === "COLABORADORES" ? null : "COLABORADORES")}
            active={filterKpi === "COLABORADORES"}
            tooltip="Colaboradores com registros na Central de Processamento."
          />
          <KpiCard 
            title="Aguardando" 
            value={kpisQ.data?.backlog ?? "0"} 
            icon={History} 
            color="bg-slate-50 text-slate-600" 
            onClick={() => setFilterKpi(filterKpi === "AGUARDANDO" ? null : "AGUARDANDO")}
            active={filterKpi === "AGUARDANDO"}
            tooltip="Registros que ainda aguardam início do processamento."
          />
          <KpiCard 
            title="Em Processamento" 
            value={kpisQ.data?.em_processamento ?? "0"} 
            icon={TrendingUp} 
            color="bg-blue-50 text-blue-600" 
            onClick={() => setFilterKpi(filterKpi === "EM_PROCESSAMENTO" ? null : "EM_PROCESSAMENTO")}
            active={filterKpi === "EM_PROCESSAMENTO"}
            tooltip="Registros já assumidos e atualmente em tratamento."
          />
          <KpiCard 
            title="Concluídos Hoje" 
            value={kpisQ.data?.processados_hoje ?? "0"} 
            icon={CheckCircle2} 
            color="bg-emerald-50 text-emerald-600" 
            onClick={() => setFilterKpi(filterKpi === "CONCLUIDOS_HOJE" ? null : "CONCLUIDOS_HOJE")}
            active={filterKpi === "CONCLUIDOS_HOJE"}
            tooltip="Registros finalizados hoje."
          />
          <KpiCard 
            title="Fora SLA" 
            value={kpisQ.data?.fora_sla ?? "0"} 
            icon={AlertTriangle} 
            color="bg-red-50 text-red-600" 
            onClick={() => setFilterKpi(filterKpi === "FORA_SLA" ? null : "FORA_SLA")}
            active={filterKpi === "FORA_SLA"}
            tooltip="Registros que ultrapassaram o prazo operacional previsto."
          />
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
              {tabAtiva === "AGUARDANDO" ? kpisQ.data?.backlog ?? "0" : (ausenciasQ.data || []).filter(a => a.responsavel_processamento_id === user?.id && a.status_processamento === 'EM_PROCESSAMENTO').length} ocorrências • {agrupado.length} colaboradores
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl w-fit border border-dashed">
          <Button 
            variant={tabAtiva === "AGUARDANDO" ? "default" : "ghost"}
            size="sm"
            className={cn("font-black text-[10px] uppercase h-8 px-4", tabAtiva === "AGUARDANDO" ? "shadow-md" : "opacity-60")}
            onClick={() => setTabAtiva("AGUARDANDO")}
          >
            Fila Geral ({kpisQ.data?.backlog ?? "0"})
          </Button>
          <Button 
            variant={tabAtiva === "MINHA_FILA" ? "default" : "ghost"}
            size="sm"
            className={cn("font-black text-[10px] uppercase h-8 px-4", tabAtiva === "MINHA_FILA" ? "shadow-md text-white bg-blue-600 hover:bg-blue-700" : "opacity-60")}
            onClick={() => setTabAtiva("MINHA_FILA")}
          >
            Minha Fila ({(ausenciasQ.data || []).filter(a => a.responsavel_processamento_id === user?.id && a.status_processamento === "EM_PROCESSAMENTO").length})
          </Button>
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
                maisAntiga.sla_status === "FORA" && tabAtiva === "AGUARDANDO" && "border-red-200 bg-red-50/10",
                tabAtiva === "MINHA_FILA" && "border-blue-200 bg-blue-50/5"
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
                  <div className={cn(
                    "flex items-center gap-1.5",
                    maisAntiga.sla_status === "FORA" ? "text-red-600" : "text-primary"
                  )}>
                    <Calendar className="h-3 w-3" />
                    <span>SLA: {maisAntiga.tempo_aguardando} dias</span>
                  </div>
                </div>

                <div className="mt-auto pt-3 flex gap-2">
                  <Button 
                    variant="outline"
                    className="flex-1 font-bold text-xs h-9" 
                    onClick={() => { 
                      // Padronização P0: Mesma lógica de chave do agrupamento
                      const colabKey = principal.colaborador_id || `m-${principal.colaborador_matricula}`;
                      const projKey = principal.projeto_id || "sem-projeto";
                      const chaveAlvo = `${colabKey}|${projKey}`;
                      
                      const grupoCompleto = agrupado.find(g => {
                        const gColabKey = g[0].colaborador_id || `m-${g[0].colaborador_matricula}`;
                        const gProjKey = g[0].projeto_id || "sem-projeto";
                        return `${gColabKey}|${gProjKey}` === chaveAlvo;
                      });
                      
                      if (grupoCompleto && grupoCompleto.length > 0) {
                        const ordenado = [...grupoCompleto].sort((a, b) => 
                          new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime()
                        );
                        setRegistroSelecionado(ordenado[0]); 
                      } else {
                        setRegistroSelecionado(principal);
                      }
                      setDetalhesAbertos(true); 
                    }}
                  >
                    Ver {grupo.length} lançamentos
                  </Button>
                  <Button 
                    className={cn(
                      "font-bold text-xs h-9 px-4",
                      tabAtiva === "MINHA_FILA" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:bg-primary/90"
                    )}
                    onClick={() => {
                      if (tabAtiva === "MINHA_FILA") {
                        // Se já está na minha fila, o botão "Assumir" vira "Continuar" e abre o primeiro do grupo
                        const ordenado = [...grupo].sort((a, b) => 
                          new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime()
                        );
                        setRegistroSelecionado(ordenado[0]);
                        setDetalhesAbertos(true);
                      } else {
                        iniciarGrupoMut.mutate({
                          colaborador_id: principal.colaborador_id,
                          colaborador_matricula: principal.colaborador_matricula,
                          projeto_id: principal.projeto_id!
                        });
                      }
                    }}
                    disabled={iniciarGrupoMut.isPending}
                  >
                    {iniciarGrupoMut.isPending ? <RefreshCcw className="h-3 w-3 animate-spin" /> : (tabAtiva === "MINHA_FILA" ? "Continuar" : "Assumir")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Sheet open={detalhesAbertos} onOpenChange={setDetalhesAbertos}>
        <SheetContent 
          side="right" 
          className="p-0 w-full sm:w-[95vw] lg:w-[min(1100px,92vw)] max-w-none border-l shadow-2xl overflow-hidden"
          style={{ maxWidth: 'none' }}



        >
          {registroSelecionado && (
            <div className="flex flex-col h-full bg-background">
              {/* Header Fixo do Drawer */}
              <div className="shrink-0 p-5 border-b bg-mk9-surface-deep/5 flex items-center justify-between pr-12">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-black tracking-tight leading-tight uppercase truncate max-w-[300px] lg:max-w-md">
                    {registroSelecionado.colaborador_nome}
                  </h2>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                    <span>MAT: {registroSelecionado.colaborador_matricula}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>{registroSelecionado.empresa_nome}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span className="text-primary font-black">
                      {(() => {
                        const colabKey = registroSelecionado.colaborador_id || `m-${registroSelecionado.colaborador_matricula}`;
                        const projKey = registroSelecionado.projeto_id || "sem-projeto";
                        const chave = `${colabKey}|${projKey}`;
                        const grupo = (ausenciasQ.data || []).filter(a => {
                          const aColabKey = a.colaborador_id || `m-${a.colaborador_matricula}`;
                          const aProjKey = a.projeto_id || "sem-projeto";
                          return `${aColabKey}|${aProjKey}` === chave && a.status_processamento !== "PROCESSADO";
                        });

                        return `${grupo?.length || 1} pendências`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
                {/* Coluna Esquerda: Lista de Lançamentos (Desktop) */}
                <div className="w-full lg:w-[320px] lg:border-r bg-slate-50/30 overflow-hidden flex flex-col h-auto max-h-[250px] lg:max-h-none lg:h-full">
                  <div className="shrink-0 p-3 bg-slate-100/50 border-b">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <History className="h-3.5 w-3.5" /> Fila do Grupo
                    </p>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1.5">
                      {(() => {
                        const colabKey = registroSelecionado.colaborador_id || `m-${registroSelecionado.colaborador_matricula}`;
                        const projKey = registroSelecionado.projeto_id || "sem-projeto";
                        const chave = `${colabKey}|${projKey}`;
                        const grupo = (ausenciasQ.data || []).filter(a => {
                          const aColabKey = a.colaborador_id || `m-${a.colaborador_matricula}`;
                          const aProjKey = a.projeto_id || "sem-projeto";
                          return `${aColabKey}|${aProjKey}` === chave && a.status_processamento !== "PROCESSADO";
                        });

                        const ordenado = [...(grupo || [])].sort((a, b) => 
                          new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime()
                        );

                        return ordenado.map((item) => {
                          const isActive = registroSelecionado.id === item.id;
                          const sla = getSlaStatus(item.registrado_em);
                          
                          return (
                            <button
                              key={item.id}
                              onClick={() => setRegistroSelecionado(item)}
                              className={cn(
                                "w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden group mb-1",
                                isActive 
                                  ? "bg-white border-primary shadow-sm ring-1 ring-primary/20" 
                                  : "bg-white/50 border-transparent hover:border-slate-300 hover:bg-white"
                              )}
                            >
                              {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                              )}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                    {format(new Date(item.registrado_em), 'dd/MM/yyyy')}
                                  </p>
                                  {sla === "FORA" && (
                                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                  )}
                                </div>
                                <p className={cn(
                                  "text-[11px] font-black uppercase leading-tight truncate",
                                  isActive ? "text-primary" : "text-foreground"
                                )}>
                                  {item.tipo}
                                </p>
                                <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase opacity-60">
                                  <span>{item.dias} {item.dias === 1 ? 'dia' : 'dias'}</span>
                                  <span>{item.protocolo?.split('-').pop()}</span>
                                </div>
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </ScrollArea>
                </div>

                {/* Coluna Direita: Detalhe do Lançamento */}
                <div className="flex-1 overflow-hidden relative bg-background">
                  <Painel360 
                    data={registroSelecionado}
                    currentUserId={user?.id}
                    isProcessing={iniciarMut.isPending || concluirMut.isPending || reatribuirMut.isPending}
                    onIniciar={(id) => iniciarMut.mutate(id)}
                    onConcluir={(id) => { 
                      concluirMut.mutate(id);
                      // Se houver mais itens no grupo, não fechar, apenas atualizar
                    }}
                    onReatribuir={(id, ant) => reatribuirMut.mutate({ id, responsavel_anterior_id: ant })}
                  />
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
