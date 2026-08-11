-- 1. Add link column to ocorrencias_ponto if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ocorrencias_ponto' AND COLUMN_NAME = 'ausencia_id') THEN
        ALTER TABLE public.ocorrencias_ponto ADD COLUMN ausencia_id uuid REFERENCES public.ausencias(id);
    END IF;
END $$;

-- 2. Add justification metadata to ausencias for operational tracking
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ausencias' AND COLUMN_NAME = 'justificada_por_ocorrencia_id') THEN
        ALTER TABLE public.ausencias ADD COLUMN justificada_por_ocorrencia_id uuid REFERENCES public.ocorrencias_ponto(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ausencias' AND COLUMN_NAME = 'status_justificativa') THEN
        ALTER TABLE public.ausencias ADD COLUMN status_justificativa text;
    END IF;
END $$;

-- 3. Grants
GRANT SELECT, UPDATE ON public.ausencias TO authenticated;
GRANT SELECT, UPDATE ON public.ocorrencias_ponto TO authenticated;
GRANT ALL ON public.ausencias TO service_role;
GRANT ALL ON public.ocorrencias_ponto TO service_role;
