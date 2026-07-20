
-- =========================================================================
-- ONDA 3: Central de Alertas Operacionais
-- =========================================================================

-- Enum de severidade e status como CHECKs (mais flexíveis que enums)

-- Tabela principal de alertas
CREATE TABLE IF NOT EXISTS public.alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  projeto_id UUID REFERENCES public.projetos(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ausencia_id UUID REFERENCES public.ausencias(id) ON DELETE SET NULL,
  whatsapp_outbox_id UUID REFERENCES public.whatsapp_outbox(id) ON DELETE SET NULL,
  regra_codigo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  severidade TEXT NOT NULL CHECK (severidade IN ('INFORMATIVO','ATENCAO','CRITICO')),
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOVO'
    CHECK (status IN ('NOVO','LIDO','EM_TRATAMENTO','RESOLVIDO','DISPENSADO')),
  acao_tipo TEXT,
  acao_recurso_id UUID,
  acao_url TEXT,
  chave_idempotencia TEXT NOT NULL,
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  prazo_em TIMESTAMPTZ,
  lido_em TIMESTAMPTZ,
  lido_por UUID,
  assumido_em TIMESTAMPTZ,
  assumido_por UUID,
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID,
  dispensado_em TIMESTAMPTZ,
  dispensado_por UUID,
  justificativa TEXT,
  resolucao_automatica BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alertas_chave_idempotencia_uidx UNIQUE (chave_idempotencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;
GRANT ALL ON public.alertas TO service_role;

CREATE INDEX IF NOT EXISTS idx_alertas_status ON public.alertas(status);
CREATE INDEX IF NOT EXISTS idx_alertas_severidade ON public.alertas(severidade);
CREATE INDEX IF NOT EXISTS idx_alertas_empresa ON public.alertas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_alertas_projeto ON public.alertas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_alertas_regra ON public.alertas(regra_codigo);
CREATE INDEX IF NOT EXISTS idx_alertas_detectado_em ON public.alertas(detectado_em DESC);

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

-- Eventos dos alertas
CREATE TABLE IF NOT EXISTS public.alertas_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id UUID NOT NULL REFERENCES public.alertas(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT,
  usuario_id UUID,
  justificativa TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.alertas_eventos TO authenticated;
GRANT ALL ON public.alertas_eventos TO service_role;

CREATE INDEX IF NOT EXISTS idx_alertas_eventos_alerta ON public.alertas_eventos(alerta_id, created_at DESC);

ALTER TABLE public.alertas_eventos ENABLE ROW LEVEL SECURITY;

-- Configurações centralizadas
CREATE TABLE IF NOT EXISTS public.alertas_configuracoes (
  regra_codigo TEXT PRIMARY KEY,
  habilitada BOOLEAN NOT NULL DEFAULT true,
  limite_minutos INTEGER,
  limite_horas INTEGER,
  quantidade_limite INTEGER,
  janela_minutos INTEGER,
  severidade TEXT NOT NULL DEFAULT 'ATENCAO' CHECK (severidade IN ('INFORMATIVO','ATENCAO','CRITICO')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.alertas_configuracoes TO authenticated;
GRANT ALL ON public.alertas_configuracoes TO service_role;

ALTER TABLE public.alertas_configuracoes ENABLE ROW LEVEL SECURITY;

-- Seed dos defaults
INSERT INTO public.alertas_configuracoes (regra_codigo, limite_horas, severidade) VALUES
  ('AUSENCIA_PENDENTE_ACIMA_DO_PRAZO', 24, 'ATENCAO')
ON CONFLICT (regra_codigo) DO NOTHING;

INSERT INTO public.alertas_configuracoes (regra_codigo, limite_minutos, severidade) VALUES
  ('WHATSAPP_PENDENTE_ACIMA_DO_LIMITE', 5, 'ATENCAO'),
  ('WORKER_SEM_EXECUCAO', 3, 'CRITICO')
ON CONFLICT (regra_codigo) DO NOTHING;

INSERT INTO public.alertas_configuracoes (regra_codigo, quantidade_limite, janela_minutos, severidade) VALUES
  ('FALHAS_REPETIDAS_EVOLUTION_API', 3, 10, 'CRITICO')
ON CONFLICT (regra_codigo) DO NOTHING;

INSERT INTO public.alertas_configuracoes (regra_codigo, severidade) VALUES
  ('PROJETO_SEM_CODIGO_PROTOCOLO', 'ATENCAO'),
  ('WHATSAPP_DEAD_LETTER', 'CRITICO'),
  ('COLABORADOR_SEM_TELEFONE_VALIDO', 'ATENCAO')
ON CONFLICT (regra_codigo) DO NOTHING;

-- =========================================================================
-- Helper: escopo por usuário
-- =========================================================================
CREATE OR REPLACE FUNCTION public.alerta_visivel_para(_alerta public.alertas, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN TRUE;
  END IF;

  -- RH: escopo por empresa/projeto vinculado, ou alertas globais
  IF public.has_role(_user_id, 'rh'::app_role) THEN
    IF _alerta.empresa_id IS NULL AND _alerta.projeto_id IS NULL THEN
      RETURN TRUE;
    END IF;
    IF _alerta.empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.usuario_empresas ue
      WHERE ue.user_id = _user_id AND ue.empresa_id = _alerta.empresa_id
    ) THEN
      RETURN TRUE;
    END IF;
    IF _alerta.projeto_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.usuario_projetos up
      WHERE up.user_id = _user_id AND up.projeto_id = _alerta.projeto_id
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- Supervisor: apenas projeto vinculado
  IF public.has_role(_user_id, 'supervisor'::app_role) THEN
    IF _alerta.projeto_id IS NULL THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.usuario_projetos up
      WHERE up.user_id = _user_id AND up.projeto_id = _alerta.projeto_id
    );
  END IF;

  -- Visualizador: mesma regra de RH (leitura), mas sem ações (bloqueado pelo backend)
  IF public.has_role(_user_id, 'visualizador'::app_role) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- =========================================================================
-- RLS: alertas
-- =========================================================================
DROP POLICY IF EXISTS "alertas_select" ON public.alertas;
CREATE POLICY "alertas_select" ON public.alertas
  FOR SELECT TO authenticated
  USING (public.alerta_visivel_para(alertas, auth.uid()));

DROP POLICY IF EXISTS "alertas_update" ON public.alertas;
CREATE POLICY "alertas_update" ON public.alertas
  FOR UPDATE TO authenticated
  USING (
    public.alerta_visivel_para(alertas, auth.uid())
    AND NOT public.has_role(auth.uid(), 'visualizador'::app_role)
  )
  WITH CHECK (
    public.alerta_visivel_para(alertas, auth.uid())
    AND NOT public.has_role(auth.uid(), 'visualizador'::app_role)
  );

DROP POLICY IF EXISTS "alertas_insert_admin" ON public.alertas;
CREATE POLICY "alertas_insert_admin" ON public.alertas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "alertas_delete_admin" ON public.alertas;
CREATE POLICY "alertas_delete_admin" ON public.alertas
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- RLS: eventos
DROP POLICY IF EXISTS "alertas_eventos_select" ON public.alertas_eventos;
CREATE POLICY "alertas_eventos_select" ON public.alertas_eventos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.alertas a
    WHERE a.id = alertas_eventos.alerta_id
      AND public.alerta_visivel_para(a, auth.uid())
  ));

DROP POLICY IF EXISTS "alertas_eventos_insert" ON public.alertas_eventos;
CREATE POLICY "alertas_eventos_insert" ON public.alertas_eventos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.alertas a
    WHERE a.id = alertas_eventos.alerta_id
      AND public.alerta_visivel_para(a, auth.uid())
      AND NOT public.has_role(auth.uid(), 'visualizador'::app_role)
  ));

