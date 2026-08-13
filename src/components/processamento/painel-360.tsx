import { 
  History, 
  User, 
  FileText, 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Shield, 
  Clock, 
  Building2, 
  ClipboardList,
  MessageSquare,
  FileCheck,
  Zap,
  Info,
  Calendar,
  Phone,
  Mail,
  MoreVertical,
  ExternalLink,
  ChevronDown,
  ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AusenciaCardData } from "./types";
import { getPrioridadeLabel } from "./utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Painel360Props {
  data: AusenciaCardData;
  onIniciar: (id: string) => void;
  onConcluir: (id: string) => void;
  onReatribuir: (id: string, responsavelAnteriorId: string) => void;
  isProcessing: boolean;
  currentUserId: string | undefined;
}

export function Painel360({ 
  data, 
  onIniciar, 
  onConcluir, 
  onReatribuir,
  isProcessing,
  currentUserId 
}: Painel360Props) {
  const prioridade = getPrioridadeLabel(data.prioridade);
  const isOwner = data.responsavel_processamento_id === currentUserId;
  const isAwaiting = data.status_processamento === "AGUARDANDO";
  const isInProgress = data.status_processamento === "EM_PROCESSAMENTO";
  
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const timelineSteps = [
    { 
      id: "REGISTRO", 
      label: "Registrado no Sistema", 
      icon: FileText, 
      date: data.registrado_em, 
      description: data.autor_nome_snapshot 
        ? `Por ${data.autor_nome_snapshot} (${data.autor_papel_snapshot || 'Usuário'})`
        : "Ausência informada via portal/manual" 
    },
    { 
      id: "LANCADO", 
      label: "Lançado no RH", 
      icon: CheckCircle2, 
      date: data.lancado_em, 
      description: data.lancado_por_nome 
        ? `Por ${data.lancado_por_nome}` 
        : "Vínculo com sistema de folha confirmado" 
    },
    { id: "AGUARDANDO", label: "Fila de Processamento", icon: History, date: isAwaiting ? new Date().toISOString() : data.processamento_iniciado_em, description: "Aguardando triagem operacional" },
    { id: "EM_PROCESSAMENTO", label: "Análise Técnica", icon: Activity, date: data.processamento_iniciado_em, description: `Assumido por ${data.responsavel_processamento_nome || 'Operador'}` },
    { id: "PROCESSADO", label: "Concluído", icon: Shield, date: data.processamento_concluido_em, description: "Processamento finalizado e auditado" },
  ];


  const currentStepIndex = data.status_processamento === "PROCESSADO" ? 4 
    : data.status_processamento === "EM_PROCESSAMENTO" ? 3
    : data.status_processamento === "AGUARDANDO" ? 2
    : data.lancado_em ? 1 : 0;

  return (
    <div className="flex flex-col h-full bg-background animate-in slide-in-from-right duration-300">
      {/* Resumo Executivo Removido (integrado ao header do Drawer no pai) ou compactado */}
      <div className="p-5 border-b bg-slate-50/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-tighter bg-white">
              PROT: {data.protocolo || "—"}
            </Badge>
            {data.sla_status === "FORA" && (
              <Badge variant="destructive" className="text-[10px] font-black animate-pulse">
                FORA DO SLA
              </Badge>
            )}
          </div>
          <Badge className={cn("text-[10px] font-black px-2 py-0.5", prioridade.color)}>
            {prioridade.label}
          </Badge>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white border rounded-lg p-2">
            <p className="text-[9px] font-bold text-muted-foreground uppercase leading-none mb-1">Status RH</p>
            <p className="text-[10px] font-black truncate">{data.status_rh || "PENDENTE"}</p>
          </div>
          <div className="bg-white border rounded-lg p-2">
            <p className="text-[9px] font-bold text-muted-foreground uppercase leading-none mb-1">Processamento</p>
            <p className="text-[10px] font-black truncate">{data.status_processamento.replace(/_/g, ' ')}</p>
          </div>
          <div className="bg-white border rounded-lg p-2">
            <p className="text-[9px] font-bold text-muted-foreground uppercase leading-none mb-1">Aguardando</p>
            <p className="text-[10px] font-black truncate">{data.tempo_aguardando} dias</p>
          </div>
          <div className="bg-white border rounded-lg p-2">
            <p className="text-[9px] font-bold text-muted-foreground uppercase leading-none mb-1">Origem</p>
            <p className="text-[10px] font-black truncate">{data.origem_registro || "AUTOMÁTICO"}</p>
          </div>
        </div>

      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          <Accordion type="multiple" defaultValue={["dados-colab", "dados-ausencia", "docs", "interno"]}>
            
            {/* 2. Dados Completos do Colaborador */}
            <AccordionItem value="dados-colab" className="border-none">
              <AccordionTrigger className="hover:no-underline py-2">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <User className="h-3.5 w-3.5" /> DADOS DO COLABORADOR
                </h4>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-dashed">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Projeto</p>
                    <p className="text-xs font-black">{data.projeto_nome}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Empresa</p>
                    <p className="text-xs font-black">{data.empresa_nome}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Supervisor</p>
                    <p className="text-xs font-black truncate">{data.supervisor_nome}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Matrícula</p>
                    <p className="text-xs font-black">{data.colaborador_matricula}</p>
                  </div>

                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 3. Dados da Ausência */}
            <AccordionItem value="dados-ausencia" className="border-none mt-4">
              <AccordionTrigger className="hover:no-underline py-2">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> DADOS DA AUSÊNCIA
                </h4>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-mk9-surface-deep text-white rounded-xl space-y-1">
                      <p className="text-[9px] font-bold opacity-60 uppercase">TIPO DA AUSÊNCIA (CANÔNICO)</p>
                      <p className="text-xs font-black uppercase">{data.tipo}</p>
                      <div className="pt-1 mt-1 border-t border-white/10">
                        <p className="text-[9px] font-bold opacity-60 uppercase">Período</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-black">{format(new Date(data.data_inicio + 'T00:00:00'), 'dd/MM/yy')}</p>
                          <ArrowRight className="h-3 w-3 opacity-60" />
                          <p className="text-[11px] font-black">{format(new Date(data.data_fim + 'T00:00:00'), 'dd/MM/yy')}</p>
                        </div>
                        <p className="text-[10px] font-bold bg-white/10 w-fit px-1.5 rounded mt-0.5">{data.dias} {data.dias === 1 ? 'dia' : 'dias'}</p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-xl space-y-1 border">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase">CID Sugerido</p>
                      <p className="text-xl font-black text-primary leading-none">{data.cid || "—"}</p>
                      {(data.horario_inicio || data.horario_fim) && (
                        <div className="mt-1.5 flex items-center gap-1 text-[9px] font-black bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded border border-blue-500/20">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{data.horario_inicio?.slice(0, 5) || "??:??"} - {data.horario_fim?.slice(0, 5) || "??:??"}</span>
                        </div>
                      )}
                      {data.acidente_trabalho && (
                        <Badge variant="destructive" className="text-[8px] h-4 font-black w-full justify-center px-0">ACIDENTE</Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-muted/30 rounded-xl border border-dashed space-y-2">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">MOTIVO / OBSERVAÇÕES DO REGISTRO</p>
                    <p className="text-xs italic leading-relaxed text-foreground/80">"{data.motivo || 'Nenhuma observação informada no registro.'}"</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 4. Documentos */}
            <AccordionItem value="docs" className="border-none mt-4">
              <AccordionTrigger className="hover:no-underline py-2">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" /> DOCUMENTOS ANEXADOS
                </h4>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="space-y-3">
                  {data.possui_anexo && data.arquivo_url ? (
                    <div className="p-3 bg-background border rounded-xl flex items-center justify-between group hover:border-primary transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center border group-hover:bg-primary/5 group-hover:border-primary/20 transition-colors">
                          <FileCheck className="h-5 w-5 text-slate-400 group-hover:text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-tight truncate">
                            {data.arquivo_nome || "Comprovante de Ausência"}
                          </p>
                          <p className="text-[9px] text-muted-foreground font-bold uppercase">
                            {data.arquivo_mime?.split('/')[1]?.toUpperCase() || "DOCUMENTO"} • DIGITALIZADO
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-full hover:bg-primary hover:text-white transition-all"
                        onClick={async () => {
                          try {
                            const bucket = "atestados";
                            const { data: signedData, error } = await supabase.storage
                              .from(bucket)
                              .createSignedUrl(data.arquivo_url!, 3600);

                            
                            if (error) throw error;
                            if (signedData?.signedUrl) {
                              window.open(signedData.signedUrl, "_blank", "noopener,noreferrer");
                            }
                          } catch (err) {
                            console.error("Erro ao abrir documento:", err);
                            toast.error("Não foi possível abrir o comprovante. Verifique sua conexão ou se o arquivo ainda existe.");
                          }
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="p-6 bg-muted/20 border rounded-xl border-dashed flex flex-col items-center justify-center text-center space-y-2">
                      <FileText className="h-8 w-8 text-muted-foreground/20" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Nenhum documento anexado</p>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 5. Processamento Interno e Timeline */}
            <AccordionItem value="interno" className="border-none mt-4">
              <AccordionTrigger className="hover:no-underline py-2">
                <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" /> PROCESSAMENTO E AUDITORIA
                </h4>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="space-y-6">
                  {/* Timeline */}
                  <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                    {timelineSteps.map((step, idx) => {
                      const isActive = idx <= currentStepIndex;
                      const isLast = idx === currentStepIndex;
                      const hasDate = !!step.date;
                      
                      return (
                        <div key={step.id} className="relative group">
                          <div className={cn(
                            "absolute -left-[23px] top-0 h-[22px] w-[22px] rounded-full border-4 bg-background z-10 flex items-center justify-center transition-all",
                            isActive ? "border-primary bg-primary text-white scale-110 shadow-sm" : "border-slate-50 bg-slate-50 text-slate-300"
                          )}>
                            <step.icon className="h-2.5 w-2.5" />
                          </div>
                          <div className={cn("space-y-0.5 transition-all", isActive ? "opacity-100" : "opacity-40")}>
                            <div className="flex items-center justify-between">
                              <p className={cn("text-[10px] font-black uppercase tracking-tight", isLast && "text-primary")}>{step.label}</p>
                              {hasDate && <p className="text-[8px] font-black text-muted-foreground">{formatDate(step.date)}</p>}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">{step.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Checklist & Alertas */}
                  <div className="space-y-3">
                    <h5 className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" /> Alertas Automáticos
                    </h5>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                      <div className="flex items-start gap-2">
                        <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-amber-900 leading-tight">
                          Ausência manual detectada. Necessário validar se o colaborador já possui matrícula ativa no sistema.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Observações Internas */}
                  <div className="space-y-2">
                    <h5 className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" /> Observações Internas
                    </h5>
                    <div className="p-3 bg-muted/20 border rounded-xl border-dashed min-h-[60px] flex items-center justify-center italic text-[10px] text-muted-foreground">
                      Nenhuma nota interna adicionada.
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>

      {/* 10. Ações de Processamento (Footer Fixo) */}
      <div className="p-5 border-t bg-slate-50/80 backdrop-blur-sm space-y-3">
        {isAwaiting && (
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-sm font-black shadow-lg hover:shadow-xl transition-all active:scale-95" 
            onClick={() => onIniciar(data.id)}
            disabled={isProcessing}
          >
            <Zap className="h-4 w-4 mr-2 fill-current" /> ASSUMIR PROCESSAMENTO
          </Button>
        )}
        {isInProgress && (
          <div className="flex gap-2">
             <Button 
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12 text-sm font-black shadow-lg" 
              onClick={() => onConcluir(data.id)}
              disabled={isProcessing || !isOwner}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> CONCLUIR OPERAÇÃO
            </Button>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        )}
        {!isOwner && isInProgress && data.responsavel_processamento_id && (
          <div className="space-y-3">
             <p className="text-[10px] text-center font-bold text-amber-600 uppercase bg-amber-50 p-2 rounded-lg border border-amber-200">
              Este registro está em processamento por {data.responsavel_processamento_nome}.
              Assuma a responsabilidade para realizar a conclusão manual.
            </p>
            <Button 
              className="w-full bg-amber-500 hover:bg-amber-600 h-12 text-sm font-black shadow-lg" 
              onClick={() => {
                if (window.confirm("Assumir este processamento?\n\nVocê passará a ser o responsável por este registro. A reatribuição ficará registrada no histórico de auditoria.")) {
                  onReatribuir(data.id, data.responsavel_processamento_id!);
                }
              }}
              disabled={isProcessing}
            >
              <ArrowRight className="h-4 w-4 mr-2" /> ASSUMIR PARA MIM
            </Button>
          </div>
        )}

        {data.status_processamento === "PROCESSADO" && (
          <Button variant="outline" className="w-full h-12 border-emerald-200 text-emerald-600 font-black cursor-default hover:bg-emerald-50">
            <Shield className="h-4 w-4 mr-2" /> REGISTRO PROCESSADO E AUDITADO
          </Button>
        )}
      </div>
    </div>
  );
}
