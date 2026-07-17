
-- ============ ENUMS ============
CREATE TYPE public.tipo_ausencia AS ENUM ('FALTA','ATESTADO','DECLARACAO','SUSPENSAO','OUTROS');
CREATE TYPE public.status_ausencia AS ENUM ('PENDENTE','LANCADO');

-- ============ TABLE ============
CREATE TABLE public.ausencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE RESTRICT,
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  tipo public.tipo_ausencia NOT NULL,
  motivo text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dias integer NOT NULL DEFAULT 1,
  possui_anexo boolean NOT NULL DEFAULT false,
  arquivo_url text,
  arquivo_nome text,
  arquivo_mime text,
  arquivo_tamanho integer,
  arquivo_criado_por uuid,
  arquivo_criado_em timestamptz,
  status public.status_ausencia NOT NULL DEFAULT 'PENDENTE',
  observacoes text,
  registrado_por uuid,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  lancado_por uuid,
  lancado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ausencias TO authenticated;
GRANT ALL ON public.ausencias TO service_role;

ALTER TABLE public.ausencias ENABLE ROW LEVEL SECURITY;

-- ============ INDEXES ============
CREATE INDEX ausencias_empresa_idx ON public.ausencias (empresa_id);
CREATE INDEX ausencias_projeto_idx ON public.ausencias (projeto_id);
CREATE INDEX ausencias_colaborador_idx ON public.ausencias (colaborador_id);
CREATE INDEX ausencias_status_idx ON public.ausencias (status);
CREATE INDEX ausencias_data_inicio_idx ON public.ausencias (data_inicio);
CREATE INDEX ausencias_tipo_idx ON public.ausencias (tipo);

-- ============ VALIDATION + AUTOFILL TRIGGER ============
CREATE OR REPLACE FUNCTION public.tg_ausencias_valida()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_empresa_ativa boolean;
  v_projeto_empresa uuid;
  v_projeto_ativo boolean;
  v_colab_empresa uuid;
  v_colab_projeto uuid;
  v_colab_ativo boolean;
BEGIN
  -- Datas
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data final não pode ser anterior à data inicial.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.dias := (NEW.data_fim - NEW.data_inicio) + 1;
  IF NEW.dias < 1 THEN NEW.dias := 1; END IF;

  -- Coerência do anexo
  IF NEW.arquivo_url IS NULL OR btrim(NEW.arquivo_url) = '' THEN
    NEW.possui_anexo := false;
    NEW.arquivo_url := NULL;
    NEW.arquivo_nome := NULL;
    NEW.arquivo_mime := NULL;
    NEW.arquivo_tamanho := NULL;
  ELSE
    NEW.possui_anexo := true;
  END IF;

  -- Vínculos
  SELECT empresa_id, ativo INTO v_projeto_empresa, v_projeto_ativo
  FROM public.projetos WHERE id = NEW.projeto_id;
  IF v_projeto_empresa IS NULL THEN
    RAISE EXCEPTION 'Projeto não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_projeto_empresa <> NEW.empresa_id THEN
    RAISE EXCEPTION 'O projeto selecionado não pertence à empresa informada.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT empresa_id, projeto_id, ativo
    INTO v_colab_empresa, v_colab_projeto, v_colab_ativo
  FROM public.colaboradores WHERE id = NEW.colaborador_id;
  IF v_colab_empresa IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_colab_empresa <> NEW.empresa_id OR v_colab_projeto <> NEW.projeto_id THEN
    RAISE EXCEPTION 'O colaborador não pertence à empresa e projeto informados.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ao inserir: exige tudo ativo
  IF TG_OP = 'INSERT' THEN
    SELECT ativo INTO v_empresa_ativa FROM public.empresas WHERE id = NEW.empresa_id;
    IF v_empresa_ativa IS NOT TRUE THEN
      RAISE EXCEPTION 'A empresa está inativa.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_projeto_ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'O projeto está inativo.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_colab_ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'O colaborador está inativo.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.registrado_por IS NULL THEN
      NEW.registrado_por := auth.uid();
    END IF;
    IF NEW.registrado_em IS NULL THEN
      NEW.registrado_em := now();
    END IF;
    -- Sempre nasce como PENDENTE
    NEW.status := COALESCE(NEW.status, 'PENDENTE');
    IF NEW.status = 'LANCADO' THEN
      NEW.lancado_por := COALESCE(NEW.lancado_por, auth.uid());
      NEW.lancado_em := COALESCE(NEW.lancado_em, now());
    END IF;
  ELSE
    -- UPDATE: preserva registrado_por/em; se virou LANCADO agora, carimba
    NEW.registrado_por := OLD.registrado_por;
    NEW.registrado_em := OLD.registrado_em;
    IF NEW.status = 'LANCADO' AND OLD.status <> 'LANCADO' THEN
      NEW.lancado_por := COALESCE(NEW.lancado_por, auth.uid());
      NEW.lancado_em := COALESCE(NEW.lancado_em, now());
    ELSIF NEW.status = 'PENDENTE' AND OLD.status = 'LANCADO' THEN
      -- reversão: limpa marcação
      NEW.lancado_por := NULL;
      NEW.lancado_em := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_ausencias_valida_biu
BEFORE INSERT OR UPDATE ON public.ausencias
FOR EACH ROW EXECUTE FUNCTION public.tg_ausencias_valida();

CREATE TRIGGER tg_ausencias_updated_at
BEFORE UPDATE ON public.ausencias
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RLS POLICIES ============
-- Super Admin
CREATE POLICY "ausencias_super_admin_select" ON public.ausencias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ausencias_super_admin_insert" ON public.ausencias
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ausencias_super_admin_update" ON public.ausencias
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RH
CREATE POLICY "ausencias_rh_select" ON public.ausencias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'rh'));
CREATE POLICY "ausencias_rh_insert" ON public.ausencias
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'rh'));
CREATE POLICY "ausencias_rh_update" ON public.ausencias
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'rh'))
  WITH CHECK (public.has_role(auth.uid(), 'rh'));

-- Supervisor: pode cadastrar e consultar
CREATE POLICY "ausencias_supervisor_select" ON public.ausencias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "ausencias_supervisor_insert" ON public.ausencias
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- Compliance: apenas consulta
CREATE POLICY "ausencias_compliance_select" ON public.ausencias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'compliance'));

-- Nenhuma policy de DELETE => exclusão bloqueada para todos.
