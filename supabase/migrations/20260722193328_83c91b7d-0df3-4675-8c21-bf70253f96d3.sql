
-- ============================================================
-- Absenteísmo Intelligence — Etapa 1 (config + score)
-- ============================================================

CREATE TABLE public.absenteismo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  peso_falta numeric NOT NULL DEFAULT 3,
  peso_atestado numeric NOT NULL DEFAULT 1,
  peso_declaracao numeric NOT NULL DEFAULT 1,
  peso_suspensao numeric NOT NULL DEFAULT 4,
  peso_acidente_trabalho numeric NOT NULL DEFAULT 6,
  peso_acidente_trajeto numeric NOT NULL DEFAULT 4,
  peso_outros numeric NOT NULL DEFAULT 1,
  peso_dia_perdido numeric NOT NULL DEFAULT 0.5,
  peso_reincidencia numeric NOT NULL DEFAULT 3,
  reincidencia_janela_dias integer NOT NULL DEFAULT 30,
  reincidencia_min_ocorrencias integer NOT NULL DEFAULT 3,
  janela_dias integer NOT NULL DEFAULT 90,
  limiar_atencao numeric NOT NULL DEFAULT 5,
  limiar_alta numeric NOT NULL DEFAULT 11,
  limiar_critica numeric NOT NULL DEFAULT 21,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT absenteismo_config_singleton_uidx UNIQUE (singleton),
  CONSTRAINT absenteismo_config_singleton_chk CHECK (singleton = true),
  CONSTRAINT absenteismo_config_limiares_chk
    CHECK (limiar_atencao > 0 AND limiar_alta > limiar_atencao AND limiar_critica > limiar_alta),
  CONSTRAINT absenteismo_config_janela_chk CHECK (janela_dias BETWEEN 7 AND 365)
);

GRANT SELECT ON public.absenteismo_config TO authenticated;
GRANT ALL ON public.absenteismo_config TO service_role;

ALTER TABLE public.absenteismo_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absenteismo_config_select"
  ON public.absenteismo_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "absenteismo_config_super_admin_insert"
  ON public.absenteismo_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "absenteismo_config_super_admin_update"
  ON public.absenteismo_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.absenteismo_config_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER absenteismo_config_touch_trg
  BEFORE UPDATE ON public.absenteismo_config
  FOR EACH ROW EXECUTE FUNCTION public.absenteismo_config_touch();

-- Seed inicial (singleton)
INSERT INTO public.absenteismo_config DEFAULT VALUES;

