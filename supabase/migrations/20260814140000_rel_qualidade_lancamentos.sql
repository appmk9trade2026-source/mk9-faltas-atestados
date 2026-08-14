-- Nova RPC para o módulo de Qualidade de Lançamentos (Fase 1)
-- Calcula métricas de lançamentos vs correções por supervisor/projeto

CREATE OR REPLACE FUNCTION public.rel_qualidade_lancamentos(
    p_data_inicio date,
    p_data_fim date,
    p_empresa_id uuid DEFAULT NULL,
    p_projeto_id uuid DEFAULT NULL,
    p_supervisor_id uuid DEFAULT NULL
)
RETURNS TABLE (
    supervisor_id uuid,
    supervisor_nome text,
    projeto_id uuid,
    projeto_nome text,
    total_lancamentos bigint,
    total_correcoes bigint,
    taxa_acerto numeric,
    taxa_correcao numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            a.criado_por_usuario_id as s_id,
            COALESCE(a.manual_supervisor_nome, 'Supervisor Não Identificado') as s_nome,
            a.projeto_id as p_id,
            p.nome as p_nome,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE a.status = 'CANCELADO' OR a.excluida_em IS NOT NULL OR a.retificada = true) as correcoes
        FROM public.ausencias a
        LEFT JOIN public.projetos p ON a.projeto_id = p.id
        WHERE a.created_at::date >= p_data_inicio 
          AND a.created_at::date <= p_data_fim
          AND (p_empresa_id IS NULL OR a.empresa_id = p_empresa_id)
          AND (p_projeto_id IS NULL OR a.projeto_id = p_projeto_id)
          AND (p_supervisor_id IS NULL OR a.criado_por_usuario_id = p_supervisor_id)
        GROUP BY a.criado_por_usuario_id, a.manual_supervisor_nome, a.projeto_id, p.nome
    )
    SELECT 
        s_id as supervisor_id,
        s_nome as supervisor_nome,
        p_id as projeto_id,
        p_nome as projeto_nome,
        total as total_lancamentos,
        correcoes as total_correcoes,
        CASE WHEN total > 0 THEN 
            ROUND(((total - correcoes)::numeric / total::numeric) * 100, 2)
        ELSE 0 END as taxa_acerto,
        CASE WHEN total > 0 THEN 
            ROUND((correcoes::numeric / total::numeric) * 100, 2)
        ELSE 0 END as taxa_correcao
    FROM stats
    ORDER BY total DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rel_qualidade_lancamentos(date, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_qualidade_lancamentos(date, date, uuid, uuid, uuid) TO service_role;
