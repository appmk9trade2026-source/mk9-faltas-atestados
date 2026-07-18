import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, Info, Loader2, RotateCcw, Save, ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Pref = {
  tipo: string;
  nome_exibicao: string;
  descricao: string;
  categoria: string;
  obrigatoria: boolean;
  silenciavel: boolean;
  severidade_padrao: "INFO" | "ATENCAO" | "ALTA" | "CRITICA";
  habilitada: boolean;
  silenciar_info: boolean;
  origem: "PADRAO" | "USUARIO" | "REGRA_OBRIGATORIA";
};

const sevBadge: Record<Pref["severidade_padrao"], string> = {
  INFO: "bg-muted text-muted-foreground",
  ATENCAO: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  ALTA: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  CRITICA: "bg-destructive/15 text-destructive border-destructive/30",
};

export function PreferenciasTab() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["preferencias_notif"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_preferencias_notificacao");
      if (error) throw error;
      return (data ?? []) as Pref[];
    },
  });

  const update = useMutation({
    mutationFn: async (v: { tipo: string; habilitada: boolean; silenciar_info: boolean }) => {
      const { error } = await supabase.rpc("atualizar_preferencia_notificacao", {
        p_tipo: v.tipo as never,
        p_habilitada: v.habilitada,
        p_silenciar_info: v.silenciar_info,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["preferencias_notif"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("restaurar_preferencias_padrao");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferências restauradas ao padrão");
      qc.invalidateQueries({ queryKey: ["preferencias_notif"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = useMemo(() => {
    const map: Record<string, Pref[]> = {};
    for (const p of data) (map[p.categoria] ??= []).push(p);
    return map;
  }, [data]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (data.length === 0) {
    return (
      <Card><CardContent className="p-12 text-center">
        <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhum tipo configurável disponível.</p>
      </CardContent></Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 h-4 w-4 text-primary" />
            <div className="text-xs text-muted-foreground">
              As preferências afetam apenas <strong>notificações futuras</strong>. Alterações
              não removem notificações já recebidas e <strong>não afetam alertas obrigatórios</strong>
              (incidentes críticos, P1, SLA vencido, backup falhou e alertas ALTA/CRÍTICA).
            </div>
            <div className="ml-auto">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar padrões
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Restaurar preferências padrão?</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Todas as suas preferências pessoais serão removidas e o sistema voltará
                    aos padrões seguros do catálogo.
                  </p>
                  <DialogFooter>
                    <Button variant="destructive" onClick={() => restore.mutate()} disabled={restore.isPending}>
                      {restore.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirmar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {Object.entries(groups).map(([cat, items]) => (
          <Card key={cat}>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {cat}
              </h3>
              <div className="divide-y">
                {items.map((p) => {
                  const locked = p.obrigatoria || p.severidade_padrao === "ALTA" || p.severidade_padrao === "CRITICA";
                  return (
                    <div key={p.tipo} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{p.nome_exibicao}</span>
                          <Badge variant="outline" className={`text-[10px] ${sevBadge[p.severidade_padrao]}`}>
                            {p.severidade_padrao}
                          </Badge>
                          {locked ? (
                            <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/10 text-primary">
                              <ShieldCheck className="h-3 w-3 mr-1" /> Obrigatória
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Opcional</Badge>
                          )}
                          {p.origem === "USUARIO" && (
                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                              Personalizada
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{p.descricao}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.severidade_padrao === "INFO" && !locked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                <Switch
                                  checked={p.silenciar_info}
                                  onCheckedChange={(v) => update.mutate({ tipo: p.tipo, habilitada: p.habilitada, silenciar_info: v })}
                                />
                                Silenciar INFO
                              </label>
                            </TooltipTrigger>
                            <TooltipContent>Não gerar as notificações informativas deste tipo</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                checked={locked ? true : p.habilitada}
                                disabled={locked || update.isPending}
                                onCheckedChange={(v) => update.mutate({ tipo: p.tipo, habilitada: v, silenciar_info: p.silenciar_info })}
                              />
                            </div>
                          </TooltipTrigger>
                          {locked && (
                            <TooltipContent>
                              Esta notificação é obrigatória e não pode ser desativada.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}

export function _iconRef() { return <><Save /><AlertTriangle /></>; }
