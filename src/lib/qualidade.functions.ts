import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const getQualidadeParamsSchema = z.object({
  dataInicio: z.string(),
  dataFim: z.string(),
  empresaId: z.string().uuid().optional(),
  projetoId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
});

export type QualidadeLancamentosRow = {
  supervisor_id: string;
  supervisor_nome: string;
  projeto_id: string;
  projeto_nome: string;
  total_lancamentos: number;
  total_correcoes: number;
  taxa_acerto: number;
  taxa_correcao: number;
};

export const getRelatorioQualidade = createServerFn({ method: "GET" })
  .inputValidator((data) => getQualidadeParamsSchema.parse(data))
  .handler(async ({ data }) => {
    const { data: result, error } = await supabase.rpc("rel_qualidade_lancamentos" as any, {
      p_data_inicio: data.dataInicio,
      p_data_fim: data.dataFim,
      p_empresa_id: data.empresaId,
      p_projeto_id: data.projetoId,
      p_supervisor_id: data.supervisorId,
    });

    if (error) {
      console.error("Erro ao buscar relatório de qualidade:", error);
      throw new Error(error.message);
    }

    return (result as any) as QualidadeLancamentosRow[];
  });
