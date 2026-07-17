
-- ============ TABLE ============
CREATE TABLE public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  matricula text NOT NULL,
  nome_completo text NOT NULL,
  cpf text,
  cargo text,
  telefone text,
  email text,
  data_admissao date,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.colaboradores TO authenticated;
GRANT ALL ON public.colaboradores TO service_role;

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

-- ============ INDEXES ============
CREATE UNIQUE INDEX colaboradores_empresa_matricula_uidx
  ON public.colaboradores (empresa_id, matricula);
CREATE INDEX colaboradores_projeto_idx ON public.colaboradores (projeto_id);
CREATE INDEX colaboradores_ativo_idx ON public.colaboradores (ativo);
CREATE INDEX colaboradores_nome_idx ON public.colaboradores (lower(nome_completo));

-- ============ NORMALIZATION TRIGGER ============
CREATE OR REPLACE FUNCTION public.tg_colaboradores_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.matricula := btrim(NEW.matricula);
  NEW.nome_completo := regexp_replace(btrim(NEW.nome_completo), '\s+', ' ', 'g');
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;
  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF NEW.cpf = '' THEN NEW.cpf := NULL; END IF;
  END IF;
  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := regexp_replace(NEW.telefone, '\D', '', 'g');
    IF NEW.telefone = '' THEN NEW.telefone := NULL; END IF;
  END IF;
  IF NEW.cargo IS NOT NULL THEN
    NEW.cargo := btrim(NEW.cargo);
    IF NEW.cargo = '' THEN NEW.cargo := NULL; END IF;
  END IF;
  IF NEW.observacoes IS NOT NULL THEN
    IF btrim(NEW.observacoes) = '' THEN NEW.observacoes := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_colaboradores_normalize_biu
BEFORE INSERT OR UPDATE ON public.colaboradores
FOR EACH ROW EXECUTE FUNCTION public.tg_colaboradores_normalize();

-- ============ VALIDATION TRIGGER ============
CREATE OR REPLACE FUNCTION public.tg_colaboradores_valida_vinculo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_empresa_ativa boolean;
  v_projeto_ativo boolean;
  v_projeto_empresa uuid;
BEGIN
  SELECT empresa_id, ativo INTO v_projeto_empresa, v_projeto_ativo
  FROM public.projetos WHERE id = NEW.projeto_id;

  IF v_projeto_empresa IS NULL THEN
    RAISE EXCEPTION 'Projeto não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_projeto_empresa <> NEW.empresa_id THEN
    RAISE EXCEPTION 'O projeto selecionado não pertence à empresa informada.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.ativo = true THEN
    IF TG_OP = 'INSERT'
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.projeto_id IS DISTINCT FROM OLD.projeto_id
       OR OLD.ativo = false THEN
      SELECT ativo INTO v_empresa_ativa FROM public.empresas WHERE id = NEW.empresa_id;
      IF v_empresa_ativa IS NULL THEN
        RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF v_empresa_ativa = false THEN
        RAISE EXCEPTION 'Não é possível manter o colaborador ativo: a empresa está inativa.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_projeto_ativo = false THEN
        RAISE EXCEPTION 'Não é possível manter o colaborador ativo: o projeto está inativo.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_colaboradores_valida_vinculo_biu
BEFORE INSERT OR UPDATE ON public.colaboradores
FOR EACH ROW EXECUTE FUNCTION public.tg_colaboradores_valida_vinculo();

-- ============ UPDATED_AT ============
CREATE TRIGGER tg_colaboradores_updated_at
BEFORE UPDATE ON public.colaboradores
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RLS POLICIES ============
-- Super Admin: full access
CREATE POLICY "colaboradores_super_admin_select" ON public.colaboradores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "colaboradores_super_admin_insert" ON public.colaboradores
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "colaboradores_super_admin_update" ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RH: full access
CREATE POLICY "colaboradores_rh_select" ON public.colaboradores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'rh'));
CREATE POLICY "colaboradores_rh_insert" ON public.colaboradores
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'rh'));
CREATE POLICY "colaboradores_rh_update" ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'rh'))
  WITH CHECK (public.has_role(auth.uid(), 'rh'));

-- Supervisor: only active
CREATE POLICY "colaboradores_supervisor_select_ativos" ON public.colaboradores
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor') AND ativo = true);

-- Compliance: read all (consulta/auditoria)
CREATE POLICY "colaboradores_compliance_select" ON public.colaboradores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'compliance'));

-- No DELETE policy => DELETE is denied for everyone.

-- ============ REUSABLE RPC ============
CREATE OR REPLACE FUNCTION public.get_colaboradores_ativos(
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _busca text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome_completo text,
  matricula text,
  empresa_id uuid,
  projeto_id uuid,
  cargo text
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id, c.nome_completo, c.matricula, c.empresa_id, c.projeto_id, c.cargo
  FROM public.colaboradores c
  WHERE c.ativo = true
    AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
    AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id)
    AND (
      _busca IS NULL OR _busca = '' OR
      c.nome_completo ILIKE '%' || _busca || '%' OR
      c.matricula ILIKE '%' || _busca || '%' OR
      coalesce(c.cpf,'') ILIKE '%' || regexp_replace(_busca, '\D', '', 'g') || '%'
    )
  ORDER BY c.nome_completo ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_colaboradores_ativos(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_colaboradores_ativos(uuid, uuid, text) TO authenticated;
