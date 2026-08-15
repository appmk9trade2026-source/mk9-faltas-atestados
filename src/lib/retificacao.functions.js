// Retificação de ausências — camada servidor.
//
// O frontend NUNCA faz UPDATE direto em public.ausencias para retificar.
// Todo o fluxo passa pela RPC transacional public.retificar_ausencia,
// que valida papel real, escopo canônico de projeto, janela de 24h com
// o relógio do banco, campos imutáveis, anexo e grava histórico + auditoria.
import { formatarRestante, mapRetificacaoError, prazoRetificacao } from "@/lib/retificacao";
export { formatarRestante, mapRetificacaoError, prazoRetificacao };
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");
const retificarSchema = z.object({
    ausencia_id: uuid,
    tipo_ausencia_id: uuid,
    opcao_periodo_id: uuid,
    data_inicio: isoDate,
    motivo_operacional: z.string().trim().min(10).max(500),
    motivo: z.string().trim().min(5).max(500).nullable().optional(),
    cid: z.string().trim().max(20).nullable().optional(),
    tipo_detalhe: z.string().trim().max(150).nullable().optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
    arquivo: z
        .object({
        path: z.string().trim().min(1).max(500),
        nome: z.string().trim().max(255).nullable().optional(),
        mime: z.string().trim().max(120).nullable().optional(),
        tamanho: z.number().int().nonnegative().nullable().optional(),
    })
        .nullable()
        .optional(),
    updated_at_check: z.string().optional(),
    motivo_categoria: z.string().optional(),
    e_erro_supervisor: z.boolean().optional(),
});
function invalid(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
}
export const retificarAusencia = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => {
    try {
        return retificarSchema.parse(data);
    }
    catch (e) {
        throw invalid(e);
    }
})
    .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("retificar_ausencia", {
        p_ausencia_id: data.ausencia_id,
        p_tipo_ausencia_id: data.tipo_ausencia_id,
        p_opcao_periodo_id: data.opcao_periodo_id,
        p_data_inicio: data.data_inicio,
        p_motivo_operacional: data.motivo_operacional,
        p_motivo: data.motivo ?? null,
        p_cid: data.cid ?? null,
        p_tipo_detalhe: data.tipo_detalhe ?? null,
        p_arquivo: data.arquivo
            ? {
                path: data.arquivo.path,
                nome: data.arquivo.nome ?? null,
                mime: data.arquivo.mime ?? null,
                tamanho: data.arquivo.tamanho ?? null,
            }
            : null,
        p_observacao: data.observacao ?? null,
        p_updated_at_check: data.updated_at_check ?? null,
        p_motivo_categoria: data.motivo_categoria ?? null,
        p_e_erro_supervisor: data.e_erro_supervisor ?? null,
    });
    if (error)
        throw new Error(mapRetificacaoError(error.message));
    return result;
});
/** Histórico de retificações de uma ausência (RLS aplica o escopo). */
export const listarRetificacoes = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => {
    try {
        return z.object({ ausencia_id: uuid }).parse(data);
    }
    catch (e) {
        throw invalid(e);
    }
})
    .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
        .from("ausencia_retificacoes")
        .select("id, ausencia_id, protocolo, tipo_anterior_nome, tipo_novo_nome, periodo_anterior_nome, periodo_novo_nome, data_inicio_anterior, data_inicio_nova, data_fim_anterior, data_fim_nova, usuario_id, papel_usuario, retificado_em, motivo_operacional, observacao")
        .eq("ausencia_id", data.ausencia_id)
        .order("retificado_em", { ascending: false });
    if (error)
        throw new Error("RESOURCE_NOT_FOUND: histórico indisponível");
    return (rows ?? []);
});
/** Consulta de duplicidade — orientação de UI; o bloqueio real é no banco. */
export const verificarDuplicidadeAusencia = createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((data) => {
    try {
        return z
            .object({
            colaborador_id: uuid.nullable().optional(),
            manual_matricula: z.string().trim().max(50).nullable().optional(),
            projeto_id: uuid,
            data_inicio: isoDate,
            data_fim: isoDate,
            opcao_periodo_id: uuid.nullable().optional(),
            ignorar_id: uuid.nullable().optional(),
        })
            .parse(data);
    }
    catch (e) {
        throw invalid(e);
    }
})
    .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("ausencia_duplicada_existente", {
        _colaborador_id: data.colaborador_id ?? null,
        _projeto_id: data.projeto_id,
        _data_inicio: data.data_inicio,
        _data_fim: data.data_fim,
        _opcao_periodo_id: data.opcao_periodo_id ?? null,
        _ignorar_id: data.ignorar_id ?? null,
        _manual_matricula: data.manual_matricula ?? null,
    });
    const duplicadas = (error ? [] : (rows ?? []));
    return { duplicadas };
});
