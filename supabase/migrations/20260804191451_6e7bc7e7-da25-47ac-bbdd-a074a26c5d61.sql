-- 1. Update status_ausencia enum
-- These must be committed before they can be used in views or functions in the same transaction
ALTER TYPE public.status_ausencia ADD VALUE IF NOT EXISTS 'SUBSTITUIDA';
ALTER TYPE public.status_ausencia ADD VALUE IF NOT EXISTS 'CANCELADO';

-- 2. Add columns to public.ausencias for traceability
ALTER TABLE public.ausencias
ADD COLUMN IF NOT EXISTS substituida_por_ausencia_id UUID REFERENCES public.ausencias(id),
ADD COLUMN IF NOT EXISTS substituida_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS substituida_por_usuario_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS motivo_substituicao TEXT;
