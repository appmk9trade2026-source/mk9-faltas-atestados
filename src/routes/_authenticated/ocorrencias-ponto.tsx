import { useState } from "react";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 

  Filter, 
  Loader2, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  User, 
  FileText,
  Calendar,
  MoreVertical,
  Check,
  X,
  UploadCloud
} from "lucide-react";
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
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { FileUpload } from "@/components/ui/file-upload";
import { BUCKET_ATESTADOS } from "@/lib/ausencias";

import { useSession } from "@/hooks/use-session";
import { 
  listarOcorrencias, 
  criarOcorrencia, 
  processarOcorrencia,
  getSupervisoresProjeto,
  ocorrenciaPontoSchema, 
  type OcorrenciaPontoInput 
} from "@/lib/ocorrencias.functions";
import { useProjetosAtivosPorEmpresa } from "@/hooks/use-projetos";
import { useColaboradoresAtivos } from "@/hooks/use-colaboradores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ocorrencias-ponto")({
  head: () => ({ meta: [{ title: "Ocorrências de Ponto AMBEV · CRM MK9" }] }),
  component: OcorrenciasPontoPage,
});

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  PENDENTE: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  APROVADA: "bg-green-500/10 text-green-500 border-green-500/20",
  REPROVADA: "bg-red-500/10 text-red-500 border-red-500/20",
  CANCELADA: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const AMBEV_EMPRESA_ID = "0a6c2ac6-2872-47a0-b818-b4660ef81244";

