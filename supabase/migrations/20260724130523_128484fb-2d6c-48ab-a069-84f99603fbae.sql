
-- ============================================================
-- Etapa 2 — Gestão de Coordenação (backend)
-- ============================================================

-- 1) Novos eventos de auditoria.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'COORDENADOR_VINCULADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'COORDENADOR_ALTERADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'COORDENADOR_DESVINCULADO';

-- 2) Guarda de papel: quem pode ler/gerenciar a estrutura.
--    Leitura E escrita restritas a super_admin e RH (spec Etapa 2).
CREATE OR REPLACE FUNCTION public.coordenacao_pode_gerenciar(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin'::app_role, 'rh'::app_role)
  );
$$;
REVOKE ALL ON FUNCTION public.coordenacao_pode_gerenciar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_pode_gerenciar(uuid) TO authenticated;

-- 3) Painel (KPIs).
CREATE OR REPLACE FUNCTION public.coordenacao_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.coordenacao_pode_gerenciar(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas Super Admin e RH podem acessar a Gestão de Coordenação'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_coordenadores', (
      SELECT count(*) FROM public.user_roles ur
      WHERE ur.role = 'coordenador'::app_role
    ),
    'total_supervisores', (
      SELECT count(*) FROM public.user_roles ur
      WHERE ur.role = 'supervisor'::app_role
    ),
    'supervisores_vinculados', (
      SELECT count(*) FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'::app_role
      WHERE p.coordenador_usuario_id IS NOT NULL
    ),
    'supervisores_sem_coordenador', (
      SELECT count(*) FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'::app_role
      WHERE p.coordenador_usuario_id IS NULL
    ),
    'colaboradores_cobertos', (
      SELECT count(*) FROM public.colaboradores c
      JOIN public.profiles ps ON ps.id = c.supervisor_usuario_id
      WHERE c.ativo = true
        AND ps.coordenador_usuario_id IS NOT NULL
    ),
    'ultima_alteracao', (
      SELECT max(created_at) FROM public.audit_logs
      WHERE acao IN ('COORDENADOR_VINCULADO','COORDENADOR_ALTERADO','COORDENADOR_DESVINCULADO')
    )
  ) INTO v_out;

  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.coordenacao_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_dashboard() TO authenticated;

-- 4) Lista de Coordenadores com contagens agregadas.
CREATE OR REPLACE FUNCTION public.coordenacao_listar_coordenadores()
RETURNS TABLE (
  coordenador_id uuid,
  nome text,
  email text,
  ativo boolean,
  supervisores_count bigint,
  colaboradores_count bigint,
  empresas jsonb,
  projetos jsonb,
  ultima_alteracao timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.coordenacao_pode_gerenciar(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas Super Admin e RH podem acessar a Gestão de Coordenação'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH coords AS (
    SELECT p.id, p.nome, p.email, p.ativo
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.role = 'coordenador'::app_role
  ),
  sups AS (
    SELECT ps.id AS supervisor_id, ps.coordenador_usuario_id
    FROM public.profiles ps
    JOIN public.user_roles ur ON ur.user_id = ps.id AND ur.role = 'supervisor'::app_role
    WHERE ps.coordenador_usuario_id IS NOT NULL
  ),
  colabs AS (
    SELECT c.id, c.supervisor_usuario_id, c.empresa_id, c.projeto_id
    FROM public.colaboradores c
    WHERE c.ativo = true
      AND c.supervisor_usuario_id IN (SELECT supervisor_id FROM sups)
  ),
  ult AS (
    SELECT (al.depois->>'coordenador_usuario_id')::uuid AS coord_id, max(al.created_at) AS ts
    FROM public.audit_logs al
    WHERE al.acao IN ('COORDENADOR_VINCULADO','COORDENADOR_ALTERADO','COORDENADOR_DESVINCULADO')
    GROUP BY 1
  )
  SELECT
    c.id,
    c.nome,
    c.email,
    c.ativo,
    (SELECT count(*) FROM sups s WHERE s.coordenador_usuario_id = c.id) AS supervisores_count,
    (SELECT count(*) FROM colabs cc
       JOIN sups s ON s.supervisor_id = cc.supervisor_usuario_id
       WHERE s.coordenador_usuario_id = c.id) AS colaboradores_count,
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', e.id, 'nome', e.nome))
      FROM colabs cc
      JOIN sups s ON s.supervisor_id = cc.supervisor_usuario_id
      JOIN public.empresas e ON e.id = cc.empresa_id
      WHERE s.coordenador_usuario_id = c.id
    ), '[]'::jsonb) AS empresas,
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', pr.id, 'nome', pr.nome))
      FROM colabs cc
      JOIN sups s ON s.supervisor_id = cc.supervisor_usuario_id
      JOIN public.projetos pr ON pr.id = cc.projeto_id
      WHERE s.coordenador_usuario_id = c.id
    ), '[]'::jsonb) AS projetos,
    (SELECT ts FROM ult u WHERE u.coord_id = c.id) AS ultima_alteracao
  FROM coords c
  ORDER BY c.nome NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.coordenacao_listar_coordenadores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_listar_coordenadores() TO authenticated;

