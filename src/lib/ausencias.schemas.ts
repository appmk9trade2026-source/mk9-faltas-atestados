import { z } from "zod";

export const uuid = z.string().uuid();
export const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

/** Campos comuns às duas origens (AUTOMATICO e MANUAL). */
export const commonPayloadSchema = z.object({
  tipo_ausencia_id: uuid,
  opcao_periodo_id: uuid,
  data_inicio: iso,
  localidade: z.string().trim().min(1).max(150),
  loja_codigo_nome: z.string().trim().min(1).max(150),
  cid: z.string().trim().max(20).nullable().optional(),
  acidente_trabalho_trajeto: z.boolean(),
  motivo: z.string().trim().min(5).max(500),
  arquivo_url: z.string().trim().max(500).nullable().optional(),
  arquivo_nome: z.string().trim().max(255).nullable().optional(),
  arquivo_mime: z.string().trim().max(120).nullable().optional(),
  arquivo_tamanho: z.number().int().nullable().optional(),
  horario_inicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  horario_fim: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  acidente_data: iso.nullable().optional(),
  acidente_hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  acidente_local: z.string().trim().max(200).nullable().optional(),
  acidente_descricao: z.string().trim().max(2000).nullable().optional(),
  acidente_atendimento_medico: z.boolean().nullable().optional(),
  acidente_houve_afastamento: z.boolean().nullable().optional(),
  acidente_dias_afastamento_inicial: z.union([z.string(), z.number()]).nullable().optional(),
  acidente_cat_emitida: z.boolean().nullable().optional(),
  acidente_observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const MANUAL_MOTIVOS = [
  "COLABORADOR_NAO_ENCONTRADO",
  "CADASTRO_DESATUALIZADO",
  "ADMISSAO_RECENTE",
  "OUTRO",
] as const;

export const autoPayloadSchema = commonPayloadSchema.extend({
  origem_registro: z.literal("AUTOMATICO"),
  colaborador_id: uuid,
});

export const manualPayloadSchema = commonPayloadSchema.extend({
  origem_registro: z.literal("MANUAL"),
  empresa_id: uuid,
  projeto_id: uuid,
  manual_motivo: z.enum(MANUAL_MOTIVOS),
  manual_motivo_detalhe: z.string().trim().max(300).nullable().optional(),
  manual_nome: z.string().trim().min(3, "Informe o nome completo do colaborador (mínimo 3 caracteres).").transform(v => v.trim()),
  manual_matricula: z.string().trim().min(1).max(50),
  manual_telefone: z.string().trim().max(20).nullable().optional(),
  manual_whatsapp: z.string().trim().max(20).nullable().optional(),
  manual_email: z.string().trim().max(150).nullable().optional(),
  manual_supervisor_nome: z.string().trim().max(150).nullable().optional(),
  manual_supervisor_telefone: z.string().trim().max(20).nullable().optional(),
  manual_supervisor_usuario_id: uuid.nullable().optional(),
});

export const basePayloadSchema = z.discriminatedUnion("origem_registro", [
  autoPayloadSchema,
  manualPayloadSchema,
]);

export const updatePayloadSchema = z.discriminatedUnion("origem_registro", [
  autoPayloadSchema.extend({ id: uuid }),
  manualPayloadSchema.extend({ id: uuid }),
]);

export const processamentoStatusSchema = z.object({
  ausencia_id: uuid,
  novo_status: z.enum(["AGUARDANDO", "EM_PROCESSAMENTO", "PROCESSADO"]),
  observacao: z.string().trim().max(1000).nullable().optional(),
});

export const iniciarProcessamentoSchema = z.object({ ausencia_id: uuid });

export const iniciarGrupoSchema = z.object({ 
  colaborador_id: uuid.nullable().optional(),
  colaborador_matricula: z.string().optional(),
  projeto_id: uuid 
});

export const concluirProcessamentoSchema = z.object({
  ausencia_id: uuid,
  observacao: z.string().trim().max(1000).nullable().optional(),
});

export const reatribuirProcessamentoSchema = z.object({
  ausencia_id: uuid,
  responsavel_anterior_id: uuid,
});
