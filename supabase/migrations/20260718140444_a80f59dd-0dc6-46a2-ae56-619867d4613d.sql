
CREATE OR REPLACE FUNCTION public.refresh_bi_absenteismo(p_origem text DEFAULT 'MANUAL')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec_id uuid := gen_random_uuid();
  v_start timestamptz := clock_timestamp();
  v_rows int := 0;
  v_locked boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR p_origem <> 'MANUAL') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_locked := pg_try_advisory_lock(hashtext('refresh_bi_absenteismo'));
  IF NOT v_locked THEN
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,mensagem_resumida)
    VALUES (v_exec_id,'IGNORADO_POR_LOCK',p_origem,now(),0,'Outra execução em andamento');
    RETURN jsonb_build_object('status','IGNORADO_POR_LOCK','execution_id',v_exec_id);
  END IF;

  BEGIN
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,mensagem_resumida)
    VALUES (v_exec_id,'INICIADO',p_origem,'Refresh iniciado');

    TRUNCATE public.bi_absenteismo_diario;

    INSERT INTO public.bi_absenteismo_diario (
      data_referencia, empresa_id, projeto_id, categoria_id, tipo_ausencia_id, status,
      total_registros, total_colaboradores_afetados, total_dias_ausencia, total_horas_estimadas,
      atestados, faltas, licencas, afastamentos, medidas_administrativas, outros, sem_duracao
    )
    SELECT
      COALESCE(a.data_inicio::date, a.created_at::date),
      c.empresa_id,
      c.projeto_id,
      t.categoria_ausencia_id,
      a.tipo_ausencia_id,
      COALESCE(a.status::text,'PENDENTE'),
      COUNT(*)::int,
      COUNT(DISTINCT a.colaborador_id)::int,
      COALESCE(SUM(NULLIF(a.quantidade_dias,0)),0)::numeric,
      COALESCE(SUM(NULLIF(a.quantidade_dias,0) * 8),0)::numeric,
      COUNT(*) FILTER (WHERE cat.codigo = 'ATESTADOS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'FALTAS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'LICENCAS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'AFASTAMENTOS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'MEDIDAS_ADMINISTRATIVAS')::int,
      COUNT(*) FILTER (WHERE cat.codigo = 'OUTROS' OR cat.codigo IS NULL)::int,
      COUNT(*) FILTER (WHERE a.quantidade_dias IS NULL OR a.quantidade_dias = 0)::int
    FROM public.ausencias a
    LEFT JOIN public.colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    LEFT JOIN public.categorias_ausencia cat ON cat.id = t.categoria_ausencia_id
    WHERE COALESCE(a.data_inicio::date, a.created_at::date) IS NOT NULL
    GROUP BY 1,2,3,4,5,6;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,linhas_processadas,mensagem_resumida)
    VALUES (v_exec_id,'CONCLUIDO',p_origem,now(),
            EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::int,
            v_rows,'Refresh concluído');

    PERFORM pg_advisory_unlock(hashtext('refresh_bi_absenteismo'));
    RETURN jsonb_build_object('status','CONCLUIDO','execution_id',v_exec_id,'linhas',v_rows);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext('refresh_bi_absenteismo'));
    INSERT INTO public.bi_refresh_execucoes(execution_id,status,origem,finalizado_em,duracao_ms,mensagem_resumida)
    VALUES (v_exec_id,'FALHOU',p_origem,now(),
            EXTRACT(MILLISECONDS FROM (clock_timestamp()-v_start))::int,
            left(SQLERRM,500));
    RETURN jsonb_build_object('status','FALHOU','execution_id',v_exec_id,'erro',SQLERRM);
  END;
END $$;
