ALTER TABLE public.ocorrencias_ponto 
ADD COLUMN colaborador_manual BOOLEAN DEFAULT false,
ADD COLUMN manual_matricula TEXT,
ADD COLUMN manual_nome TEXT;

COMMENT ON COLUMN public.ocorrencias_ponto.colaborador_manual IS 'Indica se a ocorrência foi lançada manualmente quando o colaborador não estava na lista.';
COMMENT ON COLUMN public.ocorrencias_ponto.manual_matricula IS 'Matrícula informada no lançamento manual.';
COMMENT ON COLUMN public.ocorrencias_ponto.manual_nome IS 'Nome completo informado no lançamento manual.';

-- Garante acesso aos novos campos
GRANT SELECT, INSERT, UPDATE ON public.ocorrencias_ponto TO authenticated;
GRANT ALL ON public.ocorrencias_ponto TO service_role;