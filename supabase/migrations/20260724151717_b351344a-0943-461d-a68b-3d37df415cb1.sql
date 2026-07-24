
-- 1) Resolvedor detalhado (retorna uuid + motivo)
CREATE OR REPLACE FUNCTION public.resolve_supervisor_detalhado(_supervisor_usuario_id uuid, _email text)
RETURNS TABLE (supervisor_usuario_id uuid, motivo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_ativo boolean;
  v_has_role boolean;
  v_count_prof int;
  v_count_sup int;
  v_uid uuid;
BEGIN
  -- 1) UUID informado tem prioridade
  IF _supervisor_usuario_id IS NOT NULL THEN
    SELECT p.ativo INTO v_ativo FROM public.profiles p WHERE p.id = _supervisor_usuario_id;
    IF v_ativo IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_ID_INVALIDO'::text; RETURN;
    ELSIF NOT v_ativo THEN
      RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_INATIVO'::text; RETURN;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = _supervisor_usuario_id AND ur.role='supervisor'::app_role)
      INTO v_has_role;
    IF NOT v_has_role THEN
      RETURN QUERY SELECT NULL::uuid, 'USUARIO_SEM_PAPEL_SUPERVISOR'::text; RETURN;
    END IF;
    RETURN QUERY SELECT _supervisor_usuario_id, NULL::text; RETURN;
  END IF;

  -- 2) Resolver por e-mail normalizado
  v_email := lower(btrim(coalesce(_email,'')));
  v_email := regexp_replace(v_email, '[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]', '', 'g');
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_NAO_INFORMADO'::text; RETURN;
  END IF;

  SELECT count(*) INTO v_count_prof FROM public.profiles p
    WHERE lower(btrim(p.email)) = v_email;
  IF v_count_prof = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_NAO_ENCONTRADO'::text; RETURN;
  ELSIF v_count_prof > 1 THEN
    RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_EMAIL_AMBIGUO'::text; RETURN;
  END IF;

  SELECT count(*) FILTER (WHERE p.ativo = true) INTO v_count_prof
  FROM public.profiles p WHERE lower(btrim(p.email)) = v_email;
  IF v_count_prof = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_INATIVO'::text; RETURN;
  END IF;

  SELECT count(*), (array_agg(p.id))[1]
    INTO v_count_sup, v_uid
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role='supervisor'::app_role
  WHERE lower(btrim(p.email)) = v_email AND p.ativo = true;
  IF v_count_sup = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'USUARIO_SEM_PAPEL_SUPERVISOR'::text; RETURN;
  ELSIF v_count_sup > 1 THEN
    RETURN QUERY SELECT NULL::uuid, 'SUPERVISOR_EMAIL_AMBIGUO'::text; RETURN;
  END IF;

  RETURN QUERY SELECT v_uid, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_supervisor_detalhado(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_supervisor_detalhado(uuid, text) TO authenticated;

-- 2) Atualizar import_colaboradores_bulk para aceitar supervisor_usuario_id, classificar pendência e nunca bloquear o lote
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
  v_supervisor_input_uid uuid;
  v_supervisor_uid uuid;
  v_supervisor_motivo text;
  v_inserted int := 0;
  v_updated  int := 0;
  v_skipped  int := 0;
  v_errors   int := 0;
  v_pendentes int := 0;
  v_vinculados int := 0;
  v_por_motivo jsonb := '{}'::jsonb;
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
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro','Empresa não encontrada ou inativa (empresa_id inválido).');
          CONTINUE;
        END IF;
      ELSE
        v_empresa_norm := public.normalize_name(v_row->>'empresa');
        IF v_empresa_norm = '' THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro','Empresa obrigatória.');
          CONTINUE;
        END IF;
        SELECT count(*), (array_agg(id ORDER BY id))[1] INTO v_count, v_empresa_id
        FROM public.empresas WHERE public.normalize_name(nome)=v_empresa_norm AND ativo=true;
        IF v_count = 0 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro', format('Empresa "%s" não encontrada.', v_row->>'empresa'));
          CONTINUE;
        ELSIF v_count > 1 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro', format('Existem várias empresas cadastradas como "%s".', v_row->>'empresa'));
          CONTINUE;
        END IF;
      END IF;

      IF nullif(v_row->>'projeto_id','') IS NOT NULL THEN
        v_projeto_id := (v_row->>'projeto_id')::uuid;
        PERFORM 1 FROM public.projetos WHERE id = v_projeto_id AND empresa_id = v_empresa_id AND ativo=true;
        IF NOT FOUND THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro','Projeto inválido para a empresa informada.');
          CONTINUE;
        END IF;
      ELSE
        v_projeto_norm := public.normalize_name(v_row->>'projeto');
        IF v_projeto_norm = '' THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro','Projeto obrigatório.');
          CONTINUE;
        END IF;
        SELECT count(*), (array_agg(id ORDER BY id))[1] INTO v_count, v_projeto_id
        FROM public.projetos WHERE empresa_id=v_empresa_id AND public.normalize_name(nome)=v_projeto_norm AND ativo=true;
        IF v_count = 0 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro',
            format('Projeto "%s" não foi encontrado na empresa "%s".', v_row->>'projeto', v_row->>'empresa'));
          CONTINUE;
        ELSIF v_count > 1 THEN
          SELECT string_agg(format('"%s"', nome), ', ' ORDER BY nome) INTO v_projetos_equivalentes
          FROM public.projetos WHERE empresa_id=v_empresa_id AND public.normalize_name(nome)=v_projeto_norm AND ativo=true;
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro',
            format('Projeto ambíguo em "%s" (%s). Selecione o projeto correto no preview.', v_row->>'empresa', coalesce(v_projetos_equivalentes,'')));
          v_projeto_id := NULL;
          CONTINUE;
        END IF;
      END IF;

      -- Resolver supervisor: UUID informado tem prioridade sobre e-mail
      v_supervisor_email := lower(btrim(coalesce(v_row->>'supervisor_email','')));
      v_supervisor_input_uid := nullif(v_row->>'supervisor_usuario_id','')::uuid;
      SELECT r.supervisor_usuario_id, r.motivo INTO v_supervisor_uid, v_supervisor_motivo
        FROM public.resolve_supervisor_detalhado(v_supervisor_input_uid, v_supervisor_email) r;

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
            supervisor_nome = COALESCE(NULLIF(v_row->>'supervisor_nome',''), supervisor_nome),
            supervisor_telefone = COALESCE(NULLIF(v_row->>'supervisor_telefone',''), supervisor_telefone),
            supervisor_email = COALESCE(NULLIF(v_supervisor_email,''), supervisor_email),
            supervisor_usuario_id = COALESCE(v_supervisor_uid, supervisor_usuario_id)
          WHERE id = v_existing_id;
          v_updated := v_updated + 1;
        ELSE
          v_skipped := v_skipped + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro','Matrícula já existe (ignorada)',
            'matricula_normalizada', v_matricula,'colaborador_existente', v_existing_id);
          CONTINUE;
        END IF;
      ELSE
        INSERT INTO public.colaboradores(
          empresa_id, projeto_id, matricula, nome_completo, telefone, whatsapp, email,
          supervisor_nome, supervisor_telefone, supervisor_email, supervisor_usuario_id, ativo
        ) VALUES (
          v_empresa_id, v_projeto_id, v_matricula, v_row->>'nome_completo',
          NULLIF(v_row->>'telefone',''), NULLIF(v_row->>'whatsapp',''), NULLIF(v_row->>'email',''),
          NULLIF(v_row->>'supervisor_nome',''), NULLIF(v_row->>'supervisor_telefone',''),
          NULLIF(v_supervisor_email,''), v_supervisor_uid, true
        );
        v_inserted := v_inserted + 1;
      END IF;

      -- Contabilizar vínculo/pendência de supervisor
      IF v_supervisor_uid IS NOT NULL THEN
        v_vinculados := v_vinculados + 1;
      ELSE
        v_pendentes := v_pendentes + 1;
        v_por_motivo := jsonb_set(v_por_motivo,
          ARRAY[coalesce(v_supervisor_motivo,'SUPERVISOR_NAO_INFORMADO')],
          to_jsonb(coalesce((v_por_motivo->>coalesce(v_supervisor_motivo,'SUPERVISOR_NAO_INFORMADO'))::int,0) + 1));
        v_details := v_details || jsonb_build_object(
          'linha', v_row->>'linha',
          'pendencia_supervisor', v_supervisor_motivo,
          'supervisor_email', v_supervisor_email,
          'matricula', v_matricula
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_details := v_details || jsonb_build_object('linha', v_row->>'linha','erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inseridas', v_inserted,
    'atualizadas', v_updated,
    'ignoradas', v_skipped,
    'erros', v_errors,
    'supervisores_vinculados', v_vinculados,
    'supervisores_pendentes', v_pendentes,
    'pendencias_por_motivo', v_por_motivo,
    'detalhes', v_details
  );
END;
$function$;

-- 3) Listar pendências administrativas de supervisor
CREATE OR REPLACE FUNCTION public.admin_listar_pendencias_supervisor(
  _motivo text DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS TABLE (
  colaborador_id uuid, matricula text, nome_completo text,
  empresa_id uuid, empresa_nome text, projeto_id uuid, projeto_nome text,
  supervisor_nome text, supervisor_email text,
  supervisor_usuario_id uuid, motivo text,
  criado_em timestamptz, atualizado_em timestamptz, total_geral bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão para listar pendências de supervisor.' USING ERRCODE='insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.id AS colaborador_id, c.matricula, c.nome_completo,
           c.empresa_id, e.nome AS empresa_nome,
           c.projeto_id, p.nome AS projeto_nome,
           c.supervisor_nome, c.supervisor_email, c.supervisor_usuario_id,
           c.created_at AS criado_em, c.updated_at AS atualizado_em,
           (SELECT r.motivo FROM public.resolve_supervisor_detalhado(NULL, c.supervisor_email) r) AS motivo_calc
    FROM public.colaboradores c
    LEFT JOIN public.empresas e ON e.id = c.empresa_id
    LEFT JOIN public.projetos p ON p.id = c.projeto_id
    WHERE c.ativo = true AND c.supervisor_usuario_id IS NULL
  ), filtered AS (
    SELECT *,
      CASE
        WHEN motivo_calc IS NULL AND coalesce(supervisor_email,'')='' THEN 'SUPERVISOR_NAO_INFORMADO'
        ELSE coalesce(motivo_calc,'SUPERVISOR_NAO_INFORMADO')
      END AS motivo_final
    FROM base
  )
  SELECT f.colaborador_id, f.matricula, f.nome_completo,
         f.empresa_id, f.empresa_nome, f.projeto_id, f.projeto_nome,
         f.supervisor_nome, f.supervisor_email, f.supervisor_usuario_id,
         f.motivo_final, f.criado_em, f.atualizado_em,
         count(*) OVER () AS total_geral
  FROM filtered f
  WHERE (_motivo IS NULL OR f.motivo_final = _motivo)
    AND (_empresa_id IS NULL OR f.empresa_id = _empresa_id)
    AND (_projeto_id IS NULL OR f.projeto_id = _projeto_id)
    AND (_busca IS NULL OR _busca = '' OR
         f.nome_completo ILIKE '%'||_busca||'%' OR
         f.matricula ILIKE '%'||_busca||'%' OR
         coalesce(f.supervisor_email,'') ILIKE '%'||_busca||'%' OR
         coalesce(f.supervisor_nome,'') ILIKE '%'||_busca||'%')
  ORDER BY f.motivo_final, f.empresa_nome, f.nome_completo
  LIMIT greatest(_limit,1) OFFSET greatest(_offset,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_listar_pendencias_supervisor(text,uuid,uuid,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_listar_pendencias_supervisor(text,uuid,uuid,text,int,int) TO authenticated;

-- 4) Auditoria preventiva - resumos administrativos
CREATE OR REPLACE FUNCTION public.admin_auditoria_supervisor_integridade()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT jsonb_build_object(
    'colaboradores_ativos', (SELECT count(*) FROM public.colaboradores WHERE ativo),
    'sem_supervisor', (SELECT count(*) FROM public.colaboradores WHERE ativo AND supervisor_usuario_id IS NULL AND coalesce(supervisor_email,'')=''),
    'email_sem_uid', (SELECT count(*) FROM public.colaboradores WHERE ativo AND supervisor_usuario_id IS NULL AND coalesce(supervisor_email,'')<>''),
    'uid_inexistente', (SELECT count(*) FROM public.colaboradores c WHERE c.ativo AND c.supervisor_usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=c.supervisor_usuario_id)),
    'uid_sem_papel', (SELECT count(*) FROM public.colaboradores c WHERE c.ativo AND c.supervisor_usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=c.supervisor_usuario_id AND ur.role='supervisor'::app_role)),
    'supervisor_inativo', (SELECT count(*) FROM public.colaboradores c JOIN public.profiles p ON p.id=c.supervisor_usuario_id WHERE c.ativo AND NOT p.ativo),
    'email_divergente', (SELECT count(*) FROM public.colaboradores c JOIN public.profiles p ON p.id=c.supervisor_usuario_id WHERE c.ativo AND coalesce(c.supervisor_email,'') <> '' AND lower(btrim(c.supervisor_email)) <> lower(btrim(p.email)))
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_auditoria_supervisor_integridade() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auditoria_supervisor_integridade() TO authenticated;

-- 5) Buscar supervisores válidos (para correção manual)
CREATE OR REPLACE FUNCTION public.admin_buscar_supervisores(_busca text, _limit int DEFAULT 20)
RETURNS TABLE (id uuid, nome_completo text, email text, matricula text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT p.id, p.nome_completo, p.email, p.matricula
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id=p.id AND ur.role='supervisor'::app_role
  WHERE p.ativo = true
    AND (_busca IS NULL OR _busca = '' OR
         p.nome_completo ILIKE '%'||_busca||'%' OR
         p.email ILIKE '%'||_busca||'%' OR
         coalesce(p.matricula,'') ILIKE '%'||_busca||'%')
  ORDER BY p.nome_completo
  LIMIT greatest(_limit,1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_buscar_supervisores(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_buscar_supervisores(text,int) TO authenticated;
