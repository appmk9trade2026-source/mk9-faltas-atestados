
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primeiro_acesso_pendente boolean NOT NULL DEFAULT false;

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PRIMEIRO_ACESSO_CONCLUIDO';
