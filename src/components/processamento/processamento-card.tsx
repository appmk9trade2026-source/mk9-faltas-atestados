import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Check, Eye, Clock, User, Building2, Briefcase, Calendar } from "lucide-react";
import { AusenciaCardData } from "./types";
import { getPrioridadeLabel } from "./utils";
import { formatBRDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ProcessamentoCardProps {
  data: AusenciaCardData;
  onIniciar: (id: string) => void;
  onConcluir: (id: string) => void;
  onVerDetalhes: (data: AusenciaCardData) => void;
  isProcessing: boolean;
  currentUserId: string | undefined;
}

export function ProcessamentoCard({ 
  data, 
  onIniciar, 
  onConcluir, 
  onVerDetalhes,
  isProcessing,
  currentUserId
}: ProcessamentoCardProps) {
  const prioridade = getPrioridadeLabel(data.prioridade);
  const isOwner = data.responsavel_processamento_id === currentUserId;
  const isAwaiting = data.status_processamento === "AGUARDANDO";
  const isInProgress = data.status_processamento === "EM_PROCESSAMENTO";
  
  return (
    <Card className={cn(
      "group transition-all hover:shadow-md border-l-4",
      data.prioridade === "CRITICO" ? "border-l-red-500" : 
      data.prioridade === "ATENCAO" ? "border-l-amber-500" : "border-l-emerald-500"
    )}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold text-base leading-none group-hover:text-primary transition-colors">
                {data.colaborador_nome}
              </h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-medium">Matrícula: {data.colaborador_matricula}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                   {data.tipo}
                </span>
              </p>
            </div>
            <Badge className={cn("text-[10px] font-bold px-2 py-0", prioridade.color)} variant="outline">
              {prioridade.icon} {prioridade.label}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-y-2 text-[11px]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3 w-3" />
              <span className="truncate max-w-[120px]" title={data.empresa_nome}>{data.empresa_nome}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              <span className="truncate max-w-[120px]" title={data.projeto_nome}>{data.projeto_nome}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="truncate max-w-[120px]" title={data.supervisor_nome}>{data.supervisor_nome}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{formatBRDate(data.data_inicio)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3 mt-1">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Aguardando há {data.tempo_aguardando} dias</span>
              </div>
              {data.responsavel_processamento_nome && (
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary">
                  <User className="h-3 w-3" />
                  <span>Resp: {data.responsavel_processamento_nome}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full" 
                onClick={() => onVerDetalhes(data)}
                title="Ver Detalhes"
              >
                <Eye className="h-4 w-4" />
              </Button>

              {isAwaiting && (
                <Button 
                  size="sm" 
                  className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700" 
                  onClick={() => onIniciar(data.id)}
                  disabled={isProcessing}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Iniciar
                </Button>
              )}

              {isInProgress && (
                <Button 
                  size="sm" 
                  className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700" 
                  onClick={() => onConcluir(data.id)}
                  disabled={isProcessing || !isOwner}
                  title={!isOwner ? "Apenas o responsável pode concluir" : ""}
                >
                  <Check className="h-3.5 w-3.5" />
                  Concluir
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