-- ============================================================
-- RPC: calcular_score_colaborador
-- SECURITY INVOKER — herda RLS de ausencias/colaboradores
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_score_colaborador(
  _colaborador_id uuid,
  _janela_dias integer DEFAULT NULL
)
RETURNS TABLE (
  colaborador_id uuid,
  score numeric,
  nivel text,
  total_ocorrencias integer,
  total_dias_perdidos integer,
  ultima_ocorrencia timestamptz,
  breakdown jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cfg public.absenteismo_config%ROWTYPE;
  janela integer;
  data_corte date;
  v_faltas int := 0;
  v_atestados int := 0;
  v_declaracoes int := 0;
  v_suspensoes int := 0;
  v_acid_trab int := 0;
  v_acid_traj int := 0;
  v_outros int := 0;
  v_dias int := 0;
  v_total int := 0;
  v_ultima timestamptz;
  v_score numeric := 0;
  v_reincidencia_bonus numeric := 0;
  v_reinc_count int := 0;
  v_nivel text;
BEGIN
  SELECT * INTO cfg FROM public.absenteismo_config LIMIT 1;
  IF cfg IS NULL THEN
    RETURN;
  END IF;

  janela := COALESCE(_janela_dias, cfg.janela_dias);
  data_corte := (CURRENT_DATE - janela);

  SELECT
    COUNT(*) FILTER (WHERE a.tipo = 'FALTA' AND COALESCE(a.acidente_trabalho_trajeto, false) = false),
    COUNT(*) FILTER (WHERE a.tipo = 'ATESTADO'),
    COUNT(*) FILTER (WHERE a.tipo = 'DECLARACAO'),
    COUNT(*) FILTER (WHERE a.tipo = 'SUSPENSAO'),
    COUNT(*) FILTER (WHERE a.acidente_trabalho_trajeto IS TRUE),
    COUNT(*) FILTER (WHERE a.acidente_trabalho_trajeto IS FALSE AND a.tipo <> 'FALTA' AND a.tipo <> 'ATESTADO' AND a.tipo <> 'DECLARACAO' AND a.tipo <> 'SUSPENSAO'),
    COUNT(*) FILTER (WHERE a.tipo = 'OUTROS' AND a.acidente_trabalho_trajeto IS NULL),
    COALESCE(SUM(a.dias), 0),
    COUNT(*),
    MAX(a.created_at)
  INTO v_faltas, v_atestados, v_declaracoes, v_suspensoes, v_acid_trab, v_acid_traj, v_outros,
       v_dias, v_total, v_ultima
  FROM public.ausencias a
  WHERE a.colaborador_id = _colaborador_id
    AND a.data_inicio >= data_corte;

  -- Reincidência: ocorrências na sub-janela de reincidência
  SELECT COUNT(*) INTO v_reinc_count
  FROM public.ausencias a
  WHERE a.colaborador_id = _colaborador_id
    AND a.data_inicio >= (CURRENT_DATE - cfg.reincidencia_janela_dias);

  IF v_reinc_count >= cfg.reincidencia_min_ocorrencias THEN
    v_reincidencia_bonus := cfg.peso_reincidencia;
  END IF;

  v_score :=
      v_faltas       * cfg.peso_falta
    + v_atestados    * cfg.peso_atestado
    + v_declaracoes  * cfg.peso_declaracao
    + v_suspensoes   * cfg.peso_suspensao
    + v_acid_trab    * cfg.peso_acidente_trabalho
    + v_acid_traj    * cfg.peso_acidente_trajeto
    + v_outros       * cfg.peso_outros
    + v_dias         * cfg.peso_dia_perdido
    + v_reincidencia_bonus;

  v_nivel := CASE
    WHEN v_score >= cfg.limiar_critica THEN 'CRITICA'
    WHEN v_score >= cfg.limiar_alta    THEN 'ALTA'
    WHEN v_score >= cfg.limiar_atencao THEN 'ATENCAO'
    ELSE 'BAIXA'
  END;

  RETURN QUERY SELECT
    _colaborador_id,
    ROUND(v_score::numeric, 2),
    v_nivel,
    v_total,
    v_dias,
    v_ultima,
    jsonb_build_object(
      'faltas', v_faltas,
      'atestados', v_atestados,
      'declaracoes', v_declaracoes,
      'suspensoes', v_suspensoes,
      'acidente_trabalho', v_acid_trab,
      'acidente_trajeto', v_acid_traj,
      'outros', v_outros,
      'dias_perdidos', v_dias,
      'reincidencia_bonus', v_reincidencia_bonus,
      'janela_dias', janela
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calcular_score_colaborador(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_score_colaborador(uuid, integer) TO authenticated;

-- ============================================================
-- RPC lote: calcular_score_colaboradores_lote
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_score_colaboradores_lote(
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _janela_dias integer DEFAULT NULL
)
RETURNS TABLE (
  colaborador_id uuid,
  nome_completo text,
  matricula text,
  empresa_id uuid,
  projeto_id uuid,
  supervisor_usuario_id uuid,
  score numeric,
  nivel text,
  total_ocorrencias integer,
  total_dias_perdidos integer,
  ultima_ocorrencia timestamptz,
  breakdown jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.nome_completo,
    c.matricula,
    c.empresa_id,
    c.projeto_id,
    c.supervisor_usuario_id,
    s.score,
    s.nivel,
    s.total_ocorrencias,
    s.total_dias_perdidos,
    s.ultima_ocorrencia,
    s.breakdown
  FROM public.colaboradores c
  CROSS JOIN LATERAL public.calcular_score_colaborador(c.id, _janela_dias) s
  WHERE c.ativo = true
    AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
    AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id);
END;
$$;

REVOKE ALL ON FUNCTION public.calcular_score_colaboradores_lote(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calcular_score_colaboradores_lote(uuid, uuid, integer) TO authenticated;
