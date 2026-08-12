import { useState } from "react";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Plus, Filter, Loader2, Clock, CheckCircle2, AlertTriangle, Building2, User, Users, ChevronRight, MoreVertical, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";

import { useSession } from "@/hooks/use-session";
import { 
  listarPlanosAcao, 
  criarPlanoAcao, 
  planoAcaoSchema, 
  type PlanoAcaoInput,
  obterPlanoAcao,
  listarAcompanhamentos,
  registrarAcompanhamento,
  concluirPlano,
  analisarAndamentoIA
} from "@/lib/planos-acao.functions";

import { gerarSugestaoPlanoAcao, gerarResumoGerencialIA } from "@/lib/planos-acao-ia.functions";

import { useProjetosAtivosPorEmpresa } from "@/hooks/use-projetos";
import { useSupervisoresPorProjeto } from "@/hooks/use-supervisores";
import { useColaboradoresAtivos } from "@/hooks/use-colaboradores";
import { cn } from "@/lib/utils";
import { useCoordenadoresPorProjeto } from "@/hooks/use-coordenadores";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";


export const Route = createFileRoute("/_authenticated/planos-acao")({
  head: () => ({ meta: [{ title: "Planos de Ação · CRM MK9" }] }),
  component: PlanosAcaoPage,
});

