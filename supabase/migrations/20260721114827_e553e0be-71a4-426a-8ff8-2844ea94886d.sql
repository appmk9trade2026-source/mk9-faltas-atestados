
-- RBAC Fase 3, Onda 2 — novos valores de auditoria para Empresas, Projetos e Colaboradores.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'EMPRESA_CRIADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'EMPRESA_CRIADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'EMPRESA_EDITADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'EMPRESA_EDITADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'EMPRESA_ATIVADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'EMPRESA_ATIVADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'EMPRESA_DESATIVADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'EMPRESA_DESATIVADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'PROJETO_CRIADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'PROJETO_CRIADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'PROJETO_EDITADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'PROJETO_EDITADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'PROJETO_ATIVADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'PROJETO_ATIVADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'PROJETO_DESATIVADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'PROJETO_DESATIVADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'PROJETO_CODIGO_ALTERADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'PROJETO_CODIGO_ALTERADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'PROJETO_CODIGO_ALTERACAO_NEGADA') THEN
    ALTER TYPE public.audit_action ADD VALUE 'PROJETO_CODIGO_ALTERACAO_NEGADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'COLABORADOR_CRIADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADOR_CRIADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'COLABORADOR_EDITADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADOR_EDITADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'COLABORADOR_ATIVADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADOR_ATIVADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'COLABORADOR_DESATIVADO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADOR_DESATIVADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'COLABORADOR_TRANSFERIDO') THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADOR_TRANSFERIDO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.audit_action'::regtype AND enumlabel = 'COLABORADORES_IMPORTADOS') THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADORES_IMPORTADOS';
  END IF;
END $$;
