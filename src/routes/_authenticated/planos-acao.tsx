import { useState } from "react";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Plus, Filter, Loader2, Clock, CheckCircle2, AlertTriangle, Building2, User } from "lucide-react";
import { toast } from "sonner";

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

import { useSession } from "@/hooks/use-session";
import { 
  listarPlanosAcao, 
  criarPlanoAcao, 
  planoAcaoSchema, 
  type PlanoAcaoInput,
} from "@/lib/planos-acao.functions";
import { gerarSugestaoPlanoAcao } from "@/lib/planos-acao-ia.functions";
import { useProjetosAtivosPorEmpresa } from "@/hooks/use-projetos";
import { useColaboradoresAtivos } from "@/hooks/use-colaboradores";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

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
      acao_proposta: "",
      status: "NAO_INICIADO",
      prioridade: "MEDIA",
      data_inicio: new Date().toISOString().split("T")[0],
      prazo: new Date().toISOString().split("T")[0],
      projeto_id: "" as any,
      responsavel_usuario_id: user?.id || "" as any,
    },
  });

  const generateAIFn = useServerFn(gerarSugestaoPlanoAcao);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const handleGenerateAI = async () => {
    const tipoAlvo = form.getValues("tipo_alvo");
    const projetoId = form.getValues("projeto_id");
    const problema = form.getValues("problema_identificado");
    
    if (!projetoId || problema.length < 5) {
      toast.error("Selecione um projeto e descreva o problema (mín. 5 caracteres) para usar a IA.");
      return;
    }

    setIsGeneratingAI(true);
    try {
      const projeto = projetos?.find(p => p.id === projetoId);
      const colaboradorId = form.getValues("colaborador_id");
      const colaborador = colaboradores?.find(c => c.id === colaboradorId);

      const res = await generateAIFn({
        data: {
          tipo_alvo: tipoAlvo,
          projeto_nome: projeto?.nome,
          colaborador_nome: colaborador?.nome_completo,
          problema_identificado: problema
        }
      });

      if (res.problema_revisado) form.setValue("problema_identificado", res.problema_revisado);
      if (res.meta) form.setValue("meta", res.meta);
      if (res.acao_proposta) form.setValue("acao_proposta", res.acao_proposta);
      
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
    mutation.mutate(data);
  };

  const kpis = {
    ativos: planos?.filter((p: any) => ["NAO_INICIADO", "EM_ANDAMENTO"].includes(p.status)).length || 0,
    vencidos: planos?.filter((p: any) => new Date(p.prazo) < new Date() && p.status !== "CONCLUIDO").length || 0,
    concluidos: planos?.filter((p: any) => p.status === "CONCLUIDO").length || 0,
  };

  const empresaId = user?.user_metadata?.empresa_id || AMBEV_EMPRESA_ID; // Fallback para AMBEV se metadata sumir
  
  const { data: projetos } = useProjetosAtivosPorEmpresa(empresaId);
  const [buscaColab, setBuscaColab] = useState("");
  const selectedProjetoId = form.watch("projeto_id");
  const { data: colaboradores } = useColaboradoresAtivos({
    empresaId,
    projetoId: selectedProjetoId || undefined,
    busca: buscaColab,
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
          {isCoordenador && (
            <Button onClick={() => setIsNewDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano de Ação
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Planos Ativos</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.ativos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.vencidos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.concluidos}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <CardTitle>Listagem de Planos</CardTitle>
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
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : !planos?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Nenhum plano de ação encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  planos.map((plano) => (
                    <TableRow key={plano.id}>
                      <TableCell className="font-medium">{plano.titulo}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{plano.tipo_alvo}</Badge>
                      </TableCell>
                      <TableCell>{(plano as any).projeto?.nome || "-"}</TableCell>
                      <TableCell>{(plano as any).responsavel?.nome || "-"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={plano.prioridade === 'CRITICA' ? 'destructive' : 'outline'}
                          className={cn(
                            plano.prioridade === 'ALTA' && "border-orange-500 text-orange-500"
                          )}
                        >
                          {PRIORIDADE_LABELS[plano.prioridade]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{STATUS_LABELS[plano.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          new Date(plano.prazo) < new Date() && plano.status !== 'CONCLUIDO' && "text-destructive font-semibold"
                        )}>
                          {new Date(plano.prazo).toLocaleDateString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Plano de Ação Gerencial</DialogTitle>
            <DialogDescription>
              Preencha os dados abaixo para criar um novo plano de acompanhamento.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipo_alvo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Alvo</FormLabel>
                      <Select onValueChange={(val) => {
                        field.onChange(val);
                        if (val === "PROJETO") form.setValue("colaborador_id", null);
                      }} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o alvo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="PROJETO">Projeto</SelectItem>
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
                    <FormItem className="flex flex-col">
                      <FormLabel>Projeto *</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "justify-between",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value
                                ? projetos?.find((p) => p.id === field.value)?.nome
                                : "Selecione o projeto"}
                              <Building2 className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar projeto por nome..." />
                            <CommandList>
                              <CommandEmpty>Nenhum projeto disponível no seu escopo.</CommandEmpty>
                              <CommandGroup>
                                {projetos?.map((p) => (
                                  <CommandItem
                                    value={p.nome}
                                    key={p.id}
                                    onSelect={() => {
                                      form.setValue("projeto_id", p.id);
                                      form.setValue("colaborador_id", null);
                                    }}
                                  >
                                    <CheckCircle2
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        p.id === field.value ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {p.nome}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {tipoAlvo === "COLABORADOR" && (
                <FormField
                  control={form.control}
                  name="colaborador_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Colaborador</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              disabled={!form.watch("projeto_id")}
                              className={cn(
                                "justify-between",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value
                                ? colaboradores?.find((c) => c.id === field.value)?.nome_completo || "Colaborador selecionado"
                                : form.watch("projeto_id") ? "Selecione o colaborador" : "Selecione um projeto primeiro"}
                              <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput 
                              placeholder="Buscar por nome ou matrícula..." 
                              onValueChange={setBuscaColab}
                            />
                            <CommandList>
                              <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                              <CommandGroup>
                                {colaboradores?.map((c) => (
                                  <CommandItem
                                    value={c.id}
                                    key={c.id}
                                    onSelect={() => form.setValue("colaborador_id", c.id)}
                                  >
                                    <CheckCircle2
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        c.id === field.value ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span>{c.nome_completo}</span>
                                      <span className="text-xs text-muted-foreground">Matrícula: {c.matricula}</span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="titulo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título do Plano *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Redução de Faltas - Projeto X" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Problema Identificado *</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-primary hover:text-primary/80"
                    disabled={isGeneratingAI || !form.watch("projeto_id") || (form.watch("problema_identificado") ?? "").length < 5}
                    onClick={handleGenerateAI}
                  >
                    {isGeneratingAI ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-3 w-3" />
                    )}
                    ✨ Gerar plano com IA
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name="problema_identificado"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea 
                          placeholder="Descreva o problema ou comportamento observado..." 
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-[10px] text-muted-foreground italic">
                  ✨ Sugestão gerada por IA — revise antes de criar o plano.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="meta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meta a Alcançar *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Qual o resultado esperado?" {...field} />
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
                      <FormLabel>Ação Proposta *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="O que será feito?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="prioridade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Prioridade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(PRIORIDADE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="data_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Início *</FormLabel>
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
                      <FormLabel>Prazo Final *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsNewDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Plano
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
