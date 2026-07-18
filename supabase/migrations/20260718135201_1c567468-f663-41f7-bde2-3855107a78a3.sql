
-- ============================================================================
-- ETAPA 25 — MOTOR DE MATERIALIZAÇÃO V2
-- ============================================================================

-- 1) Tabela de métricas agregadas (append-only via UPSERT por dia/tipo/sev)
CREATE TABLE IF NOT EXISTS public.notificacao_metricas_agregadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  tipo public.notif_tipo NOT NULL,
  severidade public.notif_severidade NOT NULL,
  materializadas bigint NOT NULL DEFAULT 0,
  suprimidas bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_date, tipo, severidade)
);

GRANT SELECT ON public.notificacao_metricas_agregadas TO authenticated;
GRANT ALL ON public.notificacao_metricas_agregadas TO service_role;

ALTER TABLE public.notificacao_metricas_agregadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_metricas_leitura" ON public.notificacao_metricas_agregadas;
CREATE POLICY "notif_metricas_leitura" ON public.notificacao_metricas_agregadas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE INDEX IF NOT EXISTS ix_notif_metricas_bucket
  ON public.notificacao_metricas_agregadas (bucket_date DESC, tipo);

-- 2) Materializador V2 — ponto único de decisão
CREATE OR REPLACE FUNCTION public.materializar_notificacao(
  _tipo public.notif_tipo,
  _titulo text,
  _mensagem text,
  _severidade public.notif_severidade DEFAULT 'INFO',
  _origem public.notif_origem DEFAULT 'SISTEMA',
  _origem_id uuid DEFAULT NULL,
  _modulo text DEFAULT NULL,
  _rota_destino text DEFAULT NULL,
  _destinatario_usuario_id uuid DEFAULT NULL,
  _destinatario_papel public.app_role DEFAULT NULL,
  _ambiente text DEFAULT 'producao',
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL,
  _expira_em timestamptz DEFAULT NULL,
  _created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
  v_cand uuid[];
  v_eligible uuid[] := '{}';
  v_suprimidos int := 0;
  v_cfg record;
  v_pref jsonb;
  v_u uuid;
  v_obrigatoria bool;
  v_bucket date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF _destinatario_usuario_id IS NULL AND _destinatario_papel IS NULL THEN
    RAISE EXCEPTION 'Destinatário obrigatório.' USING ERRCODE='check_violation';
  END IF;

  -- Idempotência: reutiliza notificação existente sem re-materializar
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.notificacoes WHERE idempotency_key = _idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object(
        'decisao','MATERIALIZAR',
        'notificacao_id', v_existing,
        'motivo','IDEMPOTENCIA',
        'reused', true
      );
    END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.notificacao_tipos_config WHERE tipo = _tipo;
  v_obrigatoria := COALESCE(v_cfg.obrigatoria, false) OR _severidade IN ('ALTA','CRITICA');

  -- Coleta candidatos (usuário direto ou fan-out por papel)
  IF _destinatario_usuario_id IS NOT NULL THEN
    v_cand := ARRAY[_destinatario_usuario_id];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT ur.user_id), '{}')
      INTO v_cand
      FROM public.user_roles ur
      WHERE ur.role = _destinatario_papel;
  END IF;

  -- Decisão por candidato: consulta preferência efetiva (uma vez por usuário)
  IF v_cand IS NOT NULL AND array_length(v_cand,1) IS NOT NULL THEN
    FOREACH v_u IN ARRAY v_cand LOOP
      v_pref := public.preferencia_notificacao_efetiva(v_u, _tipo, _severidade);
      IF COALESCE((v_pref->>'habilitada')::bool, true) THEN
        v_eligible := v_eligible || v_u;
      ELSE
        v_suprimidos := v_suprimidos + 1;
      END IF;
    END LOOP;
  END IF;

  -- Obrigatória: força materialização a todos os candidatos
  IF v_obrigatoria THEN
    v_eligible := COALESCE(v_cand, '{}'::uuid[]);
    v_suprimidos := 0;
  END IF;

  -- Suprimir totalmente (nada a materializar e não obrigatória)
  IF array_length(v_eligible, 1) IS NULL THEN
    INSERT INTO public.notificacao_metricas_agregadas (bucket_date, tipo, severidade, suprimidas)
    VALUES (v_bucket, _tipo, _severidade, GREATEST(v_suprimidos, 1))
    ON CONFLICT (bucket_date, tipo, severidade) DO UPDATE
      SET suprimidas = notificacao_metricas_agregadas.suprimidas + EXCLUDED.suprimidas,
          updated_at = now();

    RETURN jsonb_build_object(
      'decisao','SUPRIMIR',
      'motivo', CASE WHEN v_cand IS NULL OR array_length(v_cand,1) IS NULL
                     THEN 'SEM_CANDIDATOS' ELSE 'PREFERENCIA_USUARIO' END,
      'candidatos', COALESCE(array_length(v_cand,1),0),
      'suprimidos', v_suprimidos
    );
  END IF;

  -- Materializar notificação + destinatários elegíveis
  INSERT INTO public.notificacoes (
    tipo, titulo, mensagem, severidade, origem, origem_id, modulo, rota_destino,
    destinatario_usuario_id, destinatario_papel, ambiente, metadata,
    idempotency_key, expira_em, created_by
  ) VALUES (
    _tipo, _titulo, _mensagem, _severidade, _origem, _origem_id, _modulo, _rota_destino,
    _destinatario_usuario_id, _destinatario_papel, _ambiente,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object(
      'v2_obrigatoria', v_obrigatoria,
      'v2_suprimidos_no_fanout', v_suprimidos
    ),
    _idempotency_key, _expira_em, COALESCE(_created_by, auth.uid())
  ) RETURNING id INTO v_id;

  INSERT INTO public.notificacao_usuarios (notificacao_id, usuario_id)
  SELECT v_id, u FROM unnest(v_eligible) AS u
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notificacao_eventos (notificacao_id, evento, metadata, created_by)
  VALUES (
    v_id, 'CRIADA',
    jsonb_build_object(
      'tipo', _tipo,
      'severidade', _severidade,
      'destinatarios', array_length(v_eligible,1),
      'suprimidos', v_suprimidos,
      'obrigatoria', v_obrigatoria
    ),
    COALESCE(_created_by, auth.uid())
  );

  INSERT INTO public.notificacao_metricas_agregadas (bucket_date, tipo, severidade, materializadas, suprimidas)
  VALUES (v_bucket, _tipo, _severidade, 1, v_suprimidos)
  ON CONFLICT (bucket_date, tipo, severidade) DO UPDATE
    SET materializadas = notificacao_metricas_agregadas.materializadas + 1,
        suprimidas = notificacao_metricas_agregadas.suprimidas + EXCLUDED.suprimidas,
        updated_at = now();

  RETURN jsonb_build_object(
    'decisao','MATERIALIZAR',
    'notificacao_id', v_id,
    'motivo', CASE WHEN v_obrigatoria THEN 'REGRA_OBRIGATORIA' ELSE 'ELEGIVEIS' END,
    'destinatarios', array_length(v_eligible,1),
    'suprimidos', v_suprimidos,
    'obrigatoria', v_obrigatoria
  );