-- RLS: configuracoes
DROP POLICY IF EXISTS "alertas_conf_select" ON public.alertas_configuracoes;
CREATE POLICY "alertas_conf_select" ON public.alertas_configuracoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "alertas_conf_write" ON public.alertas_configuracoes;
CREATE POLICY "alertas_conf_write" ON public.alertas_configuracoes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =========================================================================
-- Trigger de updated_at
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_alertas_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS alertas_touch ON public.alertas;
CREATE TRIGGER alertas_touch BEFORE UPDATE ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION public.tg_alertas_touch();

-- =========================================================================
-- Função central: gerar_alertas_do_sistema
-- =========================================================================
CREATE OR REPLACE FUNCTION public.gerar_alertas_do_sistema()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio TIMESTAMPTZ := clock_timestamp();
  v_criados INTEGER := 0;
  v_resolvidos INTEGER := 0;
  v_regra TEXT;
  v_conf_ausencia_h INTEGER;
  v_conf_wa_min INTEGER;
  v_conf_worker_min INTEGER;
  v_conf_falhas_qtd INTEGER;
  v_conf_falhas_win INTEGER;
  v_provider_habilitado BOOLEAN;
  v_provider_modo TEXT;
BEGIN
  -- Lock consultivo para evitar concorrência
  IF NOT pg_try_advisory_lock(hashtext('gerar_alertas_do_sistema')) THEN
    RETURN jsonb_build_object('skipped', true, 'motivo', 'em_execucao');
  END IF;

  -- Carrega configs
  SELECT COALESCE(limite_horas, 24) INTO v_conf_ausencia_h
    FROM public.alertas_configuracoes WHERE regra_codigo = 'AUSENCIA_PENDENTE_ACIMA_DO_PRAZO';
  SELECT COALESCE(limite_minutos, 5) INTO v_conf_wa_min
    FROM public.alertas_configuracoes WHERE regra_codigo = 'WHATSAPP_PENDENTE_ACIMA_DO_LIMITE';
  SELECT COALESCE(limite_minutos, 3) INTO v_conf_worker_min
    FROM public.alertas_configuracoes WHERE regra_codigo = 'WORKER_SEM_EXECUCAO';
  SELECT COALESCE(quantidade_limite, 3), COALESCE(janela_minutos, 10)
    INTO v_conf_falhas_qtd, v_conf_falhas_win
    FROM public.alertas_configuracoes WHERE regra_codigo = 'FALHAS_REPETIDAS_EVOLUTION_API';

  SELECT enabled, modo INTO v_provider_habilitado, v_provider_modo
    FROM public.whatsapp_provider_config
    WHERE singleton = TRUE
    LIMIT 1;

  -- =========================================================
  -- REGRA 1: PROJETO_SEM_CODIGO_PROTOCOLO
  -- =========================================================
  v_regra := 'PROJETO_SEM_CODIGO_PROTOCOLO';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra) THEN
    WITH inseridos AS (
      INSERT INTO public.alertas (
        empresa_id, projeto_id, regra_codigo, categoria, severidade,
        titulo, descricao, acao_tipo, acao_url, chave_idempotencia, metadata
      )
      SELECT
        p.empresa_id, p.id, v_regra, 'CONFIGURACAO', 'ATENCAO',
        'Projeto sem código de protocolo',
        'O projeto "' || p.nome || '" está ativo mas não possui código de protocolo. Novos lançamentos falharão.',
        'ABRIR_PROJETO', '/configuracoes/projetos?editar=' || p.id::text,
        'alerta:PROJETO_SEM_CODIGO_PROTOCOLO:' || p.id::text,
        jsonb_build_object('projeto_nome', p.nome)
      FROM public.projetos p
      WHERE p.ativo = true
        AND (p.codigo_protocolo IS NULL OR TRIM(p.codigo_protocolo) = '')
      ON CONFLICT (chave_idempotencia) DO NOTHING
      RETURNING id
    )
    SELECT v_criados + COUNT(*) INTO v_criados FROM inseridos;

    -- Auto-resolve: projeto passou a ter código
    WITH resolvidos AS (
      UPDATE public.alertas a
      SET status = 'RESOLVIDO', resolvido_em = now(), resolucao_automatica = true
      WHERE a.regra_codigo = v_regra
        AND a.status NOT IN ('RESOLVIDO','DISPENSADO')
        AND EXISTS (
          SELECT 1 FROM public.projetos p
          WHERE p.id = a.projeto_id
            AND (p.codigo_protocolo IS NOT NULL AND TRIM(p.codigo_protocolo) <> '')
        )
      RETURNING id
    )
    SELECT v_resolvidos + COUNT(*) INTO v_resolvidos FROM resolvidos;
  END IF;

  -- =========================================================
  -- REGRA 2: AUSENCIA_PENDENTE_ACIMA_DO_PRAZO
  -- =========================================================
  v_regra := 'AUSENCIA_PENDENTE_ACIMA_DO_PRAZO';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra) THEN
    WITH inseridos AS (
      INSERT INTO public.alertas (
        empresa_id, projeto_id, colaborador_id, ausencia_id,
        regra_codigo, categoria, severidade,
        titulo, descricao, acao_tipo, acao_url, chave_idempotencia, prazo_em, metadata
      )
      SELECT
        au.empresa_id, au.projeto_id, au.colaborador_id, au.id,
        v_regra, 'AUSENCIAS', 'ATENCAO',
        'Ausência pendente há mais de ' || v_conf_ausencia_h || 'h',
        'A ausência ' || COALESCE(au.protocolo, au.id::text) || ' está PENDENTE há mais tempo que o limite configurado.',
        'ABRIR_AUSENCIA', '/ausencias?id=' || au.id::text,
        'alerta:AUSENCIA_PENDENTE_ACIMA_DO_PRAZO:' || au.id::text,
        au.created_at + make_interval(hours => v_conf_ausencia_h),
        jsonb_build_object('protocolo', au.protocolo, 'tipo', au.tipo)
      FROM public.ausencias au
      WHERE au.status = 'PENDENTE'
        AND au.created_at < now() - make_interval(hours => v_conf_ausencia_h)
      ON CONFLICT (chave_idempotencia) DO NOTHING
      RETURNING id
    )
    SELECT v_criados + COUNT(*) INTO v_criados FROM inseridos;

    WITH resolvidos AS (
      UPDATE public.alertas a
      SET status = 'RESOLVIDO', resolvido_em = now(), resolucao_automatica = true
      WHERE a.regra_codigo = v_regra
        AND a.status NOT IN ('RESOLVIDO','DISPENSADO')
        AND EXISTS (
          SELECT 1 FROM public.ausencias au
          WHERE au.id = a.ausencia_id AND au.status <> 'PENDENTE'
        )
      RETURNING id
    )
    SELECT v_resolvidos + COUNT(*) INTO v_resolvidos FROM resolvidos;
  END IF;

  -- =========================================================
  -- REGRA 3: WHATSAPP_PENDENTE_ACIMA_DO_LIMITE
  -- =========================================================
  v_regra := 'WHATSAPP_PENDENTE_ACIMA_DO_LIMITE';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra) THEN
    WITH inseridos AS (
      INSERT INTO public.alertas (
        ausencia_id, whatsapp_outbox_id,
        regra_codigo, categoria, severidade,
        titulo, descricao, acao_tipo, acao_url, chave_idempotencia, metadata
      )
      SELECT
        wo.ausencia_id, wo.id,
        v_regra, 'WHATSAPP', 'ATENCAO',
        'Mensagem WhatsApp pendente há mais de ' || v_conf_wa_min || 'min',
        'A mensagem ' || wo.id::text || ' está aguardando envio acima do limite configurado.',
        'ABRIR_OUTBOX', '/comunicacoes/whatsapp/outbox?id=' || wo.id::text,
        'alerta:WHATSAPP_PENDENTE_ACIMA_DO_LIMITE:' || wo.id::text,
        jsonb_build_object('status', wo.status, 'tentativas', wo.tentativas)
      FROM public.whatsapp_outbox wo
      WHERE wo.status IN ('PENDENTE','RETRY','PROCESSANDO','FALHOU_TEMPORARIO')
        AND wo.created_at < now() - make_interval(mins => v_conf_wa_min)
        AND (wo.proxima_tentativa_em IS NULL OR wo.proxima_tentativa_em < now() + interval '1 hour')
      ON CONFLICT (chave_idempotencia) DO NOTHING
      RETURNING id
    )
    SELECT v_criados + COUNT(*) INTO v_criados FROM inseridos;

    WITH resolvidos AS (
      UPDATE public.alertas a
      SET status = 'RESOLVIDO', resolvido_em = now(), resolucao_automatica = true
      WHERE a.regra_codigo = v_regra
        AND a.status NOT IN ('RESOLVIDO','DISPENSADO')
        AND EXISTS (
          SELECT 1 FROM public.whatsapp_outbox wo
          WHERE wo.id = a.whatsapp_outbox_id
            AND wo.status IN ('ENVIADO','ENTREGUE','LIDO','CANCELADO')
        )
      RETURNING id
    )
    SELECT v_resolvidos + COUNT(*) INTO v_resolvidos FROM resolvidos;
  END IF;

  -- =========================================================
  -- REGRA 4: WHATSAPP_DEAD_LETTER
  -- =========================================================
  v_regra := 'WHATSAPP_DEAD_LETTER';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra) THEN
    WITH inseridos AS (
      INSERT INTO public.alertas (
        ausencia_id, whatsapp_outbox_id,
        regra_codigo, categoria, severidade,
        titulo, descricao, acao_tipo, acao_url, chave_idempotencia, metadata
      )
      SELECT
        wo.ausencia_id, wo.id,
        v_regra, 'WHATSAPP', 'CRITICO',
        'WhatsApp em Dead Letter',
        'A mensagem ' || wo.id::text || ' esgotou tentativas e está em Dead Letter.',
        'ABRIR_DEAD_LETTER', '/comunicacoes/whatsapp/dead-letter?id=' || wo.id::text,
        'alerta:WHATSAPP_DEAD_LETTER:' || wo.id::text,
        jsonb_build_object('erro_codigo', wo.ultimo_erro_codigo)
      FROM public.whatsapp_outbox wo
      WHERE wo.status IN ('DEAD_LETTER','FALHOU_DEFINITIVO')
      ON CONFLICT (chave_idempotencia) DO NOTHING
      RETURNING id
    )
    SELECT v_criados + COUNT(*) INTO v_criados FROM inseridos;

    -- Só resolve automaticamente se enviado com sucesso (não por reprocessamento simples)
    WITH resolvidos AS (
      UPDATE public.alertas a
      SET status = 'RESOLVIDO', resolvido_em = now(), resolucao_automatica = true
      WHERE a.regra_codigo = v_regra
        AND a.status NOT IN ('RESOLVIDO','DISPENSADO')
        AND EXISTS (
          SELECT 1 FROM public.whatsapp_outbox wo
          WHERE wo.id = a.whatsapp_outbox_id
            AND wo.status IN ('ENVIADO','ENTREGUE','LIDO')
        )
      RETURNING id
    )
    SELECT v_resolvidos + COUNT(*) INTO v_resolvidos FROM resolvidos;
  END IF;

  -- =========================================================
  -- REGRA 5: WORKER_SEM_EXECUCAO
  -- =========================================================
  v_regra := 'WORKER_SEM_EXECUCAO';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra)
     AND COALESCE(v_provider_habilitado, false) = TRUE
     AND COALESCE(v_provider_modo, '') = 'PRODUCAO' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.whatsapp_worker_execucoes
      WHERE created_at > now() - make_interval(mins => v_conf_worker_min)
    ) THEN
      INSERT INTO public.alertas (
        regra_codigo, categoria, severidade,
        titulo, descricao, acao_tipo, acao_url, chave_idempotencia, metadata
      ) VALUES (
        v_regra, 'WHATSAPP', 'CRITICO',
        'Worker do WhatsApp sem execução',
        'Nenhuma execução do worker registrada nos últimos ' || v_conf_worker_min || ' minutos.',
        'ABRIR_HEALTH', '/comunicacoes/whatsapp/health',
        'alerta:WORKER_SEM_EXECUCAO:WHATSAPP',
        '{}'::jsonb
      ) ON CONFLICT (chave_idempotencia) DO NOTHING;
      GET DIAGNOSTICS v_criados = ROW_COUNT;
    ELSE
      UPDATE public.alertas
      SET status = 'RESOLVIDO', resolvido_em = now(), resolucao_automatica = true
      WHERE chave_idempotencia = 'alerta:WORKER_SEM_EXECUCAO:WHATSAPP'
        AND status NOT IN ('RESOLVIDO','DISPENSADO');
    END IF;
  END IF;

  -- =========================================================
  -- REGRA 6: COLABORADOR_SEM_TELEFONE_VALIDO
  -- =========================================================
  v_regra := 'COLABORADOR_SEM_TELEFONE_VALIDO';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra) THEN
    WITH inseridos AS (
      INSERT INTO public.alertas (
        empresa_id, projeto_id, colaborador_id,
        regra_codigo, categoria, severidade,
        titulo, descricao, acao_tipo, acao_url, chave_idempotencia, metadata
      )
      SELECT
        c.empresa_id, c.projeto_id, c.id,
        v_regra, 'COLABORADOR', 'ATENCAO',
        'Colaborador sem telefone válido',
        'O colaborador ' || c.nome_completo || ' (mat. ' || c.matricula || ') está ativo mas não possui telefone válido.',
        'ABRIR_COLABORADOR', '/colaboradores?id=' || c.id::text,
        'alerta:COLABORADOR_SEM_TELEFONE_VALIDO:' || c.id::text,
        jsonb_build_object('matricula', c.matricula)
      FROM public.colaboradores c
      JOIN public.projetos p ON p.id = c.projeto_id AND p.ativo = TRUE
      WHERE c.ativo = TRUE
        AND (
          c.whatsapp IS NULL OR LENGTH(regexp_replace(c.whatsapp, '\D', '', 'g')) < 10
        )
        AND EXISTS (
          SELECT 1 FROM public.ausencias au WHERE au.colaborador_id = c.id
        )
      ON CONFLICT (chave_idempotencia) DO NOTHING
      RETURNING id
    )
    SELECT v_criados + COUNT(*) INTO v_criados FROM inseridos;

    WITH resolvidos AS (
      UPDATE public.alertas a
      SET status = 'RESOLVIDO', resolvido_em = now(), resolucao_automatica = true
      WHERE a.regra_codigo = v_regra
        AND a.status NOT IN ('RESOLVIDO','DISPENSADO')
        AND EXISTS (
          SELECT 1 FROM public.colaboradores c
          WHERE c.id = a.colaborador_id
            AND c.whatsapp IS NOT NULL
            AND LENGTH(regexp_replace(c.whatsapp, '\D', '', 'g')) >= 10
        )
      RETURNING id
    )
    SELECT v_resolvidos + COUNT(*) INTO v_resolvidos FROM resolvidos;
  END IF;

  -- =========================================================
  -- REGRA 7: FALHAS_REPETIDAS_EVOLUTION_API
  -- =========================================================
  v_regra := 'FALHAS_REPETIDAS_EVOLUTION_API';
  IF (SELECT COALESCE(habilitada, true) FROM public.alertas_configuracoes WHERE regra_codigo = v_regra) THEN
    DECLARE
      v_qtd INTEGER;
      v_erro TEXT;
      v_bucket TEXT;
    BEGIN
      SELECT COUNT(*)::int, MIN(COALESCE(ultimo_erro_codigo, 'ERRO'))
        INTO v_qtd, v_erro
        FROM public.whatsapp_outbox
       WHERE falhou_em > now() - make_interval(mins => v_conf_falhas_win);

      IF v_qtd >= v_conf_falhas_qtd THEN
        v_bucket := to_char(date_trunc('minute', now()) - (extract(minute from now())::int % v_conf_falhas_win) * interval '1 minute', 'YYYYMMDDHH24MI');
        INSERT INTO public.alertas (
          regra_codigo, categoria, severidade,
          titulo, descricao, acao_tipo, acao_url, chave_idempotencia, metadata
        ) VALUES (
          v_regra, 'WHATSAPP', 'CRITICO',
          v_qtd || ' falhas repetidas no envio de WhatsApp',
          'Detectadas ' || v_qtd || ' falhas em ' || v_conf_falhas_win || ' minutos no envio via Evolution API.',
          'ABRIR_HEALTH', '/comunicacoes/whatsapp/execucoes',
          'alerta:FALHAS_REPETIDAS_EVOLUTION_API:' || v_bucket || ':' || COALESCE(v_erro, 'ERRO'),
          jsonb_build_object('quantidade', v_qtd, 'janela_minutos', v_conf_falhas_win)
        ) ON CONFLICT (chave_idempotencia) DO NOTHING;
      END IF;
    END;
  END IF;

  -- Registra evento de criação para alertas recém-inseridos que ainda não têm evento
  INSERT INTO public.alertas_eventos (alerta_id, evento, status_novo)
  SELECT a.id, 'ALERTA_CRIADO', a.status
  FROM public.alertas a
  WHERE a.created_at > v_inicio - interval '5 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas_eventos e
      WHERE e.alerta_id = a.id AND e.evento = 'ALERTA_CRIADO'
    );

  PERFORM pg_advisory_unlock(hashtext('gerar_alertas_do_sistema'));

  RETURN jsonb_build_object(
    'inicio', v_inicio,
    'fim', clock_timestamp(),
    'duracao_ms', extract(milliseconds from (clock_timestamp() - v_inicio))::int,
    'criados', v_criados,
    'resolvidos', v_resolvidos
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(hashtext('gerar_alertas_do_sistema'));
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_alertas_do_sistema() TO service_role, authenticated;

-- =========================================================================
-- RPC de contagem para o badge (respeita RLS via view do usuário)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.contagem_alertas_menu()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'novos', COUNT(*) FILTER (WHERE status = 'NOVO'),
    'criticos_abertos', COUNT(*) FILTER (WHERE severidade = 'CRITICO' AND status NOT IN ('RESOLVIDO','DISPENSADO')),
    'em_tratamento', COUNT(*) FILTER (WHERE status = 'EM_TRATAMENTO'),
    'vencidos', COUNT(*) FILTER (WHERE prazo_em IS NOT NULL AND prazo_em < now() AND status NOT IN ('RESOLVIDO','DISPENSADO')),
    'resolvidos_hoje', COUNT(*) FILTER (WHERE status = 'RESOLVIDO' AND resolvido_em::date = CURRENT_DATE),
    'total_abertos', COUNT(*) FILTER (WHERE status NOT IN ('RESOLVIDO','DISPENSADO'))
  )::jsonb
  FROM public.alertas;
$$;

GRANT EXECUTE ON FUNCTION public.contagem_alertas_menu() TO authenticated;
