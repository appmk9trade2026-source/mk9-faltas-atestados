import { supabase } from "@/integrations/supabase/client";

export const TIPO_AUSENCIA = ["FALTA", "ATESTADO", "DECLARACAO", "SUSPENSAO", "OUTROS"] as const;
export type TipoAusencia = (typeof TIPO_AUSENCIA)[number];

export const STATUS_AUSENCIA = ["PENDENTE", "LANCADO"] as const;
export type StatusAusencia = (typeof STATUS_AUSENCIA)[number];

export const TIPO_LABEL: Record<TipoAusencia, string> = {
  FALTA: "Falta",
  ATESTADO: "Atestado",
  DECLARACAO: "Declaração",
  SUSPENSAO: "Suspensão",
  OUTROS: "Outros",
};

export const ARQUIVO_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;
export const BUCKET_ATESTADOS = "atestados";

export function isTipoAusencia(v: string): v is TipoAusencia {
  return (TIPO_AUSENCIA as readonly string[]).includes(v);
}

export async function getSignedAtestadoUrl(path: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_ATESTADOS)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