END $$;

REVOKE ALL ON FUNCTION public.materializar_notificacao(
  public.notif_tipo, text, text, public.notif_severidade, public.notif_origem, uuid, text, text,
  uuid, public.app_role, text, jsonb, text, timestamptz, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.materializar_notificacao(
  public.notif_tipo, text, text, public.notif_severidade, public.notif_origem, uuid, text, text,
  uuid, public.app_role, text, jsonb, text, timestamptz, uuid
) TO authenticated, service_role;

-- 3) Wrapper de compatibilidade: criar_notificacao delega ao V2
CREATE OR REPLACE FUNCTION public.criar_notificacao(
  _tipo public.notif_tipo, _titulo text, _mensagem text,
  _severidade public.notif_severidade DEFAULT 'INFO',
  _origem public.notif_origem DEFAULT 'SISTEMA',
  _origem_id uuid DEFAULT NULL, _modulo text DEFAULT NULL, _rota_destino text DEFAULT NULL,
  _destinatario_usuario_id uuid DEFAULT NULL, _destinatario_papel public.app_role DEFAULT NULL,
  _ambiente text DEFAULT 'producao', _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL, _expira_em timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Somente Super Admin pode criar notificações diretamente.'
      USING ERRCODE='insufficient_privilege';
  END IF;

  v_res := public.materializar_notificacao(
    _tipo, _titulo, _mensagem, _severidade, _origem, _origem_id, _modulo, _rota_destino,
    _destinatario_usuario_id, _destinatario_papel, _ambiente, _metadata,
    _idempotency_key, _expira_em, auth.uid()
  );

  RETURN NULLIF(v_res->>'notificacao_id','')::uuid;
END $$;

-- 4) Trigger de incidentes usando o V2
CREATE OR REPLACE FUNCTION public.tg_incidente_notificar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.materializar_notificacao(
      'INCIDENTE_CRIADO'::public.notif_tipo,
      'Novo incidente: '||NEW.codigo, COALESCE(NEW.titulo,''),
      CASE NEW.severidade::text
        WHEN 'CRITICA' THEN 'CRITICA'::public.notif_severidade
        WHEN 'ALTA' THEN 'ALTA'::public.notif_severidade
        WHEN 'MEDIA' THEN 'ATENCAO'::public.notif_severidade
        ELSE 'INFO'::public.notif_severidade
      END,
      'OPERACAO_ASSISTIDA'::public.notif_origem, NEW.id, NULL, '/operacao-assistida',
      NULL, 'super_admin'::public.app_role, 'producao',
      jsonb_build_object('codigo',NEW.codigo,'prioridade',NEW.prioridade,'severidade',NEW.severidade),
      'INCIDENTE_CRIADO:'||NEW.id::text, NULL, NULL
    );

    IF NEW.prioridade = 'P1' THEN
      PERFORM public.materializar_notificacao(
        'INCIDENTE_P1'::public.notif_tipo,
        'P1 criado: '||NEW.codigo, COALESCE(NEW.titulo,''),
        'CRITICA'::public.notif_severidade,
        'OPERACAO_ASSISTIDA'::public.notif_origem, NEW.id, NULL, '/operacao-assistida',
        NULL, 'super_admin'::public.app_role, 'producao',
        jsonb_build_object('codigo',NEW.codigo),
        'INCIDENTE_P1_NOVO:'||NEW.id::text, NULL, NULL
      );
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id AND NEW.responsavel_id IS NOT NULL THEN
      PERFORM public.materializar_notificacao(
        'INCIDENTE_ATRIBUIDO'::public.notif_tipo,
        'Incidente atribuído: '||NEW.codigo,
        'Você foi designado como responsável.',
        'ATENCAO'::public.notif_severidade,
        'OPERACAO_ASSISTIDA'::public.notif_origem, NEW.id, NULL, '/operacao-assistida',
        NEW.responsavel_id, NULL, 'producao',
        jsonb_build_object('codigo',NEW.codigo),
        'INCIDENTE_ATRIB:'||NEW.id::text||':'||NEW.responsavel_id::text, NULL, NULL
      );
    END IF;

    IF NEW.status = 'RESOLVIDO' AND OLD.status <> 'RESOLVIDO' THEN
      PERFORM public.materializar_notificacao(
        'INCIDENTE_RESOLVIDO'::public.notif_tipo,
        'Incidente resolvido: '||NEW.codigo,
        'Aguardando validação/encerramento.',
        'INFO'::public.notif_severidade,
        'OPERACAO_ASSISTIDA'::public.notif_origem, NEW.id, NULL, '/operacao-assistida',
        NULL, 'compliance'::public.app_role, 'producao',
        jsonb_build_object('codigo',NEW.codigo),
        'INCIDENTE_RESOLVIDO:'||NEW.id::text, NULL, NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- 5) materializar_destinatarios: rede de segurança para chamadas legadas —
