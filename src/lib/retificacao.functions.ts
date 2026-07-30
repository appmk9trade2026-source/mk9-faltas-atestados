// Retificação de ausências — camada servidor.
//
// O frontend NUNCA faz UPDATE direto em public.ausencias para retificar.
// Todo o fluxo passa pela RPC transacional public.retificar_ausencia,
// que valida papel real, escopo canônico de projeto, janela de 24h com
// o relógio do banco, campos imutáveis, anexo e grava histórico + auditoria.

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
});

export type RetificarAusenciaInput = z.infer<typeof retificarSchema>;

function invalid(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`INVALID_PAYLOAD: ${msg.slice(0, 240)}`);
}

/** Mapeia erros do banco para mensagens estáveis (sem vazar detalhe interno). */
export function mapRetificacaoError(message: string): string {
  if (/PRAZO_EXPIRADO/.test(message))
    return "A janela de 24 horas para retificação expirou. Solicite a correção ao RH ou Super Admin.";
  if (/PROJECT_SCOPE_DENIED/.test(message))
    return "Esta ausência está fora do seu escopo de projeto.";
  if (/DOCUMENTO_OBRIGATORIO/.test(message))
    return "O tipo selecionado exige documento anexado.";
  if (/PERMISSION_DENIED|insufficient_privilege|row-level security/i.test(message))
    return "Você não tem permissão para retificar esta ausência.";
  if (/RESOURCE_NOT_FOUND/.test(message)) return "Ausência não encontrada.";
  if (/INVALID_PAYLOAD|check_violation/.test(message))
    return message.replace(/^.*INVALID_PAYLOAD:\s*/, "") || "Dados inválidos para retificação.";
  return "Não foi possível concluir a retificação.";
}

export const retificarAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return retificarSchema.parse(data);
    } catch (e) {
      throw invalid(e);
    }
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "retificar_ausencia" as never,
      {
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
      } as never,
    );
    if (error) throw new Error(mapRetificacaoError(error.message));
    return result as {
      ok: boolean;
      ausencia_id: string;
      protocolo: string | null;
      tipo_novo: string;
      data_inicio: string;
      data_fim: string;
      correlation_id: string;
    };
  });

/** Histórico de retificações de uma ausência (RLS aplica o escopo). */
export const listarRetificacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    try {
      return z.object({ ausencia_id: uuid }).parse(data);
    } catch (e) {
      throw invalid(e);
    }
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ausencia_retificacoes" as never)
      .select(
        "id, ausencia_id, protocolo, tipo_anterior_nome, tipo_novo_nome, periodo_anterior_nome, periodo_novo_nome, data_inicio_anterior, data_inicio_nova, data_fim_anterior, data_fim_nova, usuario_id, papel_usuario, retificado_em, motivo_operacional, observacao",
      )
      .eq("ausencia_id", data.ausencia_id)
      .order("retificado_em", { ascending: false });
    if (error) throw new Error("RESOURCE_NOT_FOUND: histórico indisponível");
    return (rows ?? []) as unknown as Array<{
      id: string;
      protocolo: string | null;
      tipo_anterior_nome: string | null;
      tipo_novo_nome: string | null;
      periodo_anterior_nome: string | null;
      periodo_novo_nome: string | null;
      data_inicio_anterior: string | null;
      data_inicio_nova: string | null;
      data_fim_anterior: string | null;
      data_fim_nova: string | null;
      usuario_id: string;
      papel_usuario: string;
      retificado_em: string;
      motivo_operacional: string;
      observacao: string | null;
    }>;
  });

/** Consulta de duplicidade — orientação de UI; o bloqueio real é no banco. */
export const verificarDuplicidadeAusencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
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
    } catch (e) {
      throw invalid(e);
    }
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "ausencia_duplicada_existente" as never,
      {
        _colaborador_id: data.colaborador_id ?? null,
        _projeto_id: data.projeto_id,
        _data_inicio: data.data_inicio,
        _data_fim: data.data_fim,
        _opcao_periodo_id: data.opcao_periodo_id ?? null,
        _ignorar_id: data.ignorar_id ?? null,
        _manual_matricula: data.manual_matricula ?? null,
      } as never,
    );
    if (error) return { duplicadas: [] as Array<Record<string, unknown>> };
    return {
      duplicadas: (rows ?? []) as unknown as Array<{
        id: string;
        protocolo: string | null;
        tipo_ausencia_nome: string | null;
        data_inicio: string;
        data_fim: string;
        created_at: string;
      }>,
    };
  });

/** Prazo de 24h calculado a partir de created_at (fonte: banco). */
export function prazoRetificacao(createdAt: string, agora: Date = new Date()) {
  const limite = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000);
  const restanteMs = limite.getTime() - agora.getTime();
  return { limite, restanteMs, expirado: restanteMs <= 0 };
}

/** Formata o tempo restante como "12h 34min". */
export function formatarRestante(ms: number): string {
  if (ms <= 0) return "expirado";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}