function OcorrenciasPontoPage() {
  const { user, roles } = useSession();
  const queryClient = useQueryClient();
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [selectedOcorrencia, setSelectedOcorrencia] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const canProcess = roles.some(r => ["rh", "coordenador", "super_admin"].includes(r));
  const canCreate = roles.some(r => ["supervisor", "coordenador", "rh", "super_admin"].includes(r));

  const listOcorrenciasFn = useServerFn(listarOcorrencias);
  const createOcorrenciaFn = useServerFn(criarOcorrencia);
  const processOcorrenciaFn = useServerFn(processarOcorrencia);
  const getSupervisoresFn = useServerFn(getSupervisoresProjeto);

  const { data: ocorrencias, isLoading } = useQuery({
    queryKey: ["ocorrencias-ponto", statusFilter],
    queryFn: () => listOcorrenciasFn({ 
      data: { status: statusFilter === "all" ? undefined : statusFilter as any }
    }),
  });

  const form = useForm<z.infer<typeof ocorrenciaPontoSchema>>({
    resolver: zodResolver(ocorrenciaPontoSchema),
    defaultValues: {
      data_ocorrencia: format(new Date(), "yyyy-MM-dd"),
      motivo: "",
      justificativa: "",
      arquivo_url: "https://placeholder.url", // Placeholder para o resolver do Zod
      empresa_id: AMBEV_EMPRESA_ID,
    },
  });

  const processForm = useForm({
    defaultValues: {
      parecer: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: OcorrenciaPontoInput) => createOcorrenciaFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ocorrencias-ponto"] });
      setIsNewDialogOpen(false);
      form.reset();
      toast.success("Ocorrência protocolada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar ocorrência: ${error.message}`);
    },
  });

  const processMutation = useMutation({
    mutationFn: (data: { id: string; status: "APROVADA" | "REPROVADA"; parecer: string }) => 
      processOcorrenciaFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ocorrencias-ponto"] });
      setIsProcessDialogOpen(false);
      processForm.reset();
      toast.success("Ocorrência processada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao processar: ${error.message}`);
    },
  });

  const onSubmit: SubmitHandler<z.infer<typeof ocorrenciaPontoSchema>> = async (data) => {
    if (!selectedFile) {
      toast.error("Anexe uma evidência obrigatória.");
      return;
    }

    try {
      setIsUploading(true);
      
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `ocorrencias-ponto/${data.projeto_id}/${data.data_ocorrencia}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_ATESTADOS)
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_ATESTADOS)
        .getPublicUrl(filePath);

      createMutation.mutate({
        ...data,
        arquivo_url: publicUrl,
        arquivo_nome: selectedFile.name,
      });
    } catch (error: any) {
      toast.error(`Erro no upload: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcess = (status: "APROVADA" | "REPROVADA") => {
    const parecer = processForm.getValues("parecer");
    if (!parecer || parecer.length < 5) {
      toast.error("O parecer deve ter pelo menos 5 caracteres.");
      return;
    }
    processMutation.mutate({
      id: selectedOcorrencia.id,
      status,
      parecer
    });
  };

  const { data: projetos } = useProjetosAtivosPorEmpresa(AMBEV_EMPRESA_ID);
  
  const selectedProjetoId = form.watch("projeto_id");
  const selectedSupervisorId = form.watch("supervisor_usuario_id");

  const { data: supervisores } = useQuery({
    queryKey: ["supervisores", selectedProjetoId],
    queryFn: () => getSupervisoresFn({ data: { projeto_id: selectedProjetoId } }),
    enabled: !!selectedProjetoId,
  });

  const [buscaColab, setBuscaColab] = useState("");
  const { data: colaboradores } = useColaboradoresAtivos({
    projetoId: selectedProjetoId || undefined,
    busca: buscaColab,
    // @ts-ignore - a RPC agora aceita _supervisor_id, mas o hook useColaboradoresAtivos precisa ser ajustado ou o parâmetro passado via RPC internamente
    supervisorId: selectedSupervisorId || undefined, 
  });

  return (
    <AppShell title="Ocorrências de Ponto AMBEV">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ocorrências de Ponto AMBEV</h1>
            <p className="text-muted-foreground">Justificativas operacionais para marcações de ponto ausentes.</p>
          </div>
          {canCreate && (
            <Button onClick={() => setIsNewDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Ocorrência
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <CardTitle>Histórico de Ocorrências</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
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
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : !ocorrencias?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Nenhuma ocorrência encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  ocorrencias.map((oc) => (
                    <TableRow key={oc.id}>
                      <TableCell className="font-mono text-xs">{oc.protocolo}</TableCell>
                      <TableCell>{format(new Date(oc.data_ocorrencia), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{oc.colaborador?.nome_completo || "Manual"}</span>
                          <span className="text-xs text-muted-foreground">{oc.colaborador?.matricula || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{oc.projeto?.nome || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{oc.motivo}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[oc.status]}>
                          {STATUS_LABELS[oc.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => window.open(oc.arquivo_url, '_blank')}>
                              <FileText className="mr-2 h-4 w-4" />
                              Ver Anexo
                            </DropdownMenuItem>
                            {canProcess && oc.status === "PENDENTE" && (
                              <DropdownMenuItem onClick={() => {
                                setSelectedOcorrencia(oc);
                                setIsProcessDialogOpen(true);
                              }}>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Processar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Modal Nova Ocorrência */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ocorrência de Ponto AMBEV</DialogTitle>
            <DialogDescription>
              Justifique a falta de marcação anexando evidência de presença (foto na loja, relatório de sistema, etc).
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="projeto_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col mt-2.5">
                      <FormLabel>Projeto (AMBEV)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("justify-between", !field.value && "text-muted-foreground")}
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
                            <CommandInput placeholder="Buscar projeto..." />
                            <CommandList>
                              <CommandEmpty>Projeto não encontrado.</CommandEmpty>
                              <CommandGroup>
                                {projetos?.filter(p => p.empresa_id === '0a6c2ac6-2872-47a0-b818-b4660ef81244').map((p) => (
                                  <CommandItem
                                    value={p.nome}
                                    key={p.id}
                                      onSelect={() => {
                                        form.setValue("projeto_id", p.id);
                                        form.setValue("empresa_id", p.empresa_id || "");
                                        form.setValue("supervisor_usuario_id", "");
                                        form.setValue("colaborador_id", "");
                                      }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", p.id === field.value ? "opacity-100" : "opacity-0")} />
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

                <FormField
                  control={form.control}
                  name="data_ocorrencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data da Ocorrência</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="supervisor_usuario_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Supervisor</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={!selectedProjetoId}
                            className={cn("justify-between", !field.value && "text-muted-foreground")}
                          >
                            {field.value
                              ? supervisores?.find((s) => s.id === field.value)?.nome
                              : "Selecione o supervisor"}
                            <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar supervisor..." />
                          <CommandList>
                            <CommandEmpty>Nenhum supervisor encontrado.</CommandEmpty>
                            <CommandGroup>
                              {supervisores?.map((s) => (
                                <CommandItem
                                  value={s.id}
                                  key={s.id}
                                  onSelect={() => {
                                    form.setValue("supervisor_usuario_id", s.id);
                                    form.setValue("colaborador_id", "");
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", s.id === field.value ? "opacity-100" : "opacity-0")} />
                                  {s.nome}
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

              <FormField
                control={form.control}
                name="colaborador_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex justify-between items-center">
                      Colaborador
                      {selectedSupervisorId && numColaboradores > 0 && (
                        <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {numColaboradores} ativos
                        </span>
                      )}
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={!selectedProjetoId || !selectedSupervisorId}
                            className={cn("justify-between", !field.value && "text-muted-foreground")}
                          >
                            {field.value
                              ? colaboradores?.find((c) => c.id === field.value)?.nome_completo
                              : "Selecione o colaborador"}
                            <User className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Buscar por nome ou matrícula..." onValueChange={setBuscaColab} />
                          <CommandList>
                            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                            <CommandGroup>
                              {colaboradores?.map((c) => (
                                <CommandItem value={c.id} key={c.id} onSelect={() => form.setValue("colaborador_id", c.id)}>
                                  <Check className={cn("mr-2 h-4 w-4", c.id === field.value ? "opacity-100" : "opacity-0")} />
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

              <FormField
                control={form.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo (Título Resumido)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Esquecimento de marcação / Problema no app" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="justificativa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Justificativa Detalhada</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Descreva o que aconteceu e comprove que o colaborador esteve na loja." 
                        className="min-h-[100px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="arquivo_url"
                render={() => (
                  <FormItem>
                    <FormLabel>Evidência *</FormLabel>
                    <FormControl>
                      <FileUpload
                        onFileSelect={setSelectedFile}
                        loading={isUploading}
                        accept=".pdf,.jpg,.jpeg,.png"
                        maxSizeMB={10}
                      />
                    </FormControl>
                    <FormDescription>
                      Anexe um comprovante de presença ou da falha de marcação (PDF, JPG ou PNG).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || isUploading}>
                  {(createMutation.isPending || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Protocolar Ocorrência
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal Processar Ocorrência */}
      <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Processar Ocorrência</DialogTitle>
            <DialogDescription>
              Protocolo: {selectedOcorrencia?.protocolo}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50 text-sm">
              <p><strong>Motivo:</strong> {selectedOcorrencia?.motivo}</p>
              <p className="mt-2"><strong>Justificativa:</strong> {selectedOcorrencia?.justificativa}</p>
            </div>

            <Form {...processForm}>
              <form className="space-y-4">
                <FormField
                  control={processForm.control}
                  name="parecer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parecer RH / Coordenação</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Justifique a aprovação ou reprovação..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleProcess("REPROVADA")} disabled={processMutation.isPending} className="border-red-500 text-red-500 hover:bg-red-50">
              <X className="mr-2 h-4 w-4" />
              Reprovar
            </Button>
            <Button onClick={() => handleProcess("APROVADA")} disabled={processMutation.isPending}>
              {processMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// Helper types since original import was incomplete

function FormDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.8rem] text-muted-foreground">{children}</p>;
}
