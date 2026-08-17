import { z } from "zod";

export const configSchema = z.object({
  environment: z.enum(['DISABLED', 'SANDBOX', 'PRODUCTION']),
  kill_switch_enabled: z.boolean(),
});

export const addRecipientSchema = z.object({
  label: z.string().min(1, "Label é obrigatório"),
  destination: z.string().min(8, "Número inválido"),
  environment: z.enum(["SANDBOX", "PRODUCTION"]),
  is_technical: z.boolean().refine(v => v === true, "Deve ser confirmado como técnico"),
  is_active_wa: z.boolean().refine(v => v === true, "Deve confirmar WhatsApp ativo"),
});