-- 5) Supervisores de um Coordenador (para expandir a linha).
CREATE OR REPLACE FUNCTION public.coordenacao_supervisores_por_coordenador(_coord_id uuid)
RETURNS TABLE (
  supervisor_id uuid,
  nome text,
  email text,
  ativo boolean,
  colaboradores_count bigint,
  empresas jsonb,
  projetos jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.coordenacao_pode_gerenciar(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas Super Admin e RH podem acessar a Gestão de Coordenação'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ps.id,
    ps.nome,
    ps.email,
    ps.ativo,
    (SELECT count(*) FROM public.colaboradores c
       WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true) AS colaboradores_count,
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', e.id, 'nome', e.nome))
      FROM public.colaboradores c
      JOIN public.empresas e ON e.id = c.empresa_id
      WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', pr.id, 'nome', pr.nome))
      FROM public.colaboradores c
      JOIN public.projetos pr ON pr.id = c.projeto_id
      WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true
    ), '[]'::jsonb)
  FROM public.profiles ps
  JOIN public.user_roles ur ON ur.user_id = ps.id AND ur.role = 'supervisor'::app_role
  WHERE ps.coordenador_usuario_id = _coord_id
  ORDER BY ps.nome NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.coordenacao_supervisores_por_coordenador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_supervisores_por_coordenador(uuid) TO authenticated;

-- 6) Lista completa de Supervisores para a segunda tabela e filtros.
--    _vinculo: 'todos' | 'com' | 'sem'
CREATE OR REPLACE FUNCTION public.coordenacao_listar_supervisores(
  _vinculo text DEFAULT 'todos',
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _coordenador_id uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  supervisor_id uuid,
  nome text,
  email text,
  ativo boolean,
  coordenador_id uuid,
  coordenador_nome text,
  coordenador_email text,
  colaboradores_count bigint,
  empresa_principal_id uuid,
  empresa_principal_nome text,
  projeto_principal_id uuid,
  projeto_principal_nome text,
  matricula text,
  created_at timestamptz,
  total_registros bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_busca text := NULLIF(btrim(COALESCE(_busca, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.coordenacao_pode_gerenciar(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas Super Admin e RH podem acessar a Gestão de Coordenação'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      ps.id           AS supervisor_id,
      ps.nome,
      ps.email,
      ps.ativo,
      ps.coordenador_usuario_id AS coordenador_id,
      pc.nome         AS coordenador_nome,
      pc.email        AS coordenador_email,
      ps.created_at,
      (SELECT count(*) FROM public.colaboradores c
         WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true) AS colaboradores_count,
      -- Empresa / projeto "principal" = o com mais colaboradores ativos.
      (SELECT c.empresa_id FROM public.colaboradores c
         WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true
         GROUP BY c.empresa_id ORDER BY count(*) DESC NULLS LAST LIMIT 1) AS empresa_principal_id,
      (SELECT c.projeto_id FROM public.colaboradores c
         WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true
         GROUP BY c.projeto_id ORDER BY count(*) DESC NULLS LAST LIMIT 1) AS projeto_principal_id,
      -- Matrícula funcional do supervisor, se cadastrado como colaborador.
      (SELECT c.matricula FROM public.colaboradores c
         WHERE c.email IS NOT NULL AND lower(c.email) = lower(ps.email)
         LIMIT 1) AS matricula
    FROM public.profiles ps
    JOIN public.user_roles ur ON ur.user_id = ps.id AND ur.role = 'supervisor'::app_role
    LEFT JOIN public.profiles pc ON pc.id = ps.coordenador_usuario_id
    WHERE
      (_vinculo = 'todos'
        OR (_vinculo = 'com' AND ps.coordenador_usuario_id IS NOT NULL)
        OR (_vinculo = 'sem' AND ps.coordenador_usuario_id IS NULL))
      AND (_coordenador_id IS NULL OR ps.coordenador_usuario_id = _coordenador_id)
  ),
  filtered AS (
    SELECT
      b.*,
      e.nome AS empresa_principal_nome,
      pr.nome AS projeto_principal_nome
    FROM base b
    LEFT JOIN public.empresas e ON e.id = b.empresa_principal_id
    LEFT JOIN public.projetos pr ON pr.id = b.projeto_principal_id
    WHERE
      (_empresa_id IS NULL OR EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = b.supervisor_id AND c.empresa_id = _empresa_id AND c.ativo = true))
      AND (_projeto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = b.supervisor_id AND c.projeto_id = _projeto_id AND c.ativo = true))
      AND (
        v_busca IS NULL
        OR b.nome ILIKE '%' || v_busca || '%'
        OR b.email ILIKE '%' || v_busca || '%'
        OR COALESCE(b.matricula, '') ILIKE '%' || v_busca || '%'
      )
  ),
  counted AS (
    SELECT *, count(*) OVER () AS total_registros FROM filtered
  )
  SELECT
    supervisor_id, nome, email, ativo,
    coordenador_id, coordenador_nome, coordenador_email,
    colaboradores_count,
    empresa_principal_id, empresa_principal_nome,
    projeto_principal_id, projeto_principal_nome,
    matricula, created_at, total_registros
  FROM counted
  ORDER BY nome NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 500))
  OFFSET GREATEST(0, _offset);