--    passa a respeitar preferência efetiva (obrigatórias continuam entrando).
CREATE OR REPLACE FUNCTION public.materializar_destinatarios(_notificacao_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n public.notificacoes;
  v_cfg record;
  v_obrigatoria bool;
  v_cnt int := 0;
BEGIN
  SELECT * INTO v_n FROM public.notificacoes WHERE id = _notificacao_id;
  IF v_n.id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_cfg FROM public.notificacao_tipos_config WHERE tipo = v_n.tipo;
  v_obrigatoria := COALESCE(v_cfg.obrigatoria,false) OR v_n.severidade IN ('ALTA','CRITICA');

  IF v_n.destinatario_usuario_id IS NOT NULL THEN
    IF v_obrigatoria OR COALESCE((public.preferencia_notificacao_efetiva(
         v_n.destinatario_usuario_id, v_n.tipo, v_n.severidade)->>'habilitada')::bool, true) THEN
      INSERT INTO public.notificacao_usuarios(notificacao_id, usuario_id)
      VALUES (v_n.id, v_n.destinatario_usuario_id)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
    END IF;
  ELSIF v_n.destinatario_papel IS NOT NULL THEN
    INSERT INTO public.notificacao_usuarios(notificacao_id, usuario_id)
    SELECT v_n.id, ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = v_n.destinatario_papel
      AND (v_obrigatoria
           OR COALESCE((public.preferencia_notificacao_efetiva(
               ur.user_id, v_n.tipo, v_n.severidade)->>'habilitada')::bool, true))
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
  END IF;

  RETURN v_cnt;
END $$;

-- 6) Métricas expandidas
CREATE OR REPLACE FUNCTION public.metricas_notificacoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'obrigatorias_24h', (
      SELECT count(*) FROM public.notificacoes n
      JOIN public.notificacao_tipos_config c ON c.tipo=n.tipo
      WHERE n.created_at >= now()-interval '24 hours'
        AND (c.obrigatoria OR n.severidade IN ('ALTA','CRITICA'))
    ),
    'materializadas_24h', (
      SELECT COALESCE(sum(materializadas),0)
      FROM public.notificacao_metricas_agregadas
      WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 0
    ),
    'materializadas_7d', (
      SELECT COALESCE(sum(materializadas),0)
      FROM public.notificacao_metricas_agregadas
      WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 6
    ),
    'materializadas_30d', (
      SELECT COALESCE(sum(materializadas),0)
      FROM public.notificacao_metricas_agregadas
      WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 29
    ),
    'suprimidas_24h', (
      SELECT COALESCE(sum(suprimidas),0)
      FROM public.notificacao_metricas_agregadas
      WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 0
    ),
    'suprimidas_7d', (
      SELECT COALESCE(sum(suprimidas),0)
      FROM public.notificacao_metricas_agregadas
      WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 6
    ),
    'suprimidas_30d', (
      SELECT COALESCE(sum(suprimidas),0)
      FROM public.notificacao_metricas_agregadas
      WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 29
    ),
    'por_tipo_7d', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.materializadas DESC), '[]'::jsonb)
      FROM (
        SELECT tipo::text AS tipo,
               sum(materializadas)::bigint AS materializadas,
               sum(suprimidas)::bigint AS suprimidas
        FROM public.notificacao_metricas_agregadas
        WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 6
        GROUP BY tipo
        ORDER BY sum(materializadas) DESC
        LIMIT 15
      ) t
    ),
    'por_severidade_7d', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.materializadas DESC), '[]'::jsonb)
      FROM (
        SELECT severidade::text AS severidade,
               sum(materializadas)::bigint AS materializadas,
               sum(suprimidas)::bigint AS suprimidas
        FROM public.notificacao_metricas_agregadas
        WHERE bucket_date >= (now() AT TIME ZONE 'UTC')::date - 6
        GROUP BY severidade
      ) t
    ),
    'tipos_mais_desativados', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC),'[]'::jsonb) FROM (
        SELECT tipo::text AS tipo, count(*) AS total
        FROM public.preferencias_notificacao WHERE habilitada=false
        GROUP BY tipo ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'usuarios_com_preferencias', (SELECT count(DISTINCT usuario_id) FROM public.preferencias_notificacao),
    'regras_ativas', (SELECT count(*) FROM public.regras_escalonamento WHERE ativo),
    'ultima_simulacao', (SELECT max(created_at) FROM public.audit_logs WHERE acao='SIMULACAO'),
    'gerado_em', now()
  );