const STATUS_LABELS: Record<string, string> = {
  NAO_INICIADO: "Não Iniciado",
  EM_ANDAMENTO: "Em Andamento",
  SUSPENSO: "Suspenso",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

function PlanosAcaoPage() {
  const { user, roles } = useSession();
  const queryClient = useQueryClient();
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const [selectedPlanoId, setSelectedPlanoId] = useState<string | null>(null);

  const isCoordenador = roles.includes("coordenador") || roles.includes("super_admin") || roles.includes("rh");

  const listPlanosFn = useServerFn(listarPlanosAcao);
  const createPlanoFn = useServerFn(criarPlanoAcao);

  const { data: planos, isLoading } = useQuery({
    queryKey: ["planos-acao", statusFilter],
    queryFn: () => listPlanosFn({ 
      data: { status: statusFilter === "all" ? undefined : statusFilter as any }
    }),
  });

  const form = useForm<z.infer<typeof planoAcaoSchema>>({
    resolver: zodResolver(planoAcaoSchema),
    defaultValues: {
      tipo_alvo: "PROJETO",
      titulo: "",
      problema_identificado: "",
      meta: "",
      indicador_sucesso: "",
      acao_proposta: "",
      status: "NAO_INICIADO",
      prioridade: "MEDIA",
      data_inicio: new Date().toISOString().split("T")[0],
      prazo: new Date().toISOString().split("T")[0],
      projeto_id: "" as any,
      supervisor_usuario_id: null,
      colaborador_id: null,
      responsavel_tipo: "USUARIO",
      responsavel_usuario_id: user?.id || undefined,
      responsavel_coordenacao_id: null,
    },
  });


  const generateAIFn = useServerFn(gerarSugestaoPlanoAcao);
  const summarizeAIFn = useServerFn(gerarResumoGerencialIA);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSummarizingAI, setIsSummarizingAI] = useState(false);
  const [resumoGerencial, setResumoGerencial] = useState<string | null>(null);

  const handleSummarizeAI = async () => {
    if (!planos || planos.length === 0) return;
    setIsSummarizingAI(true);
    try {
      const res = await summarizeAIFn({ data: { planos } });
      setResumoGerencial(res);
      toast.success("Resumo gerencial gerado!");
    } catch (e: any) {
      toast.error("Erro ao gerar resumo");
    } finally {
      setIsSummarizingAI(false);
    }
  };


  const { data: coordenadores } = useCoordenadoresPorProjeto(form.watch("projeto_id"));

  const handleGenerateAI = async () => {
    const tipoAlvo = form.getValues("tipo_alvo");
    const projetoId = form.getValues("projeto_id");
    const supervisorId = form.getValues("supervisor_usuario_id");
    const colaboradorId = form.getValues("colaborador_id");
    const problema = form.getValues("problema_identificado") || "";
    
    // Validação A: Projeto
    if (!projetoId || (typeof projetoId === "string" && projetoId.trim() === "")) {
      toast.error("Selecione um projeto para gerar sugestões com IA.");
      return;
    }

    // Validação de Hierarquia baseada no Tipo de Alvo
    if (tipoAlvo === "SUPERVISOR" && !supervisorId) {
      toast.error("Selecione um supervisor para gerar a análise contextual.");
      return;
    }

    if (tipoAlvo === "COLABORADOR") {
      if (!supervisorId) {
        toast.error("Selecione um supervisor para gerar a análise contextual.");
        return;
      }
      if (!colaboradorId) {
        toast.error("Selecione um colaborador para gerar a análise contextual.");
        return;
      }
    }

    // Validação B: Problema
    if (problema.trim().length < 5) {
      toast.error("Descreva o problema com pelo menos 5 caracteres para gerar sugestões com IA.");
      return;
    }

    setIsGeneratingAI(true);
    try {

      const res = await generateAIFn({
        data: {
          tipo_alvo: tipoAlvo,
          projeto_id: projetoId,
          supervisor_usuario_id: supervisorId,
          colaborador_id: colaboradorId,
          problema_identificado: problema
        }
      });

      if (res.titulo) form.setValue("titulo", res.titulo);
      if (res.meta) form.setValue("meta", res.meta);
      if (res.indicador_sucesso) form.setValue("indicador_sucesso", res.indicador_sucesso);
      if (res.acao_proposta) form.setValue("acao_proposta", res.acao_proposta);

      if (res.prazo_sugerido_dias) {
        const d = new Date();
        d.setDate(d.getDate() + res.prazo_sugerido_dias);
        form.setValue("prazo", d.toISOString().split("T")[0]);
      }
      
      toast.success("Sugestão da IA aplicada com sucesso!");
    } catch (e: any) {
      toast.error(`Erro ao gerar sugestão: ${e.message}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const mutation = useMutation({
    mutationFn: (data: PlanoAcaoInput) => createPlanoFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-acao"] });
      setIsNewDialogOpen(false);
      form.reset();
      toast.success("Plano de Ação criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar plano: ${error.message}`);
    },
  });

  const onSubmit: SubmitHandler<z.infer<typeof planoAcaoSchema>> = (data) => {
    if (new Date(data.prazo) < new Date(data.data_inicio)) {
      toast.error("O prazo final não pode ser anterior à data de início.");
      return;
    }
    mutation.mutate(data);
  };

  const kpis = {
    ativos: planos?.filter((p: any) => ["NAO_INICIADO", "EM_ANDAMENTO"].includes(p.status)).length || 0,
    atrasados: planos?.filter((p: any) => p.situacao === "ATRASADO").length || 0,
    atencao: planos?.filter((p: any) => p.situacao === "ATENCAO").length || 0,
    sem_acompanhamento: planos?.filter((p: any) => p.situacao === "SEM_ACOMPANHAMENTO").length || 0,
    concluidos: planos?.filter((p: any) => p.status === "CONCLUIDO").length || 0,
  };


  const empresaId = user?.user_metadata?.empresa_id || "0a6c2ac6-2872-47a0-b818-b4660ef81244"; 
  
  const { data: projetos } = useProjetosAtivosPorEmpresa(empresaId);
  const [buscaColab, setBuscaColab] = useState("");
  const selectedProjetoId = form.watch("projeto_id");
  const selectedSupervisorId = form.watch("supervisor_usuario_id");
  
  const { data: supervisores, isLoading: isLoadingSupervisores } = useSupervisoresPorProjeto(selectedProjetoId);
  
  const { data: colaboradores, isLoading: isLoadingColaboradores } = useColaboradoresAtivos({
    empresaId,
    projetoId: selectedProjetoId || null,
    supervisorId: selectedSupervisorId || null,
    busca: buscaColab,
  });

  const isUserSupervisor = roles.includes("supervisor") && !roles.includes("super_admin") && !roles.includes("coordenador");
  
  useState(() => {
    if (isUserSupervisor && user?.id) {
      form.setValue("supervisor_usuario_id", user.id);
    }
  });

  const tipoAlvo = form.watch("tipo_alvo");

  return (
    <AppShell title="Plano de Ação Gerencial">
      <div className="space-y-6">

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Plano de Ação Gerencial</h1>
            <p className="text-muted-foreground">Acompanhe ações para melhoria dos indicadores operacionais.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSummarizeAI} disabled={isSummarizingAI || !planos?.length}>
              {isSummarizingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Gerar Resumo IA
            </Button>
            {isCoordenador && (
              <Button onClick={() => {
                form.reset();
                setIsNewDialogOpen(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Plano de Ação
              </Button>
            )}

          </div>

        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Ativos</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.ativos}</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase text-red-600">Atrasados</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">{kpis.atrasados}</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase text-amber-600">Em Atenção</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700">{kpis.atencao}</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50/30">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase text-yellow-600">Sem Acomp.</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700">{kpis.sem_acompanhamento}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Concluídos</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.concluidos}</div>
            </CardContent>
          </Card>
        </div>


        {resumoGerencial && (
          <Card className="bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-top-2 duration-300 relative">
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 h-6 w-6" 
              onClick={() => setResumoGerencial(null)}
            >
              <Plus className="h-4 w-4 rotate-45" />
            </Button>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-primary">Resumo Gerencial da Equipe</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{resumoGerencial}</p>
                </div>
              </div>
            </CardContent>
          </Card>

        )}

        <Card>

          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>Listagem de Planos</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Filtrar por Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : !planos?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Nenhum plano de ação encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...planos].sort((a: any, b: any) => {
                    const order: Record<string, number> = { 
                      "ATRASADO": 1, 
                      "ATENCAO": 2, 
                      "SEM_ACOMPANHAMENTO": 3, 
                      "NO_PRAZO": 4, 
                      "CONCLUIDO_SUCESSO": 5, 
                      "CONCLUIDO_PARCIAL": 6, 
                      "CONCLUIDO_ERRO": 7, 
                      "CANCELADO": 8 
                    };
                    return (order[a.situacao] || 9) - (order[b.situacao] || 9);
                  }).map((plano) => (

                    <TableRow key={plano.id}>
                      <TableCell className="font-medium">{plano.titulo}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{plano.tipo_alvo}</Badge>
                      </TableCell>
                      <TableCell>{(plano as any).projeto?.nome || "-"}</TableCell>
                      <TableCell>
                         <div className="text-xs text-muted-foreground">
                            {(plano as any).supervisor?.nome ? `S: ${(plano as any).supervisor.nome}` : ''}
                            {(plano as any).colaborador?.nome_completo ? ` | C: ${(plano as any).colaborador.nome_completo}` : ''}
                         </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {plano.responsavel_tipo === "USUARIO" ? (
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {(plano as any).responsavel_usuario?.nome || "-"}</span>
                          ) : (
                            <span className="flex items-center gap-1 font-semibold text-primary"><Users className="h-3 w-3" /> {(plano as any).responsavel_coordenacao?.nome || "Coordenação"}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="w-[150px]">
                          <div className="flex items-center gap-2">
                             <Progress value={plano.progresso} className="h-2" />
                             <span className="text-xs font-medium">{plano.progresso}%</span>
                          </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          plano.situacao === "ATRASADO" ? "bg-red-100 text-red-800" :
                          plano.situacao === "ATENCAO" ? "bg-amber-100 text-amber-800" :
                          plano.situacao === "SEM_ACOMPANHAMENTO" ? "bg-yellow-100 text-yellow-800" :
                          plano.situacao === "CANCELADO" ? "bg-gray-100 text-gray-800" :
                          "bg-green-100 text-green-800"
                        }>
                          {plano.situacao?.replace("_", " ") || "NO PRAZO"}
                        </Badge>


                      </TableCell>
                      <TableCell>
                         <Button variant="ghost" size="sm" onClick={() => setSelectedPlanoId(plano.id)}>
                            Ver detalhes
                         </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Plano de Ação Gerencial</DialogTitle>
          </DialogHeader>
          <Form {...form}>
             <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField
                   control={form.control}
                   name="tipo_alvo"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Tipo de Alvo</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                         <FormControl>
                           <SelectTrigger>
                             <SelectValue placeholder="Selecione o alvo" />
                           </SelectTrigger>
                         </FormControl>
                         <SelectContent>
                           <SelectItem value="PROJETO">Projeto</SelectItem>
                           <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                           <SelectItem value="COLABORADOR">Colaborador</SelectItem>
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 <FormField
                   control={form.control}
                   name="projeto_id"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Projeto</FormLabel>
                       <Select 
                         onValueChange={(val) => {
                           field.onChange(val);
                           form.setValue("supervisor_usuario_id", null);
                           form.setValue("colaborador_id", null);
                         }} 
                         value={field.value}
                       >
                         <FormControl>
                           <SelectTrigger>
                             <SelectValue placeholder="Selecione o projeto" />
                           </SelectTrigger>
                         </FormControl>
                         <SelectContent>
                           {projetos?.map(p => (
                             <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 {(tipoAlvo === "SUPERVISOR" || tipoAlvo === "COLABORADOR") && (
                   <FormField
                     control={form.control}
                     name="supervisor_usuario_id"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Supervisor</FormLabel>
                         <Select 
                           onValueChange={(val) => {
                             field.onChange(val);
                             form.setValue("colaborador_id", null);
                           }} 
                           value={field.value || ""}
                           disabled={isLoadingSupervisores || isUserSupervisor}
                         >
                           <FormControl>
                             <SelectTrigger>
                               <SelectValue placeholder="Selecione o supervisor" />
                             </SelectTrigger>
                           </FormControl>
                           <SelectContent>
                             {supervisores?.map(s => (
                               <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                 )}

                 {tipoAlvo === "COLABORADOR" && (
                   <FormField
                     control={form.control}
                     name="colaborador_id"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Colaborador</FormLabel>
                         <Select onValueChange={field.onChange} value={field.value || ""}>
                           <FormControl>
                             <SelectTrigger>
                               <SelectValue placeholder="Selecione o colaborador" />
                             </SelectTrigger>
                         </FormControl>
                         <SelectContent>
                           <div className="p-2">
                             <Input 
                               placeholder="Filtrar colaboradores..." 
                               value={buscaColab} 
                               onChange={(e) => setBuscaColab(e.target.value)}
                               className="h-8 mb-2"
                             />
                           </div>
                           {isLoadingColaboradores ? (
                             <div className="p-2 text-center text-xs text-muted-foreground">Carregando...</div>
                           ) : colaboradores?.length === 0 ? (
                             <div className="p-2 text-center text-xs text-muted-foreground">Nenhum encontrado</div>
                           ) : (
                             colaboradores?.map(c => (
                               <SelectItem key={c.id} value={c.id}>{c.nome_completo} ({c.matricula})</SelectItem>
                             ))
                           )}
                         </SelectContent>
                       </Select>
                       <FormMessage />
                     </FormItem>
                    )}
                  />
                 )}
               </div>


               <FormField
                 control={form.control}
                 name="titulo"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Título do Plano</FormLabel>
                     <FormControl>
                       <Input placeholder="Ex: Redução de absenteísmo na Loja X" {...field} />
                     </FormControl>
                     <FormMessage />
                   </FormItem>
                 )}
               />

               <div className="space-y-4">
                 <FormField
                   control={form.control}
                   name="problema_identificado"
                   render={({ field }) => (
                     <FormItem>
                       <div className="flex items-center justify-between">
                         <FormLabel>Problema Identificado</FormLabel>
                         <Button 
                           type="button" 
                           variant="ghost" 
                           size="sm" 
                           className="h-7 text-xs text-primary"
                           onClick={handleGenerateAI}
                           disabled={isGeneratingAI}
                         >
                           {isGeneratingAI ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                           Sugerir com IA
                         </Button>
                       </div>
                       <FormControl>
                         <Textarea placeholder="Descreva o problema observado..." {...field} />
                       </FormControl>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <FormField
                     control={form.control}
                     name="meta"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Meta a Alcançar</FormLabel>
                         <FormControl>
                           <Textarea placeholder="Ex: Reduzir faltas em 10%..." {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                   <FormField
                     control={form.control}
                     name="acao_proposta"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Ações Propostas</FormLabel>
                         <FormControl>
                           <Textarea placeholder="Liste as ações necessárias..." {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <FormField
                     control={form.control}
                     name="indicador_sucesso"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Indicador de Sucesso</FormLabel>
                         <FormControl>
                           <Input placeholder="Ex: % de absenteísmo mensal" {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                   
                   <FormField
                     control={form.control}
                     name="prioridade"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Prioridade</FormLabel>
                         <Select onValueChange={field.onChange} defaultValue={field.value}>
                           <FormControl>
                             <SelectTrigger>
                               <SelectValue placeholder="Selecione" />
                             </SelectTrigger>
                           </FormControl>
                           <SelectContent>
                             {Object.entries(PRIORIDADE_LABELS).map(([val, label]) => (
                               <SelectItem key={val} value={val}>{label}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <FormField
                     control={form.control}
                     name="status"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Status</FormLabel>
                         <Select onValueChange={field.onChange} defaultValue={field.value}>
                           <FormControl>
                             <SelectTrigger>
                               <SelectValue placeholder="Status" />
                             </SelectTrigger>
                           </FormControl>
                           <SelectContent>
                             {Object.entries(STATUS_LABELS).map(([val, label]) => (
                               <SelectItem key={val} value={val}>{label}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                   
                   <FormField
                     control={form.control}
                     name="data_inicio"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Data de Início</FormLabel>
                         <FormControl>
                           <Input type="date" {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />

                   <FormField
                     control={form.control}
                     name="prazo"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Prazo Final</FormLabel>
                         <FormControl>
                           <Input type="date" {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                 </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="responsavel_tipo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Responsável</FormLabel>
                          <Select 
                            onValueChange={(val) => {
                              field.onChange(val);
                              form.setValue("responsavel_usuario_id", undefined);
                              form.setValue("responsavel_coordenacao_id", null);
                            }} 
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USUARIO">Pessoa (Individual)</SelectItem>
                              <SelectItem value="COORDENACAO">Coordenação do Projeto</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch("responsavel_tipo") === "USUARIO" ? (
                      <FormField
                        control={form.control}
                        name="responsavel_usuario_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pessoa Responsável</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a pessoa" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={user?.id || "myself"}>{user?.user_metadata?.nome || "Eu mesmo"}</SelectItem>
                                {supervisores?.map(s => (
                                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="responsavel_coordenacao_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Coordenação Responsável</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a coordenação" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {coordenadores?.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                ))}
                                {(!coordenadores || coordenadores.length === 0) && (
                                  <SelectItem value="none" disabled>Nenhuma coordenação encontrada</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

               </div>


               <div className="flex justify-end pt-4">
                  <Button type="submit">Criar Plano</Button>
               </div>
             </form>
          </Form>
        </DialogContent>
      </Dialog>


      
      {/* Detalhe Sheet Placeholder */}
      <Sheet open={!!selectedPlanoId} onOpenChange={() => setSelectedPlanoId(null)}>
         <SheetContent className="w-[400px] sm:w-[540px]">
             <SheetHeader>
                 <SheetTitle>Detalhes do Plano</SheetTitle>
             </SheetHeader>
             <div className="mt-6">
                {selectedPlanoId && <PlanoDetalhe planoId={selectedPlanoId} onClose={() => setSelectedPlanoId(null)} />}
             </div>
          </SheetContent>
        </Sheet>
      </div>

    </AppShell>
  );
}

function PlanoDetalhe({ planoId, onClose }: { planoId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const getPlanoFn = useServerFn(obterPlanoAcao);
  const listCheckinsFn = useServerFn(listarAcompanhamentos);
  const addCheckinFn = useServerFn(registrarAcompanhamento);
  const concluirFn = useServerFn(concluirPlano);
  const analisarIAFn = useServerFn(analisarAndamentoIA);

  const { data: plano, isLoading } = useQuery({
    queryKey: ["plano-acao", planoId],
    queryFn: () => getPlanoFn({ data: { id: planoId } }),
  });

  const { data: checkins, isLoading: isLoadingCheckins } = useQuery({
    queryKey: ["plano-acao-acompanhamentos", planoId],
    queryFn: () => listCheckinsFn({ data: { plano_id: planoId } }),
  });

  const [isCheckinDialogOpen, setIsCheckinDialogOpen] = useState(false);
  const [isConcluirDialogOpen, setIsConcluirDialogOpen] = useState(false);
  const [isAnalysingIA, setIsAnalysingIA] = useState(false);
  const [iaAnalysis, setIaAnalysis] = useState<any>(null);

  const checkinForm = useForm({
    defaultValues: {
      progresso: plano?.progresso ?? 0,
      observacao: "",
    },
  });

  const concluirForm = useForm({
    defaultValues: {
      resultado_alcancado: "SIM" as "SIM" | "PARCIAL" | "NAO",
      parecer_final: "",
    },
  });

  const checkinMutation = useMutation({
    mutationFn: (data: { progresso: number; observacao: string }) => 
      addCheckinFn({ data: { plano_id: planoId, ...data } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plano-acao", planoId] });
      queryClient.invalidateQueries({ queryKey: ["plano-acao-acompanhamentos", planoId] });
      queryClient.invalidateQueries({ queryKey: ["planos-acao"] });
      setIsCheckinDialogOpen(false);
      checkinForm.reset();
      toast.success("Acompanhamento registrado!");
    },
  });

  const concluirMutation = useMutation({
    mutationFn: (data: any) => concluirFn({ data: { id: planoId, ...data } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plano-acao", planoId] });
      queryClient.invalidateQueries({ queryKey: ["planos-acao"] });
      setIsConcluirDialogOpen(false);
      toast.success("Plano concluído com sucesso!");
    },
  });

  const handleAnalyseIA = async () => {
    setIsAnalysingIA(true);
    try {
      const res = await analisarIAFn({ data: { plano_id: planoId } });
      setIaAnalysis(res);
    } catch (e: any) {
      toast.error("Erro na análise IA");
    } finally {
      setIsAnalysingIA(false);
    }
  };


  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  if (!plano) return <div>Plano não encontrado.</div>;


  const getSituacaoColor = (situacao: string) => {
    switch (situacao) {
      case "ATRASADO": return "bg-red-500";
      case "ATENCAO": return "bg-amber-500";
      case "SEM_ACOMPANHAMENTO": return "bg-yellow-500";
      case "CONCLUIDO_SUCESSO": return "bg-green-600";
      case "CONCLUIDO_PARCIAL": return "bg-blue-500";
      case "CONCLUIDO_ERRO": return "bg-red-400";
      case "CANCELADO": return "bg-gray-500";
      default: return "bg-green-500";
    }
  };

  const situacao = { 
    label: plano.situacao?.replace("_", " ") || "NO PRAZO", 
    color: getSituacaoColor(plano.situacao) 
  };


  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <Badge className={situacao.color}>{situacao.label}</Badge>
        <Badge variant="outline">{PRIORIDADE_LABELS[plano.prioridade]}</Badge>
      </div>

      <div>
        <h2 className="text-xl font-bold">{plano.titulo}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" /> {plano.projeto?.nome}
          {plano.supervisor?.nome && <><ChevronRight className="h-3 w-3" /> <Users className="h-4 w-4" /> {plano.supervisor.nome}</>}
          {plano.colaborador?.nome_completo && <><ChevronRight className="h-3 w-3" /> <User className="h-4 w-4" /> {plano.colaborador.nome_completo}</>}
          
          <div className="flex items-center gap-1 ml-auto border-l pl-2">
            <span className="font-semibold text-xs uppercase text-primary/70">Responsável:</span>
            {plano.responsavel_tipo === "USUARIO" ? (
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {(plano as any).responsavel_usuario?.nome}</span>
            ) : (
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Coordenação: {(plano as any).responsavel_coordenacao?.nome}</span>
            )}

          </div>
        </div>

      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progresso Atual</span>
            <span className="text-lg font-bold">{plano.progresso}%</span>
          </div>
          <Progress value={plano.progresso} className="h-3" />
          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
            <span>Início: {format(new Date(plano.data_inicio), 'dd/MM/yyyy')}</span>
            <span>Prazo: {format(new Date(plano.prazo), 'dd/MM/yyyy')}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Objetivo</h3>
          <div className="bg-muted/30 p-4 rounded-lg space-y-3">
             <p className="text-sm"><strong>Problema:</strong> {plano.problema_identificado}</p>
             <p className="text-sm"><strong>Meta:</strong> {plano.meta}</p>
             <p className="text-sm"><strong>Indicador de Sucesso:</strong> {plano.indicador_sucesso}</p>
             <p className="text-sm"><strong>Ação Proposta:</strong> {plano.acao_proposta}</p>
          </div>
        </div>
      </div>

      {plano.status === "CONCLUIDO" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fechamento</h3>
          <div className="bg-green-50 border border-green-100 p-4 rounded-lg space-y-2">
            <p className="text-sm"><strong>Resultado:</strong> {plano.resultado_alcancado}</p>
            <p className="text-sm"><strong>Parecer Final:</strong> {plano.parecer_final}</p>
          </div>
        </div>
      )}


      <div className="flex flex-wrap gap-2">
        {plano.status !== "CONCLUIDO" && plano.status !== "CANCELADO" && (
          <Button size="sm" onClick={() => {
            checkinForm.setValue("progresso", plano.progresso ?? 0);
            setIsCheckinDialogOpen(true);
          }}>
            Registrar Acompanhamento
          </Button>
        )}

        {plano.status !== "CONCLUIDO" && plano.status !== "CANCELADO" && (
          <Button size="sm" variant="outline" onClick={() => setIsConcluirDialogOpen(true)}>
            Concluir Plano
          </Button>
        )}

        <Button size="sm" variant="secondary" onClick={handleAnalyseIA} disabled={isAnalysingIA}>
          {isAnalysingIA ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Analisar com IA
        </Button>
      </div>

      {iaAnalysis && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Análise da IA
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>Avaliação:</strong> {iaAnalysis.avaliacao}</p>
            <p><strong>Risco:</strong> <Badge variant="outline">{iaAnalysis.risco}</Badge></p>
            <p><strong>Próximo Passo:</strong> {iaAnalysis.proximo_passo}</p>
            <p><strong>Recomendação:</strong> {iaAnalysis.recomendacao}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="font-bold flex items-center gap-2">
          <Clock className="h-5 w-5" /> Histórico de Acompanhamento
        </h3>
        <div className="space-y-4 border-l-2 border-muted ml-3 pl-6 relative">
          <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-primary border-4 border-background" />
          <div>
            <p className="text-xs text-muted-foreground">{format(new Date(plano.created_at), 'dd/MM/yyyy HH:mm')}</p>
            <p className="text-sm font-semibold">PLANO CRIADO</p>
            <p className="text-xs">Autor: {plano.criador?.nome}</p>
          </div>
          
          {checkins?.map((c: any) => (
            <div key={c.id} className="relative">
              <div className="absolute -left-[33px] top-1 h-4 w-4 rounded-full bg-primary border-4 border-background" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">PROGRESSO {c.progresso}%</span>
                </div>
                <p className="text-sm italic text-muted-foreground">"{c.observacao}"</p>
                <p className="text-[10px]">Autor: {c.criador?.nome}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dialog Checkin */}
      <Dialog open={isCheckinDialogOpen} onOpenChange={setIsCheckinDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Acompanhamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Progresso (%)</label>
              <Input 
                type="number" 
                min="0" max="100" 
                value={checkinForm.watch("progresso")}
                onChange={(e) => checkinForm.setValue("progresso", parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Observação</label>
              <Textarea 
                placeholder="O que foi feito?"
                value={checkinForm.watch("observacao")}
                onChange={(e) => checkinForm.setValue("observacao", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => checkinMutation.mutate(checkinForm.getValues())} disabled={checkinMutation.isPending}>
              Salvar Check-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Concluir */}
      <Dialog open={isConcluirDialogOpen} onOpenChange={setIsConcluirDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Concluir Plano de Ação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Resultado Alcançado?</label>
              <Select 
                value={concluirForm.watch("resultado_alcancado")}
                onValueChange={(v: any) => concluirForm.setValue("resultado_alcancado", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIM">Sim</SelectItem>
                  <SelectItem value="PARCIAL">Parcialmente</SelectItem>
                  <SelectItem value="NAO">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Parecer Final</label>
              <Textarea 
                placeholder="Descreva o resultado final e aprendizados..."
                value={concluirForm.watch("parecer_final")}
                onChange={(e) => concluirForm.setValue("parecer_final", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => concluirMutation.mutate(concluirForm.getValues())} disabled={concluirMutation.isPending}>
              Finalizar Plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


