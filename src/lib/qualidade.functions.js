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
export const getErrosSupervisor = createServerFn({ method: "GET" })
    .inputValidator((data) => z.object({
    supervisorId: z.string().uuid(),
    projetoId: z.string().uuid(),
    dataInicio: z.string(),
    dataFim: z.string()
}).parse(data))
    .handler(async ({ data }) => {
    const { data: result, error } = await supabase
        .from("ausencias")
        .select(`
        id,
        protocolo,
        data_inicio,
        tipo_ausencia:tipo_ausencia_id(nome),
        colaborador_id,
        manual_nome,
        motivo_exclusao_categoria_v2,
        motivo_exclusao_detalhe,
        registrado_em,
        retificada
      `)
        .eq("registrado_por", data.supervisorId)
        .eq("projeto_id", data.projetoId)
        .eq("e_erro_supervisor", true)
        .gte("registrado_em", `${data.dataInicio}T00:00:00`)
        .lte("registrado_em", `${data.dataFim}T23:59:59`)
        .order("registrado_em", { ascending: false });
    if (error)
        throw new Error(error.message);
    return result;
});
export const getRelatorioQualidade = createServerFn({ method: "GET" })
    .inputValidator((data) => getQualidadeParamsSchema.parse(data))
    .handler(async ({ data }) => {
    const { data: result, error } = await supabase.rpc("rel_qualidade_lancamentos", {
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
    // Ordenação explícita por taxa de erro (descendente) e total de lançamentos
    const sorted = (result || []).sort((a, b) => {
        const taxaA = a.taxa_erro !== null ? Number(a.taxa_erro) : -1;
        const taxaB = b.taxa_erro !== null ? Number(b.taxa_erro) : -1;
        if (taxaB !== taxaA)
            return taxaB - taxaA;
        return Number(b.total_lancamentos) - Number(a.total_lancamentos);
    });
    return sorted;
});
