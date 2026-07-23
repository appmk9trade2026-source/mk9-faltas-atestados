CREATE OR REPLACE FUNCTION public.reprocess_supervisor_batch(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_mat text;
  v_email text;
  v_nome text;
  v_nome_key text;
  v_colab record;
  v_count_colab int;
  v_count_prof int;
  v_uid uuid;
  v_cand_id uuid;
  v_cand_email text;
  v_cand_nome text;
  v_total int := 0;
  v_localizados int := 0;
  v_nao_localizados int := 0;
  v_colab_ambiguo int := 0;
  v_email_recuperado int := 0;
  v_vinculados int := 0;
  v_inexistente int := 0;
  v_email_vazio int := 0;
  v_email_invalido int := 0;
  v_duplicidade int := 0;
  v_sem_papel int := 0;
  v_divergencia int := 0;
  v_detalhes jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão para reprocessar supervisores.' USING ERRCODE='insufficient_privilege';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_total := v_total + 1;
    v_mat := upper(btrim(regexp_replace(coalesce(r->>'matricula',''), '\s+', '', 'g')));
    v_email := lower(btrim(coalesce(r->>'supervisor_email','')));
    v_email := regexp_replace(v_email, '[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]', '', 'g');
    v_nome := btrim(coalesce(r->>'supervisor_nome',''));
    v_nome_key := public.normalize_name(v_nome);

    IF v_mat = '' THEN
      v_nao_localizados := v_nao_localizados + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'motivo', 'MATRICULA_VAZIA');
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_count_colab FROM public.colaboradores WHERE matricula = v_mat;
    IF v_count_colab = 0 THEN
      v_nao_localizados := v_nao_localizados + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'motivo', 'COLABORADOR_NAO_LOCALIZADO');
      CONTINUE;
    ELSIF v_count_colab > 1 THEN
      v_colab_ambiguo := v_colab_ambiguo + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'motivo', 'COLABORADOR_AMBIGUO', 'quantidade', v_count_colab);
      CONTINUE;
    END IF;

    SELECT id, nome_completo, supervisor_email, supervisor_nome, supervisor_usuario_id, empresa_id, projeto_id
      INTO v_colab FROM public.colaboradores WHERE matricula = v_mat LIMIT 1;
    v_localizados := v_localizados + 1;

    IF v_email <> '' AND coalesce(v_colab.supervisor_email,'') <> v_email THEN
      v_email_recuperado := v_email_recuperado + 1;
    END IF;

    UPDATE public.colaboradores
       SET supervisor_email = CASE WHEN v_email <> '' THEN v_email ELSE supervisor_email END,
           supervisor_nome  = CASE WHEN v_nome  <> '' AND coalesce(supervisor_nome,'') = '' THEN v_nome ELSE supervisor_nome END
     WHERE id = v_colab.id;

    IF v_email = '' THEN
      v_email_vazio := v_email_vazio + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id, 'motivo', 'EMAIL_VAZIO');
      CONTINUE;
    END IF;
    IF position('@' in v_email) = 0 THEN
      v_email_invalido := v_email_invalido + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id, 'email', v_email, 'motivo', 'EMAIL_INVALIDO');
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_count_prof FROM public.profiles p WHERE lower(btrim(p.email)) = v_email AND p.ativo = true;
    IF v_count_prof = 1 THEN
      SELECT (array_agg(p.id))[1] INTO v_uid
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'
       WHERE lower(btrim(p.email)) = v_email AND p.ativo = true;
      IF v_uid IS NULL THEN
        v_sem_papel := v_sem_papel + 1;
        v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id, 'email', v_email, 'motivo', 'SEM_PAPEL_SUPERVISOR');
        CONTINUE;
      END IF;
      UPDATE public.colaboradores SET supervisor_usuario_id = v_uid WHERE id = v_colab.id;
      v_vinculados := v_vinculados + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id, 'email', v_email, 'motivo', 'VINCULADO', 'supervisor_usuario_id', v_uid);
      CONTINUE;
    ELSIF v_count_prof > 1 THEN
      v_duplicidade := v_duplicidade + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id, 'email', v_email, 'motivo', 'DUPLICIDADE');
      CONTINUE;
    END IF;

    -- Sem correspondência por e-mail: procurar candidato único por NOME entre supervisores ativos.
    -- (BUGFIX: coluna correta em profiles é `nome`, não `nome_completo`.)
    v_cand_id := NULL; v_cand_email := NULL; v_cand_nome := NULL;
    IF v_nome_key <> '' THEN
      SELECT p.id, p.email, p.nome
        INTO v_cand_id, v_cand_email, v_cand_nome
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'
       WHERE p.ativo = true
         AND public.normalize_name(p.nome) = v_nome_key
       GROUP BY p.id, p.email, p.nome
       HAVING count(*) = 1;
      IF (SELECT count(*) FROM public.profiles p
            JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'
           WHERE p.ativo = true AND public.normalize_name(p.nome) = v_nome_key) > 1 THEN
        v_cand_id := NULL;
      END IF;
    END IF;

    IF v_cand_id IS NOT NULL THEN
      v_divergencia := v_divergencia + 1;
      v_detalhes := v_detalhes || jsonb_build_object(
        'linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id,
        'colaborador_nome', v_colab.nome_completo,
        'email', v_email, 'nome_planilha', v_nome,
        'motivo', 'DIVERGENCIA_DIGITACAO',
        'candidato_id', v_cand_id, 'candidato_email', v_cand_email, 'candidato_nome', v_cand_nome
      );
    ELSE
      v_inexistente := v_inexistente + 1;
      v_detalhes := v_detalhes || jsonb_build_object('linha', r->>'linha', 'matricula', v_mat, 'colaborador_id', v_colab.id, 'email', v_email, 'nome_planilha', v_nome, 'motivo', 'SUPERVISOR_INEXISTENTE');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'localizados', v_localizados,
    'nao_localizados', v_nao_localizados,
    'colab_ambiguo', v_colab_ambiguo,
    'email_recuperado', v_email_recuperado,
    'vinculados', v_vinculados,
    'inexistente', v_inexistente,
    'email_vazio', v_email_vazio,
    'email_invalido', v_email_invalido,
    'duplicidade', v_duplicidade,
    'sem_papel_supervisor', v_sem_papel,
    'divergencia_digitacao', v_divergencia,
    'detalhes', v_detalhes
  );
END;
$fn$;