END $$;

-- 7) Healthcheck do motor V2 (auto-verificação de invariantes)
CREATE OR REPLACE FUNCTION public.notificacoes_motor_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obrigatorios_ok bool;
  v_negativos int;
  v_v2_marker int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Tipos obrigatórios esperados presentes no catálogo
  SELECT (count(*) FILTER (WHERE obrigatoria) >= 5) INTO v_obrigatorios_ok
  FROM public.notificacao_tipos_config
  WHERE tipo IN ('INCIDENTE_CRITICO','INCIDENTE_P1','SLA_PROXIMO','SLA_VENCIDO','BACKUP_FALHOU');

  -- Contadores nunca podem ser negativos
  SELECT count(*) INTO v_negativos
  FROM public.notificacao_metricas_agregadas
  WHERE materializadas < 0 OR suprimidas < 0;

  -- Amostra de notificações criadas pelo V2 (metadata marker)
  SELECT count(*) INTO v_v2_marker
  FROM public.notificacoes
  WHERE metadata ? 'v2_obrigatoria'
    AND created_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'ok', v_obrigatorios_ok AND v_negativos = 0,
    'catalogo_obrigatorios_ok', v_obrigatorios_ok,
    'contadores_sem_negativos', v_negativos = 0,
    'notificacoes_v2_30d', v_v2_marker,
    'verificado_em', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.notificacoes_motor_healthcheck() TO authenticated, service_role;
