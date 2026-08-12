-- CRM MK9 — PLANO DE AÇÃO GERENCIAL
-- RESPONSÁVEL PELO PLANO — INCLUIR COORDENAÇÃO DO PROJETO

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'responsavel_plano_tipo') THEN
        CREATE TYPE public.responsavel_plano_tipo AS ENUM ('USUARIO', 'COORDENACAO');
    END IF;
END $$;

ALTER TABLE public.planos_acao 
ADD COLUMN IF NOT EXISTS responsavel_tipo public.responsavel_plano_tipo DEFAULT 'USUARIO',
ADD COLUMN IF NOT EXISTS responsavel_coordenacao_id uuid;

UPDATE public.planos_acao 
SET responsavel_tipo = 'USUARIO' 
WHERE responsavel_tipo IS NULL;

ALTER TABLE public.planos_acao ALTER COLUMN responsavel_usuario_id DROP NOT NULL;

ALTER TABLE public.planos_acao DROP CONSTRAINT IF EXISTS planos_acao_responsavel_check;
ALTER TABLE public.planos_acao ADD CONSTRAINT planos_acao_responsavel_check 
CHECK (
    (responsavel_tipo = 'USUARIO' AND responsavel_usuario_id IS NOT NULL AND responsavel_coordenacao_id IS NULL) OR
    (responsavel_tipo = 'COORDENACAO' AND responsavel_coordenacao_id IS NOT NULL AND responsavel_usuario_id IS NULL)
);

GRANT SELECT, INSERT, UPDATE ON public.planos_acao TO authenticated;
GRANT ALL ON public.planos_acao TO service_role;
