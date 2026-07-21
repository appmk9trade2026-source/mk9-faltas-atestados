
-- =====================================================================
-- FASE B: Consolidação de projetos duplicados
-- =====================================================================
-- - preview_consolidar_projetos(principal, duplicado) -> jsonb (comparação + contagens + conflitos)
-- - consolidar_projetos(principal, duplicado, motivo)  -> jsonb (relatório de transferência)
-- Regra: nunca exclui projeto duplicado. Apenas arquiva (ativo=false).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.preview_consolidar_projetos(
  p_principal_id uuid,
  p_duplicado_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_principal record;
  v_duplicado record;
  v_result jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_usuario_conflitos int := 0;
  v_protocolo_conflitos int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role) OR
    public.has_role(v_uid, 'rh'::app_role)
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: sem permissão para consolidar projetos';
  END IF;

  IF p_principal_id = p_duplicado_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: projeto principal e duplicado devem ser diferentes';
  END IF;

  SELECT p.*, e.nome AS empresa_nome, e.cnpj AS empresa_cnpj
  INTO v_principal
  FROM public.projetos p
  JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.id = p_principal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: projeto principal não encontrado';
  END IF;

  SELECT p.*, e.nome AS empresa_nome, e.cnpj AS empresa_cnpj
  INTO v_duplicado
  FROM public.projetos p
  JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.id = p_duplicado_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: projeto duplicado não encontrado';
  END IF;

  IF v_principal.empresa_id <> v_duplicado.empresa_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: projetos precisam pertencer à mesma empresa';
  END IF;

  -- Conflitos: usuário vinculado aos dois projetos (será removido do duplicado)
  SELECT count(*) INTO v_usuario_conflitos
  FROM public.usuario_projetos up_d
  WHERE up_d.projeto_id = p_duplicado_id
    AND EXISTS (
      SELECT 1 FROM public.usuario_projetos up_p
      WHERE up_p.projeto_id = p_principal_id AND up_p.user_id = up_d.user_id
    );

  -- Conflitos: mesma sequência de protocolo (ano) nos dois — será mesclado (max)
  SELECT count(*) INTO v_protocolo_conflitos
  FROM public.projeto_protocolo_sequencias s_d
  WHERE s_d.projeto_id = p_duplicado_id
    AND EXISTS (
      SELECT 1 FROM public.projeto_protocolo_sequencias s_p
      WHERE s_p.projeto_id = p_principal_id AND s_p.ano = s_d.ano
    );

  IF v_usuario_conflitos > 0 THEN
    v_conflitos := v_conflitos || jsonb_build_array(jsonb_build_object(
      'tipo', 'usuario_vinculado_em_ambos',
      'quantidade', v_usuario_conflitos,
      'resolucao', 'vinculo do duplicado será removido; permanece o vinculo do principal'
    ));
  END IF;
  IF v_protocolo_conflitos > 0 THEN
    v_conflitos := v_conflitos || jsonb_build_array(jsonb_build_object(
      'tipo', 'sequencia_protocolo_mesmo_ano',
      'quantidade', v_protocolo_conflitos,
      'resolucao', 'ultimo_numero será o máximo entre os dois; sequência do duplicado será removida'
    ));
  END IF;

  v_result := jsonb_build_object(
    'empresa', jsonb_build_object(
      'id', v_principal.empresa_id,
      'nome', v_principal.empresa_nome,
      'cnpj', v_principal.empresa_cnpj
    ),
    'principal', jsonb_build_object(
      'id', v_principal.id,
      'nome', v_principal.nome,
      'codigo_interno', v_principal.codigo_interno,
      'codigo_projeto', v_principal.codigo_projeto,
      'codigo_protocolo', v_principal.codigo_protocolo,
      'descricao', v_principal.descricao,
      'observacoes', v_principal.observacoes,
      'ativo', v_principal.ativo,
      'data_inicio', v_principal.data_inicio,
      'data_fim', v_principal.data_fim,
      'created_at', v_principal.created_at,
      'updated_at', v_principal.updated_at,
      'vinculos', jsonb_build_object(
        'colaboradores', (SELECT count(*) FROM public.colaboradores WHERE projeto_id = p_principal_id),
        'ausencias',     (SELECT count(*) FROM public.ausencias     WHERE projeto_id = p_principal_id),
        'atestados',     (SELECT count(*) FROM public.ausencias     WHERE projeto_id = p_principal_id AND arquivo_url IS NOT NULL),
        'protocolos',    (SELECT count(*) FROM public.ausencias     WHERE projeto_id = p_principal_id AND protocolo    IS NOT NULL),
        'alertas',       (SELECT count(*) FROM public.alertas       WHERE projeto_id = p_principal_id),
        'usuarios',      (SELECT count(*) FROM public.usuario_projetos WHERE projeto_id = p_principal_id),
        'ai_conversations',       (SELECT count(*) FROM public.ai_conversations WHERE projeto_id = p_principal_id),
        'comunicacoes',           (SELECT count(*) FROM public.comunicacoes WHERE projeto_id = p_principal_id),
        'automacao_config',       (SELECT count(*) FROM public.automacao_config WHERE projeto_id = p_principal_id),
        'notificacoes',           (SELECT count(*) FROM public.notificacoes WHERE projeto_id = p_principal_id),
        'protocolo_sequencias',   (SELECT count(*) FROM public.projeto_protocolo_sequencias WHERE projeto_id = p_principal_id)
      )
    ),
    'duplicado', jsonb_build_object(
      'id', v_duplicado.id,
      'nome', v_duplicado.nome,
      'codigo_interno', v_duplicado.codigo_interno,
      'codigo_projeto', v_duplicado.codigo_projeto,
      'codigo_protocolo', v_duplicado.codigo_protocolo,
      'descricao', v_duplicado.descricao,
      'observacoes', v_duplicado.observacoes,
      'ativo', v_duplicado.ativo,
      'data_inicio', v_duplicado.data_inicio,
      'data_fim', v_duplicado.data_fim,
      'created_at', v_duplicado.created_at,
      'updated_at', v_duplicado.updated_at,
      'vinculos', jsonb_build_object(
        'colaboradores', (SELECT count(*) FROM public.colaboradores WHERE projeto_id = p_duplicado_id),
        'ausencias',     (SELECT count(*) FROM public.ausencias     WHERE projeto_id = p_duplicado_id),
        'atestados',     (SELECT count(*) FROM public.ausencias     WHERE projeto_id = p_duplicado_id AND arquivo_url IS NOT NULL),
        'protocolos',    (SELECT count(*) FROM public.ausencias     WHERE projeto_id = p_duplicado_id AND protocolo    IS NOT NULL),
        'alertas',       (SELECT count(*) FROM public.alertas       WHERE projeto_id = p_duplicado_id),
        'usuarios',      (SELECT count(*) FROM public.usuario_projetos WHERE projeto_id = p_duplicado_id),
        'ai_conversations',       (SELECT count(*) FROM public.ai_conversations WHERE projeto_id = p_duplicado_id),
        'comunicacoes',           (SELECT count(*) FROM public.comunicacoes WHERE projeto_id = p_duplicado_id),
        'automacao_config',       (SELECT count(*) FROM public.automacao_config WHERE projeto_id = p_duplicado_id),
        'notificacoes',           (SELECT count(*) FROM public.notificacoes WHERE projeto_id = p_duplicado_id),
        'protocolo_sequencias',   (SELECT count(*) FROM public.projeto_protocolo_sequencias WHERE projeto_id = p_duplicado_id)
      )
    ),
    'conflitos', v_conflitos,
    'gerado_em', now()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_consolidar_projetos(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_consolidar_projetos(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- EXECUÇÃO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consolidar_projetos(
  p_principal_id uuid,
  p_duplicado_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_principal record;
  v_duplicado record;
  v_correlation text := gen_random_uuid()::text;
  v_transferencias jsonb := '{}'::jsonb;
  v_removidos_usuario int := 0;
  v_mesclados_protocolo int := 0;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role) OR
    public.has_role(v_uid, 'rh'::app_role)
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: sem permissão para consolidar projetos';
  END IF;

  IF p_principal_id = p_duplicado_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: projeto principal e duplicado devem ser diferentes';
  END IF;

  -- Lock ambos os projetos (ordem estável para evitar deadlock)
  IF p_principal_id < p_duplicado_id THEN
    SELECT * INTO v_principal FROM public.projetos WHERE id = p_principal_id FOR UPDATE;
    SELECT * INTO v_duplicado FROM public.projetos WHERE id = p_duplicado_id FOR UPDATE;
  ELSE
    SELECT * INTO v_duplicado FROM public.projetos WHERE id = p_duplicado_id FOR UPDATE;
    SELECT * INTO v_principal FROM public.projetos WHERE id = p_principal_id FOR UPDATE;
  END IF;

  IF v_principal.id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: projeto principal não encontrado';
  END IF;
  IF v_duplicado.id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: projeto duplicado não encontrado';
  END IF;
  IF v_principal.empresa_id <> v_duplicado.empresa_id THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: projetos precisam pertencer à mesma empresa';
  END IF;

  -- 1) colaboradores
  UPDATE public.colaboradores SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('colaboradores', v_n);

  -- 2) ausencias (inclui atestados e protocolos históricos)
  UPDATE public.ausencias SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('ausencias', v_n);

  -- 3) alertas
  UPDATE public.alertas SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('alertas', v_n);

  -- 4) usuario_projetos (conflitos: remover duplicado, manter principal)
  DELETE FROM public.usuario_projetos up_d
    WHERE up_d.projeto_id = p_duplicado_id
      AND EXISTS (
        SELECT 1 FROM public.usuario_projetos up_p
        WHERE up_p.projeto_id = p_principal_id AND up_p.user_id = up_d.user_id
      );
  GET DIAGNOSTICS v_removidos_usuario = ROW_COUNT;
  UPDATE public.usuario_projetos SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object(
    'usuario_projetos_transferidos', v_n,
    'usuario_projetos_conflitos_removidos', v_removidos_usuario
  );

  -- 5) ai_conversations
  UPDATE public.ai_conversations SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('ai_conversations', v_n);

  -- 6) comunicacoes
  UPDATE public.comunicacoes SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('comunicacoes', v_n);

  -- 7) automacao_config
  UPDATE public.automacao_config SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('automacao_config', v_n);

  -- 8) notificacoes
  UPDATE public.notificacoes SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object('notificacoes', v_n);

  -- 9) projeto_protocolo_sequencias (merge por ano; mantém máximo)
  WITH conflitos AS (
    SELECT s_d.ano, s_d.ultimo_numero AS n_dup, s_p.ultimo_numero AS n_prin
    FROM public.projeto_protocolo_sequencias s_d
    JOIN public.projeto_protocolo_sequencias s_p
      ON s_p.projeto_id = p_principal_id AND s_p.ano = s_d.ano
    WHERE s_d.projeto_id = p_duplicado_id
  ),
  upd AS (
    UPDATE public.projeto_protocolo_sequencias s
    SET ultimo_numero = GREATEST(s.ultimo_numero, c.n_dup),
        updated_at = now()
    FROM conflitos c
    WHERE s.projeto_id = p_principal_id AND s.ano = c.ano
    RETURNING 1
  )
  SELECT count(*) INTO v_mesclados_protocolo FROM upd;
  DELETE FROM public.projeto_protocolo_sequencias
    WHERE projeto_id = p_duplicado_id
      AND ano IN (
        SELECT ano FROM public.projeto_protocolo_sequencias
        WHERE projeto_id = p_principal_id
      );
  UPDATE public.projeto_protocolo_sequencias SET projeto_id = p_principal_id
    WHERE projeto_id = p_duplicado_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_transferencias := v_transferencias || jsonb_build_object(
    'protocolo_sequencias_transferidas', v_n,
    'protocolo_sequencias_mescladas', v_mesclados_protocolo
  );

  -- Arquiva o duplicado (nunca excluir fisicamente)
  UPDATE public.projetos
  SET ativo = false,
      observacoes = COALESCE(observacoes, '')
        || CASE WHEN COALESCE(observacoes, '') = '' THEN '' ELSE E'\n' END
        || '[CONSOLIDADO em ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
        || '] Vínculos transferidos para o projeto ' || v_principal.nome
        || ' (id=' || p_principal_id::text || '). Motivo: '
        || COALESCE(NULLIF(btrim(p_motivo), ''), 'não informado'),
      updated_at = now()
  WHERE id = p_duplicado_id;

  -- Auditoria (principal + duplicado)
  BEGIN
    PERFORM public.log_audit_event(
      _modulo := 'projetos',
      _acao := 'PROJETO_CONSOLIDADO_PRINCIPAL'::text,
      _entidade := 'Projeto',
      _registro_id := p_principal_id,
      _empresa_id := v_principal.empresa_id,
      _projeto_id := p_principal_id,
      _antes := to_jsonb(v_principal),
      _depois := jsonb_build_object('transferencias', v_transferencias, 'duplicado_id', p_duplicado_id),
      _sucesso := true,
      _observacoes := '[corr=' || v_correlation || '] Consolidação recebida do duplicado ' || v_duplicado.nome,
      _origem := 'rpc'
    );
    PERFORM public.log_audit_event(
      _modulo := 'projetos',
      _acao := 'PROJETO_CONSOLIDADO_DUPLICADO'::text,
      _entidade := 'Projeto',
      _registro_id := p_duplicado_id,
      _empresa_id := v_duplicado.empresa_id,
      _projeto_id := p_duplicado_id,
      _antes := to_jsonb(v_duplicado),
      _depois := jsonb_build_object(
        'arquivado', true,
        'principal_id', p_principal_id,
        'motivo', COALESCE(NULLIF(btrim(p_motivo), ''), 'não informado')
      ),
      _sucesso := true,
      _observacoes := '[corr=' || v_correlation || '] Arquivado; vínculos transferidos para ' || v_principal.nome,
      _origem := 'rpc'
    );
  EXCEPTION WHEN OTHERS THEN
    -- auditoria é best-effort para não bloquear a consolidação
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'correlation_id', v_correlation,
    'principal_id', p_principal_id,
    'duplicado_id', p_duplicado_id,
    'duplicado_arquivado', true,
    'transferencias', v_transferencias,
    'concluido_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consolidar_projetos(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consolidar_projetos(uuid, uuid, text) TO authenticated;
