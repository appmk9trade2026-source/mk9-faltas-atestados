
-- 1) Resolver supervisor pelo e-mail (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.resolve_supervisor_usuario_id(_email text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_count int;
  v_id uuid;
BEGIN
  v_email := lower(btrim(coalesce(_email, '')));
  -- remove caracteres de controle/zero-width
  v_email := regexp_replace(v_email, '[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]', '', 'g');
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT count(*), (array_agg(p.id ORDER BY p.id))[1]
    INTO v_count, v_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'::app_role
  WHERE lower(btrim(p.email)) = v_email
    AND p.ativo = true;

  IF v_count = 1 THEN
    RETURN v_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_supervisor_usuario_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_supervisor_usuario_id(text) TO authenticated, service_role;

-- 2) Atualizar importador para popular supervisor_usuario_id
CREATE OR REPLACE FUNCTION public.import_colaboradores_bulk(_rows jsonb, _atualizar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_empresa_id uuid;
  v_projeto_id uuid;
  v_existing_id uuid;
  v_matricula text;
  v_empresa_norm text;
  v_projeto_norm text;
  v_count int;
  v_projetos_equivalentes text;
  v_supervisor_email text;
  v_supervisor_uid uuid;
  v_inserted int := 0;
  v_updated  int := 0;
  v_skipped  int := 0;
  v_errors   int := 0;
  v_details  jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão para importar colaboradores.' USING ERRCODE='insufficient_privilege';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    BEGIN
      v_matricula := public.normalize_matricula(v_row->>'matricula');
      v_empresa_id := NULL;
      v_projeto_id := NULL;

      IF nullif(v_row->>'empresa_id','') IS NOT NULL THEN
        v_empresa_id := (v_row->>'empresa_id')::uuid;
        PERFORM 1 FROM public.empresas WHERE id = v_empresa_id AND ativo = true;
        IF NOT FOUND THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            'Empresa não encontrada ou inativa (empresa_id inválido).');
          CONTINUE;
        END IF;
      ELSE
        v_empresa_norm := public.normalize_name(v_row->>'empresa');
        IF v_empresa_norm = '' THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Empresa obrigatória.');
          CONTINUE;
        END IF;
        SELECT count(*), (array_agg(id ORDER BY id))[1]
          INTO v_count, v_empresa_id
        FROM public.empresas
        WHERE public.normalize_name(nome) = v_empresa_norm
          AND ativo = true;
        IF v_count = 0 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Empresa "%s" não encontrada.', v_row->>'empresa'));
          CONTINUE;
        ELSIF v_count > 1 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Existem várias empresas cadastradas como "%s".', v_row->>'empresa'));
          CONTINUE;
        END IF;
      END IF;

      IF nullif(v_row->>'projeto_id','') IS NOT NULL THEN
        v_projeto_id := (v_row->>'projeto_id')::uuid;
        PERFORM 1 FROM public.projetos WHERE id = v_projeto_id AND empresa_id = v_empresa_id AND ativo = true;
        IF NOT FOUND THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            'Projeto inválido para a empresa informada.');
          CONTINUE;
        END IF;
      ELSE
        v_projeto_norm := public.normalize_name(v_row->>'projeto');
        IF v_projeto_norm = '' THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Projeto obrigatório.');
          CONTINUE;
        END IF;
        SELECT count(*), (array_agg(id ORDER BY id))[1]
          INTO v_count, v_projeto_id
        FROM public.projetos
        WHERE empresa_id = v_empresa_id
          AND public.normalize_name(nome) = v_projeto_norm
          AND ativo = true;
        IF v_count = 0 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Projeto "%s" não foi encontrado na empresa "%s", mesmo após normalização de espaços, acentos e hífens.',
                   v_row->>'projeto', v_row->>'empresa'));
          CONTINUE;
        ELSIF v_count > 1 THEN
          SELECT string_agg(format('"%s"', nome), ', ' ORDER BY nome)
            INTO v_projetos_equivalentes
          FROM public.projetos
          WHERE empresa_id = v_empresa_id
            AND public.normalize_name(nome) = v_projeto_norm
            AND ativo = true;
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Projeto ambíguo: existem cadastros equivalentes na empresa "%s" (%s). Selecione o projeto correto no preview.',
                   v_row->>'empresa', coalesce(v_projetos_equivalentes,'')));
          v_projeto_id := NULL;
          CONTINUE;
        END IF;
      END IF;

      -- Resolver supervisor pelo e-mail
      v_supervisor_email := lower(btrim(coalesce(v_row->>'supervisor_email','')));
      v_supervisor_uid := NULL;
      IF v_supervisor_email <> '' THEN
        v_supervisor_uid := public.resolve_supervisor_usuario_id(v_supervisor_email);
      END IF;

      SELECT id INTO v_existing_id FROM public.colaboradores
        WHERE empresa_id = v_empresa_id AND matricula = v_matricula LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        IF _atualizar THEN
          UPDATE public.colaboradores SET
            projeto_id = v_projeto_id,
            nome_completo = COALESCE(NULLIF(v_row->>'nome_completo',''), nome_completo),
            telefone = NULLIF(v_row->>'telefone',''),
            whatsapp = NULLIF(v_row->>'whatsapp',''),
            email = NULLIF(v_row->>'email',''),
            supervisor_nome = NULLIF(v_row->>'supervisor_nome',''),
            supervisor_telefone = NULLIF(v_row->>'supervisor_telefone',''),
            supervisor_email = NULLIF(v_supervisor_email,''),
            supervisor_usuario_id = COALESCE(v_supervisor_uid, supervisor_usuario_id)
          WHERE id = v_existing_id;
          v_updated := v_updated + 1;
        ELSE
          v_skipped := v_skipped + 1;
          v_details := v_details || jsonb_build_object(
            'linha', v_row->>'linha',
            'erro', 'Matrícula já existe (ignorada)',
            'matricula_normalizada', v_matricula,
            'colaborador_existente', v_existing_id
          );
          BEGIN
            INSERT INTO public.audit_logs (
              usuario_id, empresa_id, modulo, acao, entidade,
              sucesso, origem, observacoes, depois
            ) VALUES (
              auth.uid(), v_empresa_id, 'colaboradores',
              'COLABORADOR_DUPLICIDADE_BLOQUEADA', 'colaborador',
              false, 'importacao',
              'Tentativa de importação bloqueada por duplicidade (empresa + matrícula)',
              jsonb_build_object(
                'matricula_informada', v_row->>'matricula',
                'matricula_normalizada', v_matricula,
                'colaborador_existente_id', v_existing_id,
                'linha', v_row->>'linha'
              )
            );
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;
      ELSE
        INSERT INTO public.colaboradores(
          empresa_id, projeto_id, matricula, nome_completo,
          telefone, whatsapp, email,
          supervisor_nome, supervisor_telefone, supervisor_email,
          supervisor_usuario_id, ativo
        ) VALUES (
          v_empresa_id, v_projeto_id,
          v_matricula, v_row->>'nome_completo',
          NULLIF(v_row->>'telefone',''), NULLIF(v_row->>'whatsapp',''), NULLIF(v_row->>'email',''),
          NULLIF(v_row->>'supervisor_nome',''), NULLIF(v_row->>'supervisor_telefone',''), NULLIF(v_supervisor_email,''),
          v_supervisor_uid, true
        );
        v_inserted := v_inserted + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inseridas', v_inserted,
    'atualizadas', v_updated,
    'ignoradas', v_skipped,
    'erros', v_errors,
    'detalhes', v_details
  );
