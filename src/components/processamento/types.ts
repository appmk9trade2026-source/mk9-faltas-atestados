import { Database } from "@/integrations/supabase/types";

export type StatusProcessamento = Database["public"]["Enums"]["ausencia_status_processamento"];

export interface ProcessamentoKpis {
  backlog: number;
  em_processamento: number;
  processados_hoje: number;
  fora_sla: number;
}

export interface AusenciaCardData {
  id: string;
  protocolo: string | null;
  tipo: string;
  motivo: string | null;
  data_inicio: string;
  data_fim: string;
  dias: number;
  registrado_em: string;
  lancado_em: string | null;
  status_processamento: StatusProcessamento;
  responsavel_processamento_id: string | null;
  responsavel_processamento_nome: string | null;
  processamento_iniciado_em: string | null;
  processamento_concluido_em: string | null;
  prioridade: "NORMAL" | "ATENCAO" | "CRITICO";
  tempo_aguardando: number;
  sla_status: "DENTRO" | "ATENCAO" | "FORA";
  colaborador_nome: string;
  colaborador_matricula: string;
  empresa_nome: string;
  projeto_nome: string;
  supervisor_nome: string;
  origem_registro: string | null;
  cid: string | null;
  acidente_trabalho: boolean | null;
  status_rh: string | null;
}
