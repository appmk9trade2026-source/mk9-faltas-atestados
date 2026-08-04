import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, XCircle, Info, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";

interface ConflitoInfo {
  id: string;
  tipo: string;
  data_inicio: string;
  data_fim: string;
  registrado_por: string;
  registrado_em: string;
  protocolo: string | null;
  status: string;
  registrado_por_nome: string | null;
}

interface ConflitoAusenciaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflitos: ConflitoInfo[];
  novoTipo: string;
  onConfirmSubstituir: (conflitoId: string) => void;
  onConfirmManterAmbos: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ConflitoAusenciaDialog({
  open,
  onOpenChange,
  conflitos,
  novoTipo,
  onConfirmSubstituir,
  onConfirmManterAmbos,
  onCancel,
  isSubmitting = false,
}: ConflitoAusenciaDialogProps) {
  const conflito = conflitos[0]; // Pegamos o primeiro conflito principal

  if (!conflito) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle className="text-xl">Conflito de Ausências Detectado</DialogTitle>
          </div>
          <DialogDescription className="text-base text-foreground/80">
            Foi encontrada uma <strong>{conflito.tipo}</strong> já registrada para este colaborador no mesmo período.
            Como deseja proceder?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex justify-between items-start">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                Ausência Existente
              </h4>
              <Badge variant="outline" className="capitalize">
                {conflito.status.toLowerCase()}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div className="text-muted-foreground">Tipo:</div>
              <div className="font-medium">{conflito.tipo}</div>
              
              <div className="text-muted-foreground">Período:</div>
              <div className="font-medium">
                {format(new Date(conflito.data_inicio), "dd/MM/yyyy")} até {format(new Date(conflito.data_fim), "dd/MM/yyyy")}
              </div>
              
              <div className="text-muted-foreground">Registrado por:</div>
              <div className="font-medium">{conflito.registrado_por_nome || "Sistema"}</div>
              
              <div className="text-muted-foreground">Data lançamento:</div>
              <div className="font-medium">
                {format(new Date(conflito.registrado_em), "dd/MM/yyyy HH:mm")}
              </div>

              {conflito.protocolo && (
                <>
                  <div className="text-muted-foreground">Protocolo:</div>
                  <div className="font-mono text-xs">{conflito.protocolo}</div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3 px-4 border-emerald-500/20 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/20"
              onClick={() => onConfirmSubstituir(conflito.id)}
              disabled={isSubmitting}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                <div className="text-left">
                  <div className="font-semibold">Substituir pela nova ausência (Recomendado)</div>
                  <div className="text-xs text-muted-foreground">
                    A {conflito.tipo.toLowerCase()} antiga será marcada como substituída e o novo {novoTipo.toLowerCase()} será o registro ativo.
                  </div>
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3 px-4 border-amber-500/20 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/20"
              onClick={onConfirmManterAmbos}
              disabled={isSubmitting}
            >
              <div className="flex items-start gap-3">
                <History className="h-5 w-5 text-amber-500 mt-0.5" />
                <div className="text-left">
                  <div className="font-semibold">Manter ambos os registros</div>
                  <div className="text-xs text-muted-foreground">
                    Utilizado para casos de turnos diferentes ou atestados parciais.
                  </div>
                </div>
              </div>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start h-auto py-3 px-4 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 mt-0.5" />
                <div className="text-left">
                  <div className="font-semibold">Cancelar lançamento</div>
                  <div className="text-xs text-muted-foreground">
                    Desiste de registrar o novo {novoTipo.toLowerCase()} neste momento.
                  </div>
                </div>
              </div>
            </Button>
          </div>
        </div>

        <DialogFooter className="text-xs text-muted-foreground text-center sm:text-left">
          Toda substituição é auditada e o histórico original é preservado.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
