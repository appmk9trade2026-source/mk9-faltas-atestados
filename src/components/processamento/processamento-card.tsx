import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  Check, 
  Eye, 
  Clock, 
  User, 
  Building2, 
  Briefcase, 
  Calendar,
  AlertTriangle,
  Zap,
  ArrowRight
} from "lucide-react";
import { AusenciaCardData } from "./types";
import { getPrioridadeLabel, getSlaColor } from "./utils";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function formatBRDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

interface ProcessamentoCardProps {
  data: AusenciaCardData;
  onIniciar: (id: string) => void;
  onConcluir: (id: string) => void;
  onReatribuir?: (id: string, responsavelAnteriorId: string) => void;
  onVerDetalhes: (data: AusenciaCardData) => void;

  isProcessing: boolean;
  currentUserId: string | undefined;
  isNextInLine?: boolean;
}

export function ProcessamentoCard({ 
  data, 
  onIniciar, 
  onConcluir, 
  onReatribuir,
  onVerDetalhes,

  isProcessing,
  currentUserId,
  isNextInLine
}: ProcessamentoCardProps) {
  const prioridade = getPrioridadeLabel(data.prioridade);
  const isOwner = data.responsavel_processamento_id === currentUserId;
  const isAwaiting = data.status_processamento === "AGUARDANDO";
  const isInProgress = data.status_processamento === "EM_PROCESSAMENTO";
  const isProcessed = data.status_processamento === "PROCESSADO";
  
  const slaColor = isProcessed ? "bg-slate-100 text-slate-500" : getSlaColor(data.registrado_em);

  return (
    <Card className={cn(
      "group transition-all hover:shadow-lg border-l-4 relative overflow-hidden",
      data.prioridade === "CRITICO" ? "border-l-red-500" : 
      data.prioridade === "ATENCAO" ? "border-l-amber-500" : "border-l-emerald-500",
      isNextInLine && "ring-2 ring-primary ring-offset-2"
    )}>
      {isNextInLine && (
        <div className="absolute top-0 right-0">
          <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground font-bold text-[10px] py-0.5 px-2 animate-pulse">
            <Zap className="h-3 w-3 mr-1 fill-current" />
            PRÓXIMO DA FILA
          </Badge>
        </div>
      )}

      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-none group-hover:text-primary transition-colors truncate max-w-[180px]">
                  {data.colaborador_nome}
                </h3>
                <Badge variant="outline" className="text-[9px] font-mono h-4 px-1">
                  {data.colaborador_matricula}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                 {data.tipo} • {data.dias} {data.dias === 1 ? 'dia' : 'dias'}
              </p>
            </div>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={cn("text-[10px] font-bold px-1.5 py-0 h-5", prioridade.color)} variant="outline">
                    {prioridade.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Prioridade: {prioridade.label}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] bg-muted/30 p-2 rounded-md">
            <div className="flex items-center gap-1.5 text-muted-foreground overflow-hidden">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate" title={data.empresa_nome}>{data.empresa_nome}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground overflow-hidden">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span className="truncate" title={data.projeto_nome}>{data.projeto_nome}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground overflow-hidden">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate" title={data.supervisor_nome}>{data.supervisor_nome}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground overflow-hidden">
               <Badge variant="outline" className="text-[9px] h-4 px-1 lowercase font-normal">
                {data.origem_registro === 'MANUAL' ? 'manual' : 'auto'}
               </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={cn("text-[9px] font-bold px-1.5 h-4", slaColor)}>
                SLA: {data.tempo_aguardando}d
              </Badge>
              <Badge variant="secondary" className="text-[9px] px-1.5 h-4">
                RH: {data.status_rh}
              </Badge>
              {data.cid && (
                <Badge variant="outline" className="text-[9px] border-primary/30 text-primary px-1.5 h-4">
                  CID: {data.cid}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3 mt-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                <span>{data.tempo_aguardando} dias na fila</span>
              </div>
              {data.responsavel_processamento_nome && (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 truncate">
                  <User className="h-2.5 w-2.5" />
                  <span>Resp: {data.responsavel_processamento_nome}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg" 
                onClick={() => onVerDetalhes(data)}
                title="Ver Detalhes"
              >
                <Eye className="h-4 w-4" />
              </Button>

              {isAwaiting && (
                <Button 
                  size="sm" 
                  className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-[11px] font-bold shadow-sm" 
                  onClick={() => onIniciar(data.id)}
                  disabled={isProcessing}
                >
                  <Play className="h-3 w-3 fill-current" />
                  Assumir
                </Button>
              )}

              {isInProgress && (
                <div className="flex gap-1.5 items-center">
                  <Button 
                    size="sm" 
                    className={cn(
                      "h-8 gap-1.5 text-[11px] font-bold shadow-sm",
                      isOwner ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"
                    )}
                    onClick={() => {
                      if (isOwner) onConcluir(data.id);
                      else if (onReatribuir && window.confirm("Assumir este processamento?")) {
                        onReatribuir(data.id, data.responsavel_processamento_id!);
                      }
                    }}
                    disabled={isProcessing}
                    title={!isOwner ? `Em processamento por ${data.responsavel_processamento_nome}. Clique para assumir.` : "Concluir operação"}
                  >
                    {isOwner ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    {isOwner ? "Continuar" : "Assumir"}
                  </Button>
                </div>
              )}


              {isProcessed && (
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                  PROCESSADO
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}