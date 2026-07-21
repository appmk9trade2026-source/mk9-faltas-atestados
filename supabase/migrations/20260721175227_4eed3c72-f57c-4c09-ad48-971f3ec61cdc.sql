CREATE OR REPLACE FUNCTION public.import_projetos_atomic(_rows jsonb, _correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_row       record;
  v_pid       uuid;
  v_before    jsonb;
  v_after     jsonb;
  v_ativo_atual boolean;
  v_desc_atual text;
  v_status_muda boolean;
  v_dados_mudam boolean;
BEGIN
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

  DROP TABLE IF EXISTS _imp_rows;
  DROP TABLE IF EXISTS _imp_errors;
  DROP TABLE IF EXISTS _imp_empresas;
  DROP TABLE IF EXISTS _imp_plan;

  CREATE TEMP TABLE _imp_rows ON COMMIT DROP AS
  SELECT
    (elem->>'row_number')::int                                                        AS row_number,
    btrim(COALESCE(elem->>'empresa_nome',''))                                         AS empresa_original,
    lower(btrim(COALESCE(elem->>'empresa_nome','')))                                  AS empresa_norm,
    btrim(COALESCE(elem->>'nome_projeto',''))                                         AS nome,
    lower(regexp_replace(btrim(COALESCE(elem->>'nome_projeto','')), '\s+', ' ', 'g')) AS nome_norm,
    NULLIF(btrim(COALESCE(elem->>'descricao','')), '')                                AS descricao,
    upper(btrim(COALESCE(elem->>'status','')))                                        AS status_raw,
    NULLIF(btrim(COALESCE(elem->>'data_cadastro','')), '')                            AS data_cadastro_raw
  FROM jsonb_array_elements(_rows) elem;

  CREATE TEMP TABLE _imp_errors (
    row_number int, field text, code text, message text
  ) ON COMMIT DROP;

  INSERT INTO _imp_errors
  SELECT row_number, 'empresa_nome', 'EMPRESA_REQUIRED', 'Empresa obrigatória'
    FROM _imp_rows WHERE empresa_norm = '';

  INSERT INTO _imp_errors
  SELECT row_number, 'nome_projeto', 'NAME_REQUIRED', 'Projeto (nome) obrigatório'
    FROM _imp_rows WHERE nome = '';

  INSERT INTO _imp_errors
  SELECT row_number, 'nome_projeto', 'NAME_TOO_LONG', 'Projeto acima de 120 caracteres'
    FROM _imp_rows WHERE length(nome) > 120;

  INSERT INTO _imp_errors
  SELECT row_number, 'status', 'STATUS_INVALID', 'Status inválido (use ATIVO ou INATIVO)'
    FROM _imp_rows
   WHERE status_raw NOT IN ('ATIVO','INATIVO','ATIVA','INATIVA','1','0','TRUE','FALSE');

  INSERT INTO _imp_errors
  SELECT row_number, 'data_cadastro', 'DATE_INVALID', 'Data cadastro inválida'
    FROM _imp_rows
   WHERE data_cadastro_raw IS NOT NULL
     AND data_cadastro_raw !~ '^\d{4}-\d{2}-\d{2}$';

  INSERT INTO _imp_errors
  SELECT r1.row_number, 'nome_projeto', 'DUP_IN_FILE',
         'Linha duplicada no arquivo (linhas: ' ||
         string_agg(DISTINCT r2.row_number::text, ', '
                    ORDER BY r2.row_number::text) || ')'
    FROM _imp_rows r1
    JOIN _imp_rows r2
      ON r1.empresa_norm = r2.empresa_norm
     AND r1.nome_norm    = r2.nome_norm
     AND r1.row_number <> r2.row_number
   WHERE r1.empresa_norm <> '' AND r1.nome_norm <> ''
   GROUP BY r1.row_number;

  CREATE TEMP TABLE _imp_empresas ON COMMIT DROP AS
  SELECT ir.empresa_norm,
         count(e.id)                                       AS matches,
         (array_agg(e.id ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL))[1] AS empresa_id,
         bool_and(COALESCE(e.ativo, false))                AS empresa_ativa
    FROM _imp_rows ir
    LEFT JOIN public.empresas e
      ON ir.empresa_norm <> ''
     AND lower(btrim(e.nome)) = ir.empresa_norm
   WHERE ir.empresa_norm <> ''
   GROUP BY ir.empresa_norm;

  INSERT INTO _imp_errors
  SELECT ir.row_number, 'empresa_nome', 'EMPRESA_NOT_FOUND', 'Empresa não encontrada'
    FROM _imp_rows ir
    LEFT JOIN _imp_empresas e ON e.empresa_norm = ir.empresa_norm
   WHERE ir.empresa_norm <> ''
     AND (e.matches IS NULL OR e.matches = 0 OR e.empresa_id IS NULL);

  INSERT INTO _imp_errors
  SELECT ir.row_number, 'empresa_nome', 'EMPRESA_AMBIGUOUS',
         'Empresa ambígua — mais de um cadastro com este nome'
    FROM _imp_rows ir
    JOIN _imp_empresas e ON e.empresa_norm = ir.empresa_norm
   WHERE e.matches > 1;

  INSERT INTO _imp_errors
  SELECT ir.row_number, 'empresa_nome', 'EMPRESA_INATIVA', 'Empresa está inativa'
    FROM _imp_rows ir
    JOIN _imp_empresas e ON e.empresa_norm = ir.empresa_norm
   WHERE e.matches = 1 AND e.empresa_ativa = false;

  IF NOT v_is_global THEN
    INSERT INTO _imp_errors
    SELECT ir.row_number, 'empresa_nome', 'EMPRESA_OUT_OF_SCOPE',
           'Empresa fora do seu escopo de acesso'
      FROM _imp_rows ir
      JOIN _imp_empresas e ON e.empresa_norm = ir.empresa_norm
     WHERE e.matches = 1
       AND e.empresa_ativa = true
       AND NOT EXISTS (
         SELECT 1 FROM public.usuario_empresas ue
          WHERE ue.user_id = v_uid AND ue.empresa_id = e.empresa_id
       );
  END IF;

  IF EXISTS (SELECT 1 FROM _imp_errors) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'row_number', row_number, 'field', field,
             'code', code, 'message', message
           ) ORDER BY row_number, field), '[]'::jsonb)
      INTO v_errors FROM _imp_errors;
    RETURN jsonb_build_object(
      'success', false, 'correlation_id', _correlation_id, 'total', v_total,
      'created', 0, 'updated', 0, 'activated', 0, 'deactivated', 0, 'unchanged', 0,
      'rejected', (SELECT count(DISTINCT row_number) FROM _imp_errors),
      'errors', v_errors,
      'duration_ms', round(extract(epoch FROM clock_timestamp() - v_started) * 1000)
    );
  END IF;

  CREATE TEMP TABLE _imp_plan ON COMMIT DROP AS
  WITH matches AS (
    SELECT
      ir.row_number,
      e.empresa_id,
      ir.nome,
      ir.nome_norm,
      ir.descricao,
      (ir.status_raw IN ('ATIVO','1','ATIVA','TRUE')) AS want_ativo,
      CASE
        WHEN ir.data_cadastro_raw ~ '^\d{4}-\d{2}-\d{2}$'
          THEN ir.data_cadastro_raw::timestamptz
        ELSE NULL
      END AS data_cadastro,
      (
        SELECT array_agg(p.id ORDER BY p.created_at)
          FROM public.projetos p
         WHERE p.empresa_id = e.empresa_id
           AND lower(regexp_replace(btrim(p.nome), '\s+', ' ', 'g')) = ir.nome_norm
      ) AS match_ids
    FROM _imp_rows ir
    JOIN _imp_empresas e ON e.empresa_norm = ir.empresa_norm
  )
  SELECT
    m.row_number, m.empresa_id, m.nome, m.nome_norm,
    m.descricao, m.want_ativo, m.data_cadastro,
    CASE
      WHEN m.match_ids IS NULL OR array_length(m.match_ids,1) IS NULL THEN NULL
      ELSE m.match_ids[1]
    END AS projeto_id,
    COALESCE(array_length(m.match_ids,1), 0) AS match_count
  FROM matches m;

  INSERT INTO _imp_errors
  SELECT row_number, 'nome_projeto', 'PROJECT_AMBIGUOUS',
         'Existem múltiplos projetos com este nome nesta empresa — saneamento manual necessário'
    FROM _imp_plan WHERE match_count > 1;

  IF EXISTS (SELECT 1 FROM _imp_errors) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'row_number', row_number, 'field', field,
             'code', code, 'message', message
           ) ORDER BY row_number, field), '[]'::jsonb)
      INTO v_errors FROM _imp_errors;
    RETURN jsonb_build_object(
      'success', false, 'correlation_id', _correlation_id, 'total', v_total,
      'created', 0, 'updated', 0, 'activated', 0, 'deactivated', 0, 'unchanged', 0,
      'rejected', (SELECT count(DISTINCT row_number) FROM _imp_errors),
      'errors', v_errors,
      'duration_ms', round(extract(epoch FROM clock_timestamp() - v_started) * 1000)
    );
  END IF;

  SELECT
    COALESCE(bool_or(projeto_id IS NULL), false),
    COALESCE(bool_or(projeto_id IS NOT NULL), false)
  INTO v_needs_criar, v_needs_editar
  FROM _imp_plan p
  WHERE (
    p.projeto_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.projetos pr WHERE pr.id = p.projeto_id
        AND (pr.ativo IS DISTINCT FROM p.want_ativo
          OR pr.descricao IS DISTINCT FROM p.descricao)
    )
  );

  IF v_needs_criar AND NOT public.has_permission(v_uid, 'projeto.criar') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: permissão projeto.criar negada'
      USING ERRCODE = '42501', HINT = _correlation_id::text;
  END IF;
  IF v_needs_editar AND NOT public.has_permission(v_uid, 'projeto.editar') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: permissão projeto.editar negada'
      USING ERRCODE = '42501', HINT = _correlation_id::text;
  END IF;

  PERFORM public.log_audit_event(
    'projetos', 'PROJETOS_IMPORTACAO_INICIADA'::audit_action,
    'ImportProjetos', NULL, NULL, NULL, NULL,
    jsonb_build_object('total', v_total, 'correlation_id', _correlation_id),
    true, '[corr=' || _correlation_id::text || '] importação iniciada', 'rpc'
  );

  FOR v_row IN SELECT * FROM _imp_plan ORDER BY row_number LOOP
    IF v_row.projeto_id IS NULL THEN
      IF v_row.data_cadastro IS NOT NULL THEN
        INSERT INTO public.projetos (empresa_id, nome, descricao, ativo, created_at)
        VALUES (v_row.empresa_id, v_row.nome, v_row.descricao, v_row.want_ativo, v_row.data_cadastro)
        RETURNING id INTO v_pid;
      ELSE
        INSERT INTO public.projetos (empresa_id, nome, descricao, ativo)
        VALUES (v_row.empresa_id, v_row.nome, v_row.descricao, v_row.want_ativo)
        RETURNING id INTO v_pid;
      END IF;
      v_created := v_created + 1;
      v_after := jsonb_build_object(
        'nome', v_row.nome, 'ativo', v_row.want_ativo,
        'descricao', v_row.descricao, 'created_at', v_row.data_cadastro
      );
      PERFORM public.log_audit_event(
        'projetos', 'PROJETO_CRIADO'::audit_action, 'Projeto',
        v_pid, v_row.empresa_id, v_pid, NULL, v_after, true,
        '[corr=' || _correlation_id::text || '] import linha ' || v_row.row_number, 'rpc'
      );
    ELSE
      PERFORM 1 FROM public.projetos WHERE id = v_row.projeto_id FOR UPDATE;
      SELECT ativo, descricao INTO v_ativo_atual, v_desc_atual
        FROM public.projetos WHERE id = v_row.projeto_id;

      v_status_muda := (v_ativo_atual IS DISTINCT FROM v_row.want_ativo);
      v_dados_mudam := (v_desc_atual IS DISTINCT FROM v_row.descricao);

      IF NOT v_status_muda AND NOT v_dados_mudam THEN
        v_unchanged := v_unchanged + 1;
        CONTINUE;
      END IF;

      v_before := jsonb_build_object('ativo', v_ativo_atual, 'descricao', v_desc_atual);
      v_after  := jsonb_build_object('ativo', v_row.want_ativo, 'descricao', v_row.descricao);

      UPDATE public.projetos
         SET descricao = v_row.descricao,
             ativo     = v_row.want_ativo
       WHERE id = v_row.projeto_id;

      IF v_status_muda AND NOT v_dados_mudam THEN
        IF v_row.want_ativo THEN
          v_activated := v_activated + 1;
          PERFORM public.log_audit_event(
            'projetos', 'PROJETO_ATIVADO'::audit_action, 'Projeto',
            v_row.projeto_id, v_row.empresa_id, v_row.projeto_id, v_before, v_after, true,
            '[corr=' || _correlation_id::text || '] import linha ' || v_row.row_number, 'rpc'
          );
        ELSE
          v_deactivated := v_deactivated + 1;
          PERFORM public.log_audit_event(
            'projetos', 'PROJETO_DESATIVADO'::audit_action, 'Projeto',
            v_row.projeto_id, v_row.empresa_id, v_row.projeto_id, v_before, v_after, true,
            '[corr=' || _correlation_id::text || '] import linha ' || v_row.row_number, 'rpc'
          );
        END IF;
      ELSE
        v_updated := v_updated + 1;
        PERFORM public.log_audit_event(
          'projetos', 'PROJETO_ATUALIZADO'::audit_action, 'Projeto',
          v_row.projeto_id, v_row.empresa_id, v_row.projeto_id, v_before, v_after, true,
          '[corr=' || _correlation_id::text || '] import linha ' || v_row.row_number, 'rpc'
        );
      END IF;
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true, 'correlation_id', _correlation_id, 'total', v_total,
    'created', v_created, 'updated', v_updated, 'activated', v_activated,
    'deactivated', v_deactivated, 'unchanged', v_unchanged,
    'rejected', 0, 'errors', '[]'::jsonb,
    'duration_ms', round(extract(epoch FROM clock_timestamp() - v_started) * 1000)
  );

  PERFORM public.log_audit_event(
    'projetos', 'PROJETOS_IMPORTACAO_CONCLUIDA'::audit_action,
    'ImportProjetos', NULL, NULL, NULL, NULL, v_result, true,
    '[corr=' || _correlation_id::text || '] importação concluída', 'rpc'
  );

  RETURN v_result;
END;
$function$;