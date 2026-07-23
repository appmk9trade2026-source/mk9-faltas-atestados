// Reprocessa vínculos de Supervisor a partir da planilha original.
// Sem alterar RLS/RBAC/score. Guardado por RH ou Super Admin nas RPCs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  linha: z.union([z.number(), z.string()]).optional(),
  matricula: z.string().trim().min(1),
  supervisor_email: z.string().trim().max(200).optional().default(""),
  supervisor_nome: z.string().trim().max(200).optional().default(""),
});

export type ReprocessarSupervisorDetalhe = {
  linha?: number | string;
  matricula: string;
  colaborador_id?: string;
  colaborador_nome?: string;
  email?: string;
  nome_planilha?: string;
  motivo:
    | "MATRICULA_VAZIA"
    | "COLABORADOR_NAO_LOCALIZADO"
    | "COLABORADOR_AMBIGUO"
    | "EMAIL_VAZIO"
    | "EMAIL_INVALIDO"
    | "SUPERVISOR_INEXISTENTE"
    | "DUPLICIDADE"
    | "SEM_PAPEL_SUPERVISOR"
    | "DIVERGENCIA_DIGITACAO"
    | "VINCULADO";
  supervisor_usuario_id?: string;
  candidato_id?: string;
  candidato_email?: string;
  candidato_nome?: string;
  quantidade?: number;
};

export type ReprocessarSupervisorResultado = {
  total: number;
  localizados: number;
  nao_localizados: number;
  colab_ambiguo: number;
  email_recuperado: number;
  vinculados: number;
  inexistente: number;
  email_vazio: number;
  email_invalido: number;
  duplicidade: number;
  sem_papel_supervisor: number;
  divergencia_digitacao: number;
  detalhes: ReprocessarSupervisorDetalhe[];
};

function friendly(e: { message: string }): Error {
  if (/insufficient_privilege|permission|not authorized/i.test(e.message)) {
    return new Error("SCOPE_DENIED: apenas Super Admin ou RH podem reprocessar supervisores.");
  }
  return new Error(e.message);
}

export const reprocessarSupervisoresPlanilha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ rows: z.array(rowSchema).min(1).max(500) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ReprocessarSupervisorResultado> => {
    const { data: result, error } = await context.supabase.rpc(
      "reprocess_supervisor_batch",
      { _rows: data.rows as never } as never,
    );
    if (error) throw friendly(error);
    return result as ReprocessarSupervisorResultado;
  });

export const confirmarVinculoSupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      colaborador_id: z.string().uuid(),
      supervisor_usuario_id: z.string().uuid(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "confirmar_vinculo_supervisor",
      { _colaborador_id: data.colaborador_id, _supervisor_usuario_id: data.supervisor_usuario_id } as never,
    );
    if (error) throw friendly(error);
    return result as { ok: boolean; supervisor_email: string; supervisor_usuario_id: string };
  });
