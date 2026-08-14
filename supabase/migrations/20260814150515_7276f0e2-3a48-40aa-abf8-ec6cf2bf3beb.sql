
-- 1. Criar tipo enum para categorias de exclusão
DO $$ BEGIN
    CREATE TYPE public.ausencia_motivo_exclusao_categoria_v2 AS ENUM (
        'DATA_PERIODO_INCORRETO',
        'DUPLICIDADE',
        'COLABORADOR_INCORRETO',
        'TIPO_INCORRETO',
        'PROJETO_INCORRETO',
        'DOCUMENTO_INCORRETO',
        'LANCAMENTO_INDEVIDO',
        'CANCELAMENTO_ADMINISTRATIVO',
        'OUTRO'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Adicionar coluna e_erro_supervisor se não existir
ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS e_erro_supervisor boolean;

-- 3. Criar função para determinar se uma categoria é erro
CREATE OR REPLACE FUNCTION public.check_is_error_supervisor(cat public.ausencia_motivo_exclusao_categoria_v2)
RETURNS boolean AS $$
BEGIN
    RETURN cat IN (
        'DATA_PERIODO_INCORRETO',
        'DUPLICIDADE',
        'COLABORADOR_INCORRETO',
        'TIPO_INCORRETO',
        'PROJETO_INCORRETO',
        'DOCUMENTO_INCORRETO',
        'LANCAMENTO_INDEVIDO'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Atualizar excluir_ausencia_segura para usar o novo enum e a nova lógica
CREATE OR REPLACE FUNCTION public.excluir_ausencia_segura(
  p_ausencia_id uuid,
  p_motivo text,
  p_categoria_motivo text,
  p_is_error_manual boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user_nome text;
  v_user_papel text;
  v_ausencia record;
  v_categoria_enum public.ausencia_motivo_exclusao_categoria_v2;
  v_is_error boolean;
BEGIN
  -- 1. Obter usuário logado
  v_user_id := auth.uid();
  
  -- 2. Validar permissão (Super Admin ou RH)
  SELECT 
    p.nome, 
    ur.role::text INTO v_user_nome, v_user_papel
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = v_user_id
    AND ur.role IN ('super_admin', 'rh')
  LIMIT 1;

  IF v_user_id IS NULL OR v_user_papel IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Admin e RH podem excluir lançamentos.' 
      USING ERRCODE = '42501';
  END IF;

  -- 3. Verificar existência da ausência
  SELECT * INTO v_ausencia 
  FROM public.ausencias 
  WHERE id = p_ausencia_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ausência não encontrada (ID: %)', p_ausencia_id;
  END IF;

  -- Converter categoria para enum
  BEGIN
    v_categoria_enum := p_categoria_motivo::public.ausencia_motivo_exclusao_categoria_v2;
  EXCEPTION WHEN OTHERS THEN
    v_categoria_enum := 'OUTRO';
  END;

  -- Determinar se é erro do supervisor
  IF v_categoria_enum = 'OUTRO' AND p_is_error_manual IS NOT NULL THEN
    v_is_error := p_is_error_manual;
  ELSE
    v_is_error := public.check_is_error_supervisor(v_categoria_enum);
  END IF;

  -- 4. Aplicar exclusão lógica
  UPDATE public.ausencias
  SET 
    status_documental = 'EXCLUIDO',
    excluida_em = now(),
    excluida_por_usuario_id = v_user_id,
    excluidora_nome_snapshot = v_user_nome,
    excluidora_papel_snapshot = v_user_papel,
    motivo_exclusao_categoria = p_categoria_motivo,
    motivo_exclusao_detalhe = p_motivo,
    status = 'CANCELADO',
    e_erro_supervisor = v_is_error
  WHERE id = p_ausencia_id;

  -- 5. Auditoria
  PERFORM public.log_audit_event(
    _modulo := 'ausencias',
    _acao := 'AUSENCIA_EXCLUIDA'::public.audit_action,
    _entidade := 'Ausência',
    _registro_id := p_ausencia_id,
    _empresa_id := v_ausencia.empresa_id,
    _projeto_id := v_ausencia.projeto_id,
    _antes := row_to_json(v_ausencia)::jsonb,
    _depois := jsonb_build_object(
      'status_documental', 'EXCLUIDO',
      'motivo_exclusao_categoria', p_categoria_motivo,
      'motivo_exclusao_detalhe', p_motivo,
      'e_erro_supervisor', v_is_error
    ),
    _sucesso := true,
    _observacoes := 'Exclusão lógica realizada via interface administrativa.',
    _origem := 'rpc'
  );

  RETURN jsonb_build_object(
    'success', true,
    'ausencia_id', p_ausencia_id,
    'status_documental', 'EXCLUIDO',
    'e_erro_supervisor', v_is_error
  );
END;
$$;

-- 5. Atualizar RPC de indicadores para Fase 2 (Drop and Recreate to change signature)
DROP FUNCTION IF EXISTS public.rel_qualidade_lancamentos(date,date,uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.rel_qualidade_lancamentos(
  p_data_inicio date,
  p_data_fim date,
  p_empresa_id uuid DEFAULT NULL,
  p_projeto_id uuid DEFAULT NULL,
  p_supervisor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  supervisor_id uuid,
  supervisor_nome text,
  projeto_id uuid,
  projeto_nome text,
  total_lancamentos bigint,
  total_correcoes bigint,
  lancamentos_com_erro bigint,
  taxa_acerto numeric,
  taxa_erro numeric,
  erros_por_100 numeric,
  principal_causa text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH base_stats AS (
        SELECT 
            a.registrado_por as s_id,
            COALESCE(prof.nome, a.manual_supervisor_nome, 'Supervisor Não Identificado') as s_nome,
            a.projeto_id as p_id,
            p.nome as p_nome,
            a.id as a_id,
            (a.status::text IN ('CANCELADO', 'EXCLUIDO') OR a.excluida_em IS NOT NULL OR a.retificada = true) as corrigida,
            (a.e_erro_supervisor = true) as erro
        FROM public.ausencias a
        LEFT JOIN public.projetos p ON a.projeto_id = p.id
        LEFT JOIN public.profiles prof ON a.registrado_por = prof.id
        WHERE a.registrado_em::date >= p_data_inicio 
          AND a.registrado_em::date <= p_data_fim
          AND (p_empresa_id IS NULL OR a.empresa_id = p_empresa_id)
          AND (p_projeto_id IS NULL OR a.projeto_id = p_projeto_id)
          AND (p_supervisor_id IS NULL OR a.registrado_por = p_supervisor_id)
    ),
    agg_stats AS (
        SELECT 
            s_id,
            s_nome,
            p_id,
            p_nome,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE corrigida) as corrections,
            COUNT(*) FILTER (WHERE erro) as errors
        FROM base_stats
        GROUP BY s_id, s_nome, p_id, p_nome
    ),
    causes AS (
        SELECT 
            a.registrado_por as s_id,
            a.projeto_id as p_id,
            a.motivo_exclusao_categoria,
            COUNT(*) as cat_count,
            ROW_NUMBER() OVER(PARTITION BY a.registrado_por, a.projeto_id ORDER BY COUNT(*) DESC) as rnk
        FROM public.ausencias a
        WHERE a.registrado_em::date >= p_data_inicio 
          AND a.registrado_em::date <= p_data_fim
          AND a.e_erro_supervisor = true
        GROUP BY a.registrado_por, a.projeto_id, a.motivo_exclusao_categoria
    )
    SELECT 
        s.s_id,
        s.s_nome,
        s.p_id,
        s.p_nome,
        s.total,
        s.corrections,
        s.errors,
        CASE WHEN s.total > 0 THEN 
            ROUND(((s.total - s.errors)::numeric / s.total::numeric) * 100, 2)
        ELSE NULL END,
        CASE WHEN s.total > 0 THEN 
            ROUND((s.errors::numeric / s.total::numeric) * 100, 2)
        ELSE NULL END,
        CASE WHEN s.total > 0 THEN 
            ROUND((s.errors::numeric / s.total::numeric) * 100, 2)
        ELSE NULL END,
        COALESCE(c.motivo_exclusao_categoria, 'N/A')
    FROM agg_stats s
    LEFT JOIN causes c ON s.s_id = c.s_id AND s.p_id = c.p_id AND c.rnk = 1
    ORDER BY errors DESC, total DESC;
END;
$$;
