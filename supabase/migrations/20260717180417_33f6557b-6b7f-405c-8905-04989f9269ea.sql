
-- Enums
DO $$ BEGIN
  CREATE TYPE public.canal_comunicacao AS ENUM ('EMAIL','WHATSAPP','SMS','INTERNO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.status_comunicacao AS ENUM ('RASCUNHO','APROVADO','ENVIADO','ERRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE IF NOT EXISTS public.comunicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ausencia_id uuid NOT NULL REFERENCES public.ausencias(id) ON DELETE RESTRICT,
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  tipo public.canal_comunicacao NOT NULL,
  status public.status_comunicacao NOT NULL DEFAULT 'RASCUNHO',
  assunto text,
  mensagem text NOT NULL,
  destinatario text NOT NULL,
  erro text,
  criado_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  enviado_por uuid,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.comunicacoes TO authenticated;
GRANT ALL ON public.comunicacoes TO service_role;

ALTER TABLE public.comunicacoes ENABLE ROW LEVEL SECURITY;

-- RLS
DROP POLICY IF EXISTS "comunicacoes_select" ON public.comunicacoes;
CREATE POLICY "comunicacoes_select" ON public.comunicacoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'rh')
    OR public.has_role(auth.uid(),'supervisor')
    OR public.has_role(auth.uid(),'compliance')
  );

DROP POLICY IF EXISTS "comunicacoes_insert" ON public.comunicacoes;
CREATE POLICY "comunicacoes_insert" ON public.comunicacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')
  );

DROP POLICY IF EXISTS "comunicacoes_update" ON public.comunicacoes;
CREATE POLICY "comunicacoes_update" ON public.comunicacoes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')
  );

-- Nunca DELETE (nenhuma policy)

-- Trigger: bloqueia DELETE, bloqueia alteração após ENVIADO, gerencia auditoria
CREATE OR REPLACE FUNCTION public.tg_comunicacoes_biu()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := COALESCE(NEW.criado_por, auth.uid());
    IF NEW.status = 'APROVADO' THEN
      NEW.aprovado_por := COALESCE(NEW.aprovado_por, auth.uid());
      NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());
    END IF;
    IF NEW.status = 'ENVIADO' THEN
      NEW.enviado_por := COALESCE(NEW.enviado_por, auth.uid());
      NEW.enviado_em := COALESCE(NEW.enviado_em, now());
    END IF;
    IF btrim(COALESCE(NEW.mensagem,'')) = '' THEN
      RAISE EXCEPTION 'Mensagem obrigatória.' USING ERRCODE='check_violation';
    END IF;
    IF btrim(COALESCE(NEW.destinatario,'')) = '' THEN
      RAISE EXCEPTION 'Destinatário obrigatório.' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.status = 'ENVIADO' THEN
      RAISE EXCEPTION 'Comunicação enviada não pode ser alterada.' USING ERRCODE='check_violation';
    END IF;
    -- Preserva auditoria de criação
    NEW.criado_por := OLD.criado_por;
    NEW.created_at := OLD.created_at;
    -- Transições
    IF NEW.status = 'APROVADO' AND OLD.status <> 'APROVADO' THEN
      NEW.aprovado_por := COALESCE(NEW.aprovado_por, auth.uid());
      NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());
    END IF;
    IF NEW.status = 'ENVIADO' AND OLD.status <> 'ENVIADO' THEN
      NEW.enviado_por := COALESCE(NEW.enviado_por, auth.uid());
      NEW.enviado_em := COALESCE(NEW.enviado_em, now());
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tg_comunicacoes_biu ON public.comunicacoes;
CREATE TRIGGER tg_comunicacoes_biu
BEFORE INSERT OR UPDATE ON public.comunicacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_comunicacoes_biu();

CREATE OR REPLACE FUNCTION public.tg_comunicacoes_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Comunicações não podem ser excluídas.' USING ERRCODE='check_violation';
END;
$$;

DROP TRIGGER IF EXISTS tg_comunicacoes_no_delete ON public.comunicacoes;
CREATE TRIGGER tg_comunicacoes_no_delete
BEFORE DELETE ON public.comunicacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_comunicacoes_no_delete();

CREATE INDEX IF NOT EXISTS idx_comunicacoes_ausencia ON public.comunicacoes(ausencia_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_colaborador ON public.comunicacoes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_status ON public.comunicacoes(status);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_created_at ON public.comunicacoes(created_at DESC);
