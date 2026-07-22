import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionScope } from "@/hooks/use-session-scope";

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
  const scope = useSessionScope();
  return useQuery({
    queryKey: ["notif", "unread-count", ...scope.keyParts],
    enabled: scope.ready,
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
  const scope = useSessionScope();
  return useQuery({
    queryKey: ["notif", "list", ...scope.keyParts, status ?? "all", limit],
    enabled: scope.ready,
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

export type MotorRunResult = {
  execution_id: string;
  status: "CONCLUIDO" | "CONCLUIDO_COM_ALERTAS" | "FALHOU" | "IGNORADO_POR_LOCK";
  processados?: number;
  gerados?: number;
  duplicadas?: number;
  erro?: string;
};

export function useProcessarEscalonamentos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("processar_escalonamentos_pendentes");
      if (error) throw error;
      return data as unknown as MotorRunResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif"] });
      qc.invalidateQueries({ queryKey: ["automacao"] });
      qc.invalidateQueries({ queryKey: ["esc-execs"] });
    },
  });
}

export function useReprocessarEscalonamentos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reprocessar_escalonamentos" as never);
      if (error) throw error;
      return data as unknown as MotorRunResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif"] });
      qc.invalidateQueries({ queryKey: ["automacao"] });
      qc.invalidateQueries({ queryKey: ["esc-execs"] });
    },
  });
}

export type AutomacaoStatus = {
  estado: "ATIVO" | "ATRASADO" | "COM_FALHA" | "INATIVO" | "NAO_CONFIGURADO";
  agendamento_ativo: boolean;
  cron_configurado: boolean;
  intervalo_minutos: number;
  tolerancia_minutos: number;
  execucao_travada_minutos: number;
  ultima_execucao: string | null;
  ultima_execucao_status: string | null;
  ultimo_sucesso: string | null;
  ultima_falha: string | null;
  proxima_execucao_esperada: string | null;
  duracao_media_ms: number;
  notificacoes_24h: number;
  ignoradas_por_lock_24h: number;
  falhas_consecutivas: number;
  config: { falhas_para_alta: number; falhas_para_critica: number };
};

export function useAutomacaoStatus(refetchMs = 30_000) {
  return useQuery({
    queryKey: ["automacao", "status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("automacao_status" as never);
      if (error) throw error;
      return data as unknown as AutomacaoStatus;
    },
    refetchInterval: refetchMs,
    staleTime: 15_000,
  });
}