END $$;
REVOKE ALL ON FUNCTION public.coordenacao_listar_supervisores(text,uuid,uuid,uuid,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_listar_supervisores(text,uuid,uuid,uuid,text,int,int) TO authenticated;

-- 7) Mutação única: vincular / trocar / remover.
--    _novo_coord_id = NULL  → remover vínculo.
--    O restante da lógica (self-link, alvo precisa ser coordenador, escopo
--    precisa ser supervisor) já é enforçado pela trigger da Etapa 1.
CREATE OR REPLACE FUNCTION public.coordenacao_definir_vinculo(
  _supervisor_id uuid,
  _novo_coord_id uuid,
  _observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_atual uuid;
  v_acao public.audit_action;
  v_audit_id uuid;
  v_sup_nome text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.coordenacao_pode_gerenciar(v_uid) THEN
    -- registra acesso negado e falha
    PERFORM public.log_audit_event(
      _modulo := 'coordenacao',
      _acao := 'ACESSO_NEGADO'::public.audit_action,
      _entidade := 'vinculo_coordenacao',
      _registro_id := _supervisor_id,
      _sucesso := false,
      _observacoes := 'Tentativa de alterar vínculo sem permissão',
      _origem := 'web'
    );
    RAISE EXCEPTION 'FORBIDDEN: apenas Super Admin e RH podem alterar vínculos de Coordenação'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.coordenador_usuario_id, p.nome
    INTO v_atual, v_sup_nome
    FROM public.profiles p
    WHERE p.id = _supervisor_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPERVISOR_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  -- Nenhuma mudança efetiva.
  IF v_atual IS NOT DISTINCT FROM _novo_coord_id THEN
    RETURN jsonb_build_object(
      'changed', false,
      'supervisor_id', _supervisor_id,
      'coordenador_id', v_atual
    );
  END IF;

  UPDATE public.profiles
     SET coordenador_usuario_id = _novo_coord_id
   WHERE id = _supervisor_id;

  IF v_atual IS NULL AND _novo_coord_id IS NOT NULL THEN
    v_acao := 'COORDENADOR_VINCULADO';
  ELSIF v_atual IS NOT NULL AND _novo_coord_id IS NULL THEN
    v_acao := 'COORDENADOR_DESVINCULADO';
  ELSE
    v_acao := 'COORDENADOR_ALTERADO';
  END IF;

  v_audit_id := public.log_audit_event(
    _modulo := 'coordenacao',
    _acao := v_acao,
    _entidade := 'vinculo_coordenacao',
    _registro_id := _supervisor_id,
    _antes := jsonb_build_object(
      'supervisor_id', _supervisor_id,
      'supervisor_nome', v_sup_nome,
      'coordenador_usuario_id', v_atual
    ),
    _depois := jsonb_build_object(
      'supervisor_id', _supervisor_id,
      'supervisor_nome', v_sup_nome,
      'coordenador_usuario_id', _novo_coord_id
    ),
    _sucesso := true,
    _observacoes := _observacoes,
    _origem := 'web'
  );

  RETURN jsonb_build_object(
    'changed', true,
    'supervisor_id', _supervisor_id,
    'coordenador_anterior', v_atual,
    'coordenador_novo', _novo_coord_id,
    'acao', v_acao::text,
    'audit_id', v_audit_id
  );
END $$;
REVOKE ALL ON FUNCTION public.coordenacao_definir_vinculo(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_definir_vinculo(uuid,uuid,text) TO authenticated;

-- 8) Combos auxiliares — Coordenadores disponíveis para escolha nos modais.
CREATE OR REPLACE FUNCTION public.coordenacao_listar_coordenadores_combo()
RETURNS TABLE (id uuid, nome text, email text, ativo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.coordenacao_pode_gerenciar(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome, p.email, p.ativo
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'coordenador'::app_role
   WHERE p.ativo = true
   ORDER BY p.nome NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.coordenacao_listar_coordenadores_combo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_listar_coordenadores_combo() TO authenticated;
