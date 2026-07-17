
-- 1. Tabela
CREATE TABLE public.projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projetos_nome_nao_vazio CHECK (length(btrim(nome)) > 0)
);

GRANT SELECT, INSERT, UPDATE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;

-- 2. Normalização de nome (trim + colapso de espaços internos)
CREATE OR REPLACE FUNCTION public.tg_projetos_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nome := regexp_replace(btrim(NEW.nome), '\s+', ' ', 'g');
  RETURN NEW;
END;
$$;

CREATE TRIGGER projetos_normalize
  BEFORE INSERT OR UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_projetos_normalize();

-- 3. Unicidade (empresa_id + nome, case-insensitive)
CREATE UNIQUE INDEX projetos_empresa_nome_uidx
  ON public.projetos (empresa_id, lower(nome));

CREATE INDEX projetos_empresa_id_idx ON public.projetos (empresa_id);
CREATE INDEX projetos_ativo_idx ON public.projetos (ativo);

-- 4. Trigger updated_at
CREATE TRIGGER set_updated_at_projetos
  BEFORE UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. Regra: projeto ativo exige empresa ativa
CREATE OR REPLACE FUNCTION public.tg_projetos_valida_empresa_ativa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_empresa_ativa boolean;
BEGIN
  IF NEW.ativo = true THEN
    -- Só valida quando: novo registro ativo, mudou empresa, ou está ativando
    IF TG_OP = 'INSERT'
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR OLD.ativo = false THEN
      SELECT ativo INTO v_empresa_ativa FROM public.empresas WHERE id = NEW.empresa_id;
      IF v_empresa_ativa IS NULL THEN
        RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF v_empresa_ativa = false THEN
        RAISE EXCEPTION 'Não é possível manter o projeto ativo: a empresa está inativa. Ative a empresa primeiro.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projetos_valida_empresa
  BEFORE INSERT OR UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_projetos_valida_empresa_ativa();

-- 6. RLS
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;

-- Super Admin: tudo
CREATE POLICY "Super admin vê todos projetos" ON public.projetos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin insere projetos" ON public.projetos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin edita projetos" ON public.projetos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RH: visualiza todos, cria, edita
CREATE POLICY "RH vê todos projetos" ON public.projetos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'rh'));

CREATE POLICY "RH insere projetos" ON public.projetos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'rh'));

CREATE POLICY "RH edita projetos" ON public.projetos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'rh'))
  WITH CHECK (public.has_role(auth.uid(), 'rh'));

-- Supervisor: apenas ativos
CREATE POLICY "Supervisor vê projetos ativos" ON public.projetos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor') AND ativo = true);

-- Compliance: apenas ativos
CREATE POLICY "Compliance vê projetos ativos" ON public.projetos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance') AND ativo = true);

-- 7. Função reutilizável para dropdown dependente (uso futuro)
CREATE OR REPLACE FUNCTION public.get_projetos_ativos_por_empresa(_empresa_id uuid)
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.id, p.nome
  FROM public.projetos p
  WHERE p.empresa_id = _empresa_id
    AND p.ativo = true
  ORDER BY p.nome ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_projetos_ativos_por_empresa(uuid) TO authenticated;
