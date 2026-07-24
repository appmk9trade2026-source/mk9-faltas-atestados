
CREATE OR REPLACE FUNCTION public.admin_integridade_resumo()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'rh')) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'supervisor_sem_coordenador', (
      SELECT count(*) FROM public.profiles p
       WHERE p.ativo AND public.has_role(p.id,'supervisor')
         AND p.coordenador_usuario_id IS NULL
    ),
    'colaborador_sem_supervisor', (
      SELECT count(*) FROM public.colaboradores c
       WHERE c.ativo AND c.supervisor_usuario_id IS NULL
         AND (c.supervisor_email IS NULL OR btrim(c.supervisor_email) = '')
    ),
    'supervisor_email_sem_uuid', (
      SELECT count(*) FROM public.colaboradores c
       WHERE c.ativo AND c.supervisor_usuario_id IS NULL
         AND c.supervisor_email IS NOT NULL AND btrim(c.supervisor_email) <> ''
    ),
    'supervisor_sem_matricula', (
      SELECT count(*) FROM public.profiles p
       WHERE p.ativo AND public.has_role(p.id,'supervisor')
         AND (p.matricula IS NULL OR btrim(p.matricula) = '')
    ),
    'usuario_sem_empresa', (
      SELECT count(*) FROM public.profiles p
       WHERE p.ativo AND NOT public.has_role(p.id,'super_admin')
         AND NOT EXISTS (SELECT 1 FROM public.usuario_empresas ue WHERE ue.user_id = p.id)
    ),
    'usuario_sem_projeto', (
      SELECT count(*) FROM public.profiles p
       WHERE p.ativo
         AND EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = p.id
              AND ur.role IN ('supervisor','coordenador','operacao')
         )
         AND NOT EXISTS (SELECT 1 FROM public.usuario_projetos up WHERE up.user_id = p.id)
    ),
    'matricula_duplicada', (
      SELECT COALESCE(sum(cnt),0)::bigint FROM (
        SELECT count(*) AS cnt FROM public.profiles
         WHERE matricula IS NOT NULL AND btrim(matricula) <> ''
         GROUP BY lower(btrim(matricula))
         HAVING count(*) > 1
      ) x
    ),
    'vinculo_orfao', (
      SELECT count(*) FROM public.colaboradores c
       WHERE c.supervisor_usuario_id IS NOT NULL
         AND (
           NOT EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = c.supervisor_usuario_id)
           OR NOT public.has_role(c.supervisor_usuario_id,'supervisor')
         )
    ),
    'gerado_em', now()
  ) INTO r;

  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.admin_integridade_resumo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_integridade_resumo() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_integridade_listar(
  _tipo text DEFAULT NULL,
  _criticidade text DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
) RETURNS TABLE (
  registro_id uuid,
  tipo text,
  criticidade text,
  entidade text,
  nome text,
  email text,
  matricula text,
  empresa_id uuid,
  empresa_nome text,
  projeto_id uuid,
  projeto_nome text,
  descricao text,
  causa text,
  acao_recomendada text,
  detectado_em timestamptz,
  total_geral bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_busca text := NULLIF(btrim(coalesce(_busca,'')), '');
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'rh')) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id AS registro_id,
      'supervisor_sem_coordenador'::text AS tipo,
      'alta'::text AS criticidade,
      'usuario'::text AS entidade,
      p.nome, p.email, p.matricula,
      NULL::uuid AS empresa_id, NULL::text AS empresa_nome,
      NULL::uuid AS projeto_id, NULL::text AS projeto_nome,
      'Supervisor ativo sem Coordenador vinculado.'::text AS descricao,
      'coordenador_usuario_id nulo em profiles.'::text AS causa,
      'Abrir Gestão de Coordenação.'::text AS acao_recomendada,
      p.updated_at AS detectado_em
    FROM public.profiles p
    WHERE p.ativo AND public.has_role(p.id,'supervisor')
      AND p.coordenador_usuario_id IS NULL

    UNION ALL
    SELECT c.id, 'colaborador_sem_supervisor','media','colaborador',
      c.nome_completo, c.email, c.matricula,
      c.empresa_id, e.nome, c.projeto_id, pr.nome,
      'Colaborador ativo sem supervisor informado.',
      'supervisor_email e supervisor_usuario_id ausentes.',
      'Editar cadastro do colaborador.',
      c.updated_at
    FROM public.colaboradores c
    LEFT JOIN public.empresas e ON e.id = c.empresa_id
    LEFT JOIN public.projetos pr ON pr.id = c.projeto_id
    WHERE c.ativo AND c.supervisor_usuario_id IS NULL
      AND (c.supervisor_email IS NULL OR btrim(c.supervisor_email) = '')

    UNION ALL
    SELECT c.id, 'supervisor_email_sem_uuid','critica','colaborador',
      c.nome_completo, c.email, c.matricula,
      c.empresa_id, e.nome, c.projeto_id, pr.nome,
      'E-mail de supervisor informado sem vínculo canônico (UUID).',
      'supervisor_email preenchido e supervisor_usuario_id nulo.',
      'Resolver em Pendências de Supervisor.',
      c.updated_at
    FROM public.colaboradores c
    LEFT JOIN public.empresas e ON e.id = c.empresa_id
    LEFT JOIN public.projetos pr ON pr.id = c.projeto_id
    WHERE c.ativo AND c.supervisor_usuario_id IS NULL
      AND c.supervisor_email IS NOT NULL AND btrim(c.supervisor_email) <> ''

    UNION ALL
    SELECT p.id, 'supervisor_sem_matricula','media','usuario',
      p.nome, p.email, p.matricula,
      NULL, NULL, NULL, NULL,
      'Supervisor sem matrícula cadastrada.',
      'profiles.matricula nula ou vazia.',
      'Editar o usuário e informar matrícula.',
      p.updated_at
    FROM public.profiles p
    WHERE p.ativo AND public.has_role(p.id,'supervisor')
      AND (p.matricula IS NULL OR btrim(p.matricula) = '')

    UNION ALL
    SELECT p.id, 'usuario_sem_empresa','baixa','usuario',
      p.nome, p.email, p.matricula,
      NULL, NULL, NULL, NULL,
      'Usuário ativo sem empresa vinculada.',
      'Sem registro em usuario_empresas.',
      'Editar o usuário e vincular empresa.',
      p.updated_at
    FROM public.profiles p
    WHERE p.ativo AND NOT public.has_role(p.id,'super_admin')
      AND NOT EXISTS (SELECT 1 FROM public.usuario_empresas ue WHERE ue.user_id = p.id)

    UNION ALL
    SELECT p.id, 'usuario_sem_projeto','baixa','usuario',
      p.nome, p.email, p.matricula,
      NULL, NULL, NULL, NULL,
      'Usuário operacional sem projeto vinculado.',
      'Sem registro em usuario_projetos.',
      'Editar o usuário e vincular projeto.',
      p.updated_at
    FROM public.profiles p
    WHERE p.ativo
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = p.id
           AND ur.role IN ('supervisor','coordenador','operacao')
      )
      AND NOT EXISTS (SELECT 1 FROM public.usuario_projetos up WHERE up.user_id = p.id)

    UNION ALL
    SELECT p.id, 'matricula_duplicada','alta','usuario',
      p.nome, p.email, p.matricula,
      NULL, NULL, NULL, NULL,
      'Matrícula duplicada entre usuários.',
      ('Repetida com ' || (d.cnt - 1)::text || ' outro(s) registro(s).'),
      'Editar o usuário e corrigir a matrícula.',
      p.updated_at
    FROM public.profiles p
    JOIN (
      SELECT lower(btrim(matricula)) AS chave, count(*) AS cnt
      FROM public.profiles
      WHERE matricula IS NOT NULL AND btrim(matricula) <> ''
      GROUP BY 1 HAVING count(*) > 1
    ) d ON d.chave = lower(btrim(p.matricula))

    UNION ALL
    SELECT c.id, 'vinculo_orfao','critica','colaborador',
      c.nome_completo, c.email, c.matricula,
      c.empresa_id, e.nome, c.projeto_id, pr.nome,
      'Vínculo de supervisor aponta para usuário inexistente ou sem papel.',
      'supervisor_usuario_id inválido ou papel incompatível.',
      'Resolver em Pendências de Supervisor.',
      c.updated_at
    FROM public.colaboradores c
    LEFT JOIN public.empresas e ON e.id = c.empresa_id
    LEFT JOIN public.projetos pr ON pr.id = c.projeto_id
    WHERE c.supervisor_usuario_id IS NOT NULL
      AND (
        NOT EXISTS (SELECT 1 FROM public.profiles pp WHERE pp.id = c.supervisor_usuario_id)
        OR NOT public.has_role(c.supervisor_usuario_id,'supervisor')
      )
  ),
  filtered AS (
    SELECT * FROM base
     WHERE (_tipo IS NULL OR tipo = _tipo)
       AND (_criticidade IS NULL OR criticidade = _criticidade)
       AND (_empresa_id IS NULL OR empresa_id = _empresa_id)
       AND (_projeto_id IS NULL OR projeto_id = _projeto_id)
       AND (v_busca IS NULL OR
            nome ILIKE '%' || v_busca || '%' OR
            coalesce(email,'') ILIKE '%' || v_busca || '%' OR
            coalesce(matricula,'') ILIKE '%' || v_busca || '%' OR
            coalesce(empresa_nome,'') ILIKE '%' || v_busca || '%' OR
            coalesce(projeto_nome,'') ILIKE '%' || v_busca || '%')
  ),
  cnt AS (SELECT count(*) AS n FROM filtered)
  SELECT f.registro_id, f.tipo, f.criticidade, f.entidade, f.nome, f.email, f.matricula,
         f.empresa_id, f.empresa_nome, f.projeto_id, f.projeto_nome,
         f.descricao, f.causa, f.acao_recomendada, f.detectado_em, cnt.n
    FROM filtered f CROSS JOIN cnt
   ORDER BY
     CASE f.criticidade
       WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
       WHEN 'media' THEN 2 ELSE 3
     END,
     f.detectado_em DESC NULLS LAST,
     f.nome
   LIMIT COALESCE(_limit, 50)
   OFFSET COALESCE(_offset, 0);
END $$;

REVOKE ALL ON FUNCTION public.admin_integridade_listar(text,text,uuid,uuid,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_integridade_listar(text,text,uuid,uuid,text,integer,integer) TO authenticated;
