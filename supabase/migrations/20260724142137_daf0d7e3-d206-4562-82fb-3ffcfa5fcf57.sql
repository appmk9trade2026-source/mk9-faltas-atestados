CREATE OR REPLACE FUNCTION public.coordenacao_listar_supervisores(
  _vinculo text DEFAULT 'todos',
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _coordenador_id uuid DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  supervisor_id uuid, nome text, email text, ativo boolean,
  coordenador_id uuid, coordenador_nome text, coordenador_email text,
  colaboradores_count bigint,
  empresa_principal_id uuid, empresa_principal_nome text,
  projeto_principal_id uuid, projeto_principal_nome text,
  matricula text, created_at timestamptz, total_registros bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_busca text := NULLIF(btrim(COALESCE(_busca, '')), '');
  v_limit int := GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
  v_offset int := GREATEST(0, COALESCE(_offset, 0));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.coordenacao_pode_gerenciar(v_uid) THEN
    RAISE EXCEPTION 'Permissão negada para gerenciar Coordenação' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      ps.id                        AS sup_id,
      ps.nome                      AS sup_nome,
      ps.email                     AS sup_email,
      ps.ativo                     AS sup_ativo,
      ps.coordenador_usuario_id    AS coord_id,
      pc.nome                      AS coord_nome,
      pc.email                     AS coord_email,
      ps.created_at                AS sup_created_at,
      (SELECT count(*) FROM public.colaboradores c
        WHERE c.supervisor_usuario_id = ps.id AND c.ativo = true) AS colab_count,
      -- Projeto principal: vínculo mais recente em usuario_projetos
      (SELECT up.projeto_id FROM public.usuario_projetos up
        WHERE up.user_id = ps.id
        ORDER BY up.created_at DESC NULLS LAST LIMIT 1) AS proj_id,
      -- Matrícula: cadastro operacional do próprio supervisor (por email)
      (SELECT c.matricula FROM public.colaboradores c
        WHERE c.email IS NOT NULL AND lower(c.email) = lower(ps.email)
        ORDER BY c.ativo DESC, c.created_at DESC LIMIT 1) AS sup_matricula
    FROM public.profiles ps
    JOIN public.user_roles ur ON ur.user_id = ps.id AND ur.role = 'supervisor'::app_role
    LEFT JOIN public.profiles pc ON pc.id = ps.coordenador_usuario_id
    WHERE (
        _vinculo = 'todos'
        OR (_vinculo = 'com' AND ps.coordenador_usuario_id IS NOT NULL)
        OR (_vinculo = 'sem' AND ps.coordenador_usuario_id IS NULL)
      )
      AND (_coordenador_id IS NULL OR ps.coordenador_usuario_id = _coordenador_id)
  ),
  enriched AS (
    SELECT
      b.*,
      pr.nome        AS proj_nome,
      pr.empresa_id  AS proj_empresa_id,
      -- Empresa principal: prefere empresa do projeto principal; fallback usuario_empresas mais recente
      COALESCE(
        pr.empresa_id,
        (SELECT ue.empresa_id FROM public.usuario_empresas ue
          WHERE ue.user_id = b.sup_id
          ORDER BY ue.created_at DESC NULLS LAST LIMIT 1)
      ) AS emp_id
    FROM base b
    LEFT JOIN public.projetos pr ON pr.id = b.proj_id
  ),
  filtered AS (
    SELECT e.*, emp.nome AS emp_nome
    FROM enriched e
    LEFT JOIN public.empresas emp ON emp.id = e.emp_id
    WHERE
      (_empresa_id IS NULL OR EXISTS (
        SELECT 1 FROM public.usuario_empresas ue
        WHERE ue.user_id = e.sup_id AND ue.empresa_id = _empresa_id
      ) OR EXISTS (
        SELECT 1 FROM public.usuario_projetos up2 JOIN public.projetos pr2 ON pr2.id=up2.projeto_id
        WHERE up2.user_id = e.sup_id AND pr2.empresa_id = _empresa_id
      ))
      AND (_projeto_id IS NULL OR EXISTS (
        SELECT 1 FROM public.usuario_projetos up3
        WHERE up3.user_id = e.sup_id AND up3.projeto_id = _projeto_id
      ))
      AND (
        v_busca IS NULL
        OR e.sup_nome ILIKE '%' || v_busca || '%'
        OR e.sup_email ILIKE '%' || v_busca || '%'
        OR COALESCE(e.sup_matricula, '') ILIKE '%' || v_busca || '%'
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total_reg FROM filtered f
  )
  SELECT
    cc.sup_id, cc.sup_nome, cc.sup_email, cc.sup_ativo,
    cc.coord_id, cc.coord_nome, cc.coord_email,
    cc.colab_count,
    cc.emp_id, cc.emp_nome,
    cc.proj_id, cc.proj_nome,
    cc.sup_matricula, cc.sup_created_at, cc.total_reg
  FROM counted cc
  ORDER BY cc.sup_nome NULLS LAST
  LIMIT v_limit OFFSET v_offset;
END;
$function$;