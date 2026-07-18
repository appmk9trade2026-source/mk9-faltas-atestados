import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotifStatus = "NAO_LIDA" | "LIDA" | "ARQUIVADA";
export type NotifSeveridade = "INFO" | "ATENCAO" | "ALTA" | "CRITICA";

export type NotificacaoItem = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  severidade: NotifSeveridade;
  origem: string;
  origem_id: string | null;
  modulo: string | null;
  rota_destino: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  status: NotifStatus;
  lida_em: string | null;
};

export function useNotificacoesNaoLidas(refetchMs = 60_000) {
  return useQuery({
    queryKey: ["notif", "unread-count"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contar_notificacoes_nao_lidas");
      if (error) throw error;
      return (data as number) ?? 0;
    },
    refetchInterval: refetchMs,
    staleTime: 30_000,
  });
}

export function useNotificacoes(status?: NotifStatus, limit = 50) {
  return useQuery({
    queryKey: ["notif", "list", status ?? "all", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_notificacoes_usuario", {
        _status: status ?? null,
        _limit: limit,
        _offset: 0,
      } as never);
      if (error) throw error;
      return (data as NotificacaoItem[]) ?? [];
    },
    staleTime: 15_000,
  });
}

export function useMarcarLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("marcar_notificacao_como_lida", { _notificacao_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif"] });
    },
  });
}

export function useArquivar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("arquivar_notificacao", { _notificacao_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif"] });
    },
  });
}

export function useProcessarEscalonamentos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("processar_escalonamentos_pendentes");
      if (error) throw error;
      return data as { execucao_id: string; processados: number; gerados: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif"] }),
  });
}
