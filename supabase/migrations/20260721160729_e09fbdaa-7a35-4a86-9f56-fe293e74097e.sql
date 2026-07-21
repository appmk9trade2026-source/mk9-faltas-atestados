
CREATE OR REPLACE FUNCTION public.import_projetos_atomic(
  _rows jsonb,
  _correlation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_is_super  boolean;
  v_is_global boolean;
  v_started   timestamptz := clock_timestamp();
  v_total     int;
  v_created   int := 0;
  v_updated   int := 0;
  v_activated int := 0;
  v_deactivated int := 0;
  v_unchanged int := 0;
  v_errors    jsonb;
  v_needs_criar boolean := false;
  v_needs_editar boolean := false;
  v_result    jsonb;
  r           record;
  v_pid       uuid;
  v_before    jsonb;
  v_after     jsonb;
  v_ativo_atual boolean;
  v_nome_atual text;
  v_desc_atual text;
  v_dtini_atual date;
  v_dtfim_atual date;
  v_obs_atual  text;
  v_status_muda boolean;
  v_dados_mudam boolean;
BEGIN
  ---------------------------------------------------------------------------
  -- 1) Autenticação / usuário ativo / validação básica de payload
  ---------------------------------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: autenticação obrigatória' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_active_user(v_uid) THEN
    RAISE EXCEPTION 'USER_INACTIVE: usuário inativo' USING ERRCODE = '42501';
  END IF;
  IF _correlation_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: correlation_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: rows deve ser array' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(_rows);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: nenhuma linha informada' USING ERRCODE = '22023';
  END IF;
  IF v_total > 2000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: limite de 2000 linhas por importação' USING ERRCODE = '22023';
  END IF;

  v_is_super  := public.has_role(v_uid, 'super_admin'::app_role);
  v_is_global := v_is_super
              OR public.has_role(v_uid, 'rh'::app_role)
              OR public.has_role(v_uid, 'compliance'::app_role);

  ---------------------------------------------------------------------------
  -- 2) Normalização em tabelas temporárias
  ---------------------------------------------------------------------------
  DROP TABLE IF EXISTS _imp_rows;
  DROP TABLE IF EXISTS _imp_errors;
  DROP TABLE IF EXISTS _imp_empresas;
  DROP TABLE IF EXISTS _imp_plan;

  CREATE TEMP TABLE _imp_rows ON COMMIT DROP AS
  SELECT
    (elem->>'row_number')::int                                                     AS row_number,
    regexp_replace(COALESCE(elem->>'cnpj_empresa',''), '\D', '', 'g')              AS cnpj_norm,
    upper(btrim(COALESCE(elem->>'codigo_projeto','')))                             AS codigo_norm,
    btrim(COALESCE(elem->>'nome_projeto',''))                                      AS nome,
    upper(btrim(COALESCE(elem->>'status','')))                                     AS status_raw,
    NULLIF(btrim(COALESCE(elem->>'descricao','')), '')                             AS descricao,
    NULLIF(btrim(COALESCE(elem->>'data_inicio','')), '')                           AS data_inicio_raw,
    NULLIF(btrim(COALESCE(elem->>'data_fim','')), '')                              AS data_fim_raw,
    NULLIF(btrim(COALESCE(elem->>'observacoes','')), '')                           AS observacoes
  FROM jsonb_array_elements(_rows) elem;

  CREATE TEMP TABLE _imp_errors (
    row_number int,
    field      text,
    code       text,
    message    text
  ) ON COMMIT DROP;

  ---------------------------------------------------------------------------
  -- 3) Validações por linha (formato / obrigatórios)
  ---------------------------------------------------------------------------
  INSERT INTO _imp_errors
  SELECT row_number, 'cnpj_empresa', 'CNPJ_REQUIRED', 'CNPJ obrigatório'
    FROM _imp_rows WHERE cnpj_norm = '';

  INSERT INTO _imp_errors
  SELECT row_number, 'cnpj_empresa', 'CNPJ_INVALID', 'CNPJ deve ter 14 dígitos'
    FROM _imp_rows WHERE cnpj_norm <> '' AND length(cnpj_norm) <> 14;

  INSERT INTO _imp_errors
  SELECT row_number, 'codigo_projeto', 'CODE_REQUIRED', 'codigo_projeto obrigatório'
    FROM _imp_rows WHERE codigo_norm = '';

  INSERT INTO _imp_errors
  SELECT row_number, 'codigo_projeto', 'CODE_INVALID',
         'codigo_projeto deve conter 2-10 caracteres A-Z/0-9'
    FROM _imp_rows
   WHERE codigo_norm <> '' AND codigo_norm !~ '^[A-Z0-9]{2,10}$';

  INSERT INTO _imp_errors
  SELECT row_number, 'nome_projeto', 'NAME_REQUIRED', 'nome_projeto obrigatório'
    FROM _imp_rows WHERE nome = '';

  INSERT INTO _imp_errors
  SELECT row_number, 'nome_projeto', 'NAME_TOO_LONG',
         'nome_projeto acima de 120 caracteres'
    FROM _imp_rows WHERE length(nome) > 120;

  INSERT INTO _imp_errors
  SELECT row_number, 'status', 'STATUS_INVALID',
         'status inválido (use ATIVO ou INATIVO)'
    FROM _imp_rows
   WHERE status_raw NOT IN ('ATIVO','INATIVO','ATIVA','INATIVA','1','0','TRUE','FALSE');

  INSERT INTO _imp_errors
  SELECT row_number, 'data_inicio', 'DATE_INVALID',
         'data_inicio inválida (use YYYY-MM-DD ou DD/MM/YYYY)'
    FROM _imp_rows
   WHERE data_inicio_raw IS NOT NULL
     AND NOT (data_inicio_raw ~ '^\d{4}-\d{2}-\d{2}$'
           OR data_inicio_raw ~ '^\d{2}/\d{2}/\d{4}$');

  INSERT INTO _imp_errors
  SELECT row_number, 'data_fim', 'DATE_INVALID',
         'data_fim inválida (use YYYY-MM-DD ou DD/MM/YYYY)'
    FROM _imp_rows
   WHERE data_fim_raw IS NOT NULL
     AND NOT (data_fim_raw ~ '^\d{4}-\d{2}-\d{2}$'
           OR data_fim_raw ~ '^\d{2}/\d{2}/\d{4}$');

  -- Duplicidade dentro do próprio arquivo
  INSERT INTO _imp_errors
  SELECT r1.row_number, 'codigo_projeto', 'DUP_IN_FILE',
         'linha duplicada no arquivo (linhas: ' ||
         string_agg(DISTINCT r2.row_number::text, ', '
                    ORDER BY r2.row_number::text) || ')'
    FROM _imp_rows r1
    JOIN _imp_rows r2
      ON r1.cnpj_norm = r2.cnpj_norm
     AND r1.codigo_norm = r2.codigo_norm
     AND r1.row_number <> r2.row_number
   WHERE r1.cnpj_norm <> '' AND r1.codigo_norm <> ''
   GROUP BY r1.row_number;

  ---------------------------------------------------------------------------
  -- 4) Localiza empresas por CNPJ + valida escopo
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE _imp_empresas ON COMMIT DROP AS
  SELECT DISTINCT r.cnpj_norm,
         e.id                       AS empresa_id,
         COALESCE(e.ativo, false)   AS empresa_ativa
    FROM _imp_rows r
    LEFT JOIN public.empresas e
      ON length(r.cnpj_norm) = 14
     AND regexp_replace(COALESCE(e.cnpj,''), '\D', '', 'g') = r.cnpj_norm
   WHERE r.cnpj_norm <> '';

  INSERT INTO _imp_errors
  SELECT r.row_number, 'cnpj_empresa', 'EMPRESA_NOT_FOUND',
         'empresa não encontrada para o CNPJ informado'
    FROM _imp_rows r
    LEFT JOIN _imp_empresas e ON e.cnpj_norm = r.cnpj_norm
   WHERE r.cnpj_norm <> ''
     AND length(r.cnpj_norm) = 14
     AND e.empresa_id IS NULL;

  INSERT INTO _imp_errors
  SELECT r.row_number, 'cnpj_empresa', 'EMPRESA_INATIVA',
         'empresa está inativa'
    FROM _imp_rows r
    JOIN _imp_empresas e ON e.cnpj_norm = r.cnpj_norm
   WHERE e.empresa_id IS NOT NULL AND e.empresa_ativa = false;

  IF NOT v_is_global THEN
    INSERT INTO _imp_errors
    SELECT r.row_number, 'cnpj_empresa', 'EMPRESA_OUT_OF_SCOPE',
           'empresa fora do seu escopo de acesso'
      FROM _imp_rows r
      JOIN _imp_empresas e ON e.cnpj_norm = r.cnpj_norm
     WHERE e.empresa_id IS NOT NULL
       AND e.empresa_ativa = true
       AND NOT EXISTS (
         SELECT 1 FROM public.usuario_empresas ue
          WHERE ue.user_id = v_uid AND ue.empresa_id = e.empresa_id
       );
  END IF;

  ---------------------------------------------------------------------------
  -- 5) Aborta ANTES de qualquer escrita se houver qualquer erro
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM _imp_errors) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'row_number', row_number, 'field', field,
             'code', code, 'message', message
           ) ORDER BY row_number, field), '[]'::jsonb)
      INTO v_errors
      FROM _imp_errors;
    RETURN jsonb_build_object(
      'success',        false,
      'correlation_id', _correlation_id,
      'total',          v_total,
      'created', 0, 'updated', 0, 'activated', 0, 'deactivated', 0, 'unchanged', 0,
      'rejected',       (SELECT count(DISTINCT row_number) FROM _imp_errors),
      'errors',         v_errors,
      'duration_ms',    round(extract(epoch FROM clock_timestamp() - v_started) * 1000)
    );
  END IF;

  ---------------------------------------------------------------------------
  -- 6) Constrói plano com datas parseadas + projeto existente
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE _imp_plan ON COMMIT DROP AS
  SELECT
    r.row_number,
    e.empresa_id,
    r.codigo_norm,
    r.nome,
    (r.status_raw IN ('ATIVO','1','ATIVA','TRUE'))                       AS want_ativo,
    r.descricao,
    CASE
      WHEN r.data_inicio_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN r.data_inicio_raw::date
      WHEN r.data_inicio_raw ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(r.data_inicio_raw,'DD/MM/YYYY')
      ELSE NULL
    END                                                                   AS data_inicio,
    CASE
      WHEN r.data_fim_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN r.data_fim_raw::date
      WHEN r.data_fim_raw ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(r.data_fim_raw,'DD/MM/YYYY')
      ELSE NULL
    END                                                                   AS data_fim,
    r.observacoes,
    p.id            AS projeto_id,
    p.ativo         AS projeto_ativo,
    p.nome          AS projeto_nome,
    p.descricao     AS projeto_descricao,
    p.data_inicio   AS projeto_data_inicio,
    p.data_fim      AS projeto_data_fim,
    p.observacoes   AS projeto_observacoes
  FROM _imp_rows r
  JOIN _imp_empresas e ON e.cnpj_norm = r.cnpj_norm
  LEFT JOIN public.projetos p
    ON p.empresa_id = e.empresa_id
   AND upper(COALESCE(p.codigo_protocolo,'')) = r.codigo_norm;

  -- data_fim < data_inicio (após parse)
  INSERT INTO _imp_errors
  SELECT row_number, 'data_fim', 'DATE_RANGE', 'data_fim anterior a data_inicio'
    FROM _imp_plan
   WHERE data_inicio IS NOT NULL AND data_fim IS NOT NULL AND data_fim < data_inicio;

  IF EXISTS (SELECT 1 FROM _imp_errors) THEN
    SELECT jsonb_agg(jsonb_build_object(
             'row_number', row_number, 'field', field,
             'code', code, 'message', message
           ) ORDER BY row_number, field)
      INTO v_errors FROM _imp_errors;
    RETURN jsonb_build_object(
      'success', false, 'correlation_id', _correlation_id,
      'total', v_total, 'created', 0, 'updated', 0, 'activated', 0,
      'deactivated', 0, 'unchanged', 0,
      'rejected', (SELECT count(DISTINCT row_number) FROM _imp_errors),
      'errors', v_errors,
      'duration_ms', round(extract(epoch FROM clock_timestamp() - v_started) * 1000)
    );
  END IF;

  ---------------------------------------------------------------------------
  -- 7) Necessidades de permissão calculadas a partir do plano real
  ---------------------------------------------------------------------------
  SELECT
    COALESCE(bool_or(projeto_id IS NULL), false),
    COALESCE(bool_or(projeto_id IS NOT NULL AND (
        projeto_ativo       IS DISTINCT FROM want_ativo
     OR projeto_nome        IS DISTINCT FROM nome
     OR projeto_descricao   IS DISTINCT FROM descricao
     OR projeto_data_inicio IS DISTINCT FROM data_inicio
     OR projeto_data_fim    IS DISTINCT FROM data_fim
     OR projeto_observacoes IS DISTINCT FROM observacoes
    )), false)
  INTO v_needs_criar, v_needs_editar
  FROM _imp_plan;

  IF v_needs_criar AND NOT public.has_permission(v_uid, 'projeto.criar') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: permissão projeto.criar negada'
      USING ERRCODE = '42501', HINT = _correlation_id::text;
  END IF;
  IF v_needs_editar AND NOT public.has_permission(v_uid, 'projeto.editar') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: permissão projeto.editar negada'
      USING ERRCODE = '42501', HINT = _correlation_id::text;
  END IF;

  ---------------------------------------------------------------------------
  -- 8) Auditoria de início (dentro da transação atômica)
  ---------------------------------------------------------------------------
  PERFORM public.log_audit_event(
    'projetos', 'PROJETOS_IMPORTACAO_INICIADA'::audit_action,
    'ImportProjetos', NULL, NULL, NULL,
    NULL,
    jsonb_build_object('total', v_total, 'correlation_id', _correlation_id),
    true,
    '[corr=' || _correlation_id::text || '] importação iniciada',
    'rpc'
  );

  ---------------------------------------------------------------------------
  -- 9) Escrita (tudo dentro da mesma transação — rollback automático em erro)
  ---------------------------------------------------------------------------
  FOR r IN SELECT * FROM _imp_plan ORDER BY row_number LOOP
    IF r.projeto_id IS NULL THEN
      -- INSERT novo projeto
      INSERT INTO public.projetos (
        empresa_id, nome, descricao, codigo_protocolo, ativo,
        data_inicio, data_fim, observacoes
      ) VALUES (
        r.empresa_id, r.nome, r.descricao, r.codigo_norm, r.want_ativo,
        r.data_inicio, r.data_fim, r.observacoes
      )
      RETURNING id INTO v_pid;
      v_created := v_created + 1;

      v_after := jsonb_build_object(
        'nome', r.nome, 'codigo_protocolo', r.codigo_norm,
        'ativo', r.want_ativo, 'descricao', r.descricao,
        'data_inicio', r.data_inicio, 'data_fim', r.data_fim,
        'observacoes', r.observacoes
      );
      PERFORM public.log_audit_event(
        'projetos', 'PROJETO_CRIADO'::audit_action, 'Projeto',
        v_pid, r.empresa_id, v_pid,
        NULL, v_after, true,
        '[corr=' || _correlation_id::text || '] import linha ' || r.row_number,
        'rpc'
      );
    ELSE
      -- Bloqueia linha para evitar corrida com outra confirmação
      PERFORM 1 FROM public.projetos WHERE id = r.projeto_id FOR UPDATE;

      SELECT ativo, nome, descricao, data_inicio, data_fim, observacoes
        INTO v_ativo_atual, v_nome_atual, v_desc_atual,
             v_dtini_atual, v_dtfim_atual, v_obs_atual
        FROM public.projetos WHERE id = r.projeto_id;

      v_status_muda := (v_ativo_atual IS DISTINCT FROM r.want_ativo);
      v_dados_mudam := (v_nome_atual  IS DISTINCT FROM r.nome)
                    OR (v_desc_atual  IS DISTINCT FROM r.descricao)
                    OR (v_dtini_atual IS DISTINCT FROM r.data_inicio)
                    OR (v_dtfim_atual IS DISTINCT FROM r.data_fim)
                    OR (v_obs_atual   IS DISTINCT FROM r.observacoes);

      IF NOT v_status_muda AND NOT v_dados_mudam THEN
        v_unchanged := v_unchanged + 1;
        CONTINUE;
      END IF;

      v_before := jsonb_build_object(
        'ativo', v_ativo_atual, 'nome', v_nome_atual,
        'descricao', v_desc_atual, 'data_inicio', v_dtini_atual,
        'data_fim', v_dtfim_atual, 'observacoes', v_obs_atual
      );
      v_after  := jsonb_build_object(
        'ativo', r.want_ativo, 'nome', r.nome,
        'descricao', r.descricao, 'data_inicio', r.data_inicio,
        'data_fim', r.data_fim, 'observacoes', r.observacoes
      );

      -- NUNCA altera empresa_id nem codigo_protocolo (histórico preservado)
      UPDATE public.projetos SET
        nome        = r.nome,
        descricao   = r.descricao,
        ativo       = r.want_ativo,
        data_inicio = r.data_inicio,
        data_fim    = r.data_fim,
        observacoes = r.observacoes
      WHERE id = r.projeto_id;

      IF v_status_muda AND NOT v_dados_mudam THEN
        IF r.want_ativo THEN
          v_activated := v_activated + 1;
          PERFORM public.log_audit_event(
            'projetos', 'PROJETO_ATIVADO'::audit_action, 'Projeto',
            r.projeto_id, r.empresa_id, r.projeto_id,
            v_before, v_after, true,
            '[corr=' || _correlation_id::text || '] import linha ' || r.row_number,
            'rpc'
          );
        ELSE
          v_deactivated := v_deactivated + 1;
          PERFORM public.log_audit_event(
            'projetos', 'PROJETO_DESATIVADO'::audit_action, 'Projeto',
            r.projeto_id, r.empresa_id, r.projeto_id,
            v_before, v_after, true,
            '[corr=' || _correlation_id::text || '] import linha ' || r.row_number,
            'rpc'
          );
        END IF;
      ELSE
        v_updated := v_updated + 1;
        PERFORM public.log_audit_event(
          'projetos', 'PROJETO_ATUALIZADO'::audit_action, 'Projeto',
          r.projeto_id, r.empresa_id, r.projeto_id,
          v_before, v_after, true,
          '[corr=' || _correlation_id::text || '] import linha ' || r.row_number,
          'rpc'
        );
      END IF;
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'success',        true,
    'correlation_id', _correlation_id,
    'total',          v_total,
    'created',        v_created,
    'updated',        v_updated,
    'activated',      v_activated,
    'deactivated',    v_deactivated,
    'unchanged',      v_unchanged,
    'rejected',       0,
    'errors',         '[]'::jsonb,
    'duration_ms',    round(extract(epoch FROM clock_timestamp() - v_started) * 1000)
  );

  PERFORM public.log_audit_event(
    'projetos', 'PROJETOS_IMPORTACAO_CONCLUIDA'::audit_action,
    'ImportProjetos', NULL, NULL, NULL,
    NULL, v_result, true,
    '[corr=' || _correlation_id::text || '] concluída',
    'rpc'
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.import_projetos_atomic(jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.import_projetos_atomic(jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.import_projetos_atomic(jsonb, uuid) IS
  'Importação atômica de projetos: valida integralmente o lote e aplica CRIAR/ATUALIZAR/ATIVAR/DESATIVAR em uma única transação. Empresa jamais criada; projeto jamais excluído; codigo_protocolo histórico jamais alterado. Retorna JSON estruturado com contagens e erros.';
