-- 1) Novos valores de auditoria
DO $$
BEGIN
  BEGIN ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'AUSENCIA_CRIADA_POR_SUPERVISOR'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'AUSENCIA_TENTATIVA_FORA_DO_ESCOPO'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PROJETO_ACESSO_NEGADO'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'COLABORADOR_ACESSO_NEGADO'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PERMISSAO_NEGADA'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

-- 2) Função auxiliar (SECURITY DEFINER, sem recursão em RLS)
CREATE OR REPLACE FUNCTION public.user_has_projeto(_user_id uuid, _projeto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_projetos up
    WHERE up.user_id = _user_id
      AND up.projeto_id = _projeto_id
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_projeto(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_projeto(uuid, uuid) TO authenticated;

-- 3) Projetos — Supervisor só vê os vinculados
DROP POLICY IF EXISTS "Supervisor vê projetos ativos" ON public.projetos;
CREATE POLICY "supervisor_projetos_scoped_select"
ON public.projetos FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::app_role)
  AND ativo = true
  AND public.user_has_projeto(auth.uid(), id)
);

-- 4) Colaboradores — Supervisor só vê os dos projetos vinculados
DROP POLICY IF EXISTS colaboradores_supervisor_select_ativos ON public.colaboradores;
CREATE POLICY colaboradores_supervisor_scoped_select
ON public.colaboradores FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::app_role)
  AND ativo = true
  AND projeto_id IS NOT NULL
  AND public.user_has_projeto(auth.uid(), projeto_id)
);

-- 5) Ausências — Supervisor SELECT apenas nos projetos vinculados
DROP POLICY IF EXISTS ausencias_supervisor_select ON public.ausencias;
CREATE POLICY ausencias_supervisor_scoped_select
ON public.ausencias FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::app_role)
  AND public.user_has_projeto(auth.uid(), projeto_id)
);

-- 6) Ausências — Supervisor INSERT apenas nos projetos vinculados,
--    e o próprio usuário deve ser o responsável pelo registro
DROP POLICY IF EXISTS ausencias_supervisor_insert ON public.ausencias;
CREATE POLICY ausencias_supervisor_scoped_insert
ON public.ausencias FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'supervisor'::app_role)
  AND projeto_id IS NOT NULL
  AND public.user_has_projeto(auth.uid(), projeto_id)
  AND (registrado_por IS NULL OR registrado_por = auth.uid())
);

-- 7) Trigger de escopo para toda inserção feita por supervisor
CREATE OR REPLACE FUNCTION public.tg_ausencia_supervisor_escopo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
  v_is_priv boolean;
  v_colab_projeto uuid;
  v_colab_empresa uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_supervisor := public.has_role(v_uid, 'supervisor'::app_role);
  v_is_priv := public.has_role(v_uid, 'super_admin'::app_role)
            OR public.has_role(v_uid, 'rh'::app_role);

  -- Sempre garante o responsável pelo lançamento
  IF NEW.registrado_por IS NULL THEN
    NEW.registrado_por := v_uid;
  END IF;

  -- Regras somente para supervisor não-privilegiado
  IF v_is_supervisor AND NOT v_is_priv THEN
    -- Não permitir mascarar responsável
    IF NEW.registrado_por <> v_uid THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','PERMISSAO_NEGADA','ausencia', NULL, false, 'trigger', v_uid,
              'Supervisor tentou definir registrado_por diferente do próprio usuário.');
      RAISE EXCEPTION 'Operação não permitida: responsável inválido.' USING ERRCODE = '42501';
    END IF;

    -- Projeto deve estar vinculado
    IF NEW.projeto_id IS NULL OR NOT public.user_has_projeto(v_uid, NEW.projeto_id) THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','PROJETO_ACESSO_NEGADO','projeto', NEW.projeto_id, false, 'trigger', v_uid,
              'Supervisor tentou registrar ausência em projeto fora do escopo.');
      RAISE EXCEPTION 'Você não tem acesso a este projeto.' USING ERRCODE = '42501';
    END IF;

    -- Colaborador deve pertencer ao projeto (e à empresa)
    SELECT projeto_id, empresa_id INTO v_colab_projeto, v_colab_empresa
    FROM public.colaboradores WHERE id = NEW.colaborador_id;

    IF v_colab_projeto IS NULL OR v_colab_projeto <> NEW.projeto_id
       OR (NEW.empresa_id IS NOT NULL AND v_colab_empresa <> NEW.empresa_id) THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','AUSENCIA_TENTATIVA_FORA_DO_ESCOPO','colaborador', NEW.colaborador_id, false, 'trigger', v_uid,
              'Colaborador não pertence ao projeto informado.');
      RAISE EXCEPTION 'Colaborador não pertence ao projeto informado.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
    VALUES ('ausencias','AUSENCIA_CRIADA_POR_SUPERVISOR','ausencia', NEW.id, true, 'trigger', v_uid,
            'Ausência criada por supervisor no escopo permitido.');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ausencia_supervisor_escopo ON public.ausencias;
CREATE TRIGGER tg_ausencia_supervisor_escopo
BEFORE INSERT ON public.ausencias
FOR EACH ROW EXECUTE FUNCTION public.tg_ausencia_supervisor_escopo();