END;
$function$;

-- 3) Backfill administrativo — Reconciliar Supervisores
CREATE OR REPLACE FUNCTION public.backfill_supervisor_usuario_id()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_email text;
  v_count_prof int;
  v_count_sup int;
  v_uid uuid;
  v_total int := 0;
  v_atualizados int := 0;
  v_encontrado int := 0;
  v_inexistente int := 0;
  v_email_vazio int := 0;
  v_email_invalido int := 0;
  v_duplicidade int := 0;
  v_sem_papel int := 0;
  v_detalhes jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão para reconciliar supervisores.' USING ERRCODE='insufficient_privilege';
  END IF;

  FOR r IN
    SELECT id, matricula, nome_completo, empresa_id, projeto_id, supervisor_email
    FROM public.colaboradores
    WHERE supervisor_usuario_id IS NULL
      AND ativo = true
  LOOP
    v_total := v_total + 1;
    v_email := lower(btrim(coalesce(r.supervisor_email,'')));
    v_email := regexp_replace(v_email, '[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]', '', 'g');

    IF v_email = '' THEN
      v_email_vazio := v_email_vazio + 1;
      v_detalhes := v_detalhes || jsonb_build_object('colaborador_id', r.id, 'matricula', r.matricula, 'motivo', 'EMAIL_VAZIO');
      CONTINUE;
    END IF;
    IF position('@' in v_email) = 0 THEN
      v_email_invalido := v_email_invalido + 1;
      v_detalhes := v_detalhes || jsonb_build_object('colaborador_id', r.id, 'matricula', r.matricula, 'email', v_email, 'motivo', 'EMAIL_INVALIDO');
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_count_prof FROM public.profiles p
      WHERE lower(btrim(p.email)) = v_email AND p.ativo = true;

    IF v_count_prof = 0 THEN
      v_inexistente := v_inexistente + 1;
      v_detalhes := v_detalhes || jsonb_build_object('colaborador_id', r.id, 'matricula', r.matricula, 'email', v_email, 'motivo', 'SUPERVISOR_INEXISTENTE');
      CONTINUE;
    ELSIF v_count_prof > 1 THEN
      v_duplicidade := v_duplicidade + 1;
      v_detalhes := v_detalhes || jsonb_build_object('colaborador_id', r.id, 'matricula', r.matricula, 'email', v_email, 'motivo', 'DUPLICIDADE');
      CONTINUE;
    END IF;

    SELECT count(*), (array_agg(p.id))[1]
      INTO v_count_sup, v_uid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'supervisor'::app_role
    WHERE lower(btrim(p.email)) = v_email AND p.ativo = true;

    IF v_count_sup = 0 THEN
      v_sem_papel := v_sem_papel + 1;
      v_detalhes := v_detalhes || jsonb_build_object('colaborador_id', r.id, 'matricula', r.matricula, 'email', v_email, 'motivo', 'SEM_PAPEL_SUPERVISOR');
      CONTINUE;
    END IF;

    v_encontrado := v_encontrado + 1;
    UPDATE public.colaboradores SET supervisor_usuario_id = v_uid WHERE id = r.id;
    v_atualizados := v_atualizados + 1;
  END LOOP;

  BEGIN
    INSERT INTO public.audit_logs (usuario_id, modulo, acao, entidade, sucesso, origem, observacoes, depois)
    VALUES (auth.uid(), 'colaboradores', 'SUPERVISORES_RECONCILIADOS', 'colaborador', true, 'admin',
      'Backfill de supervisor_usuario_id via email',
      jsonb_build_object(
        'processados', v_total, 'atualizados', v_atualizados, 'encontrado', v_encontrado,
        'inexistente', v_inexistente, 'email_vazio', v_email_vazio, 'email_invalido', v_email_invalido,
        'duplicidade', v_duplicidade, 'sem_papel_supervisor', v_sem_papel));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'processados', v_total,
    'atualizados', v_atualizados,
    'encontrado', v_encontrado,
    'inexistente', v_inexistente,
    'email_vazio', v_email_vazio,
    'email_invalido', v_email_invalido,
    'duplicidade', v_duplicidade,
    'sem_papel_supervisor', v_sem_papel,
    'detalhes', v_detalhes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_supervisor_usuario_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_supervisor_usuario_id() TO authenticated, service_role;
