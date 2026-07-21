
-- Adiciona campos opcionais em projetos para suportar importação por planilha
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS observacoes text;

ALTER TABLE public.projetos
  DROP CONSTRAINT IF EXISTS projetos_datas_chk;
ALTER TABLE public.projetos
  ADD CONSTRAINT projetos_datas_chk
  CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio);

-- Novos valores no enum de auditoria para o ciclo de importação de projetos
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PROJETOS_IMPORTACAO_INICIADA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PROJETOS_IMPORTACAO_CONCLUIDA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PROJETOS_IMPORTACAO_FALHOU';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PROJETO_ATUALIZADO';
