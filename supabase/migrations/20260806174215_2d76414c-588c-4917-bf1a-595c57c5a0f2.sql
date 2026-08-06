ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS excluida_em timestamp with time zone;
ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS motivo_exclusao_categoria text;
ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS motivo_exclusao_detalhe text;
ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS excluidora_nome_snapshot text;
ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS excluidora_papel_snapshot text;
