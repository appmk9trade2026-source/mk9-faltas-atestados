
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- 1) Config table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.automacao_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  intervalo_minutos int NOT NULL DEFAULT 5 CHECK (intervalo_minutos >= 1),
  tolerancia_minutos int NOT NULL DEFAULT 10 CHECK (tolerancia_minutos >= 1),
  execucao_travada_minutos int NOT NULL DEFAULT 15 CHECK (execucao_travada_minutos >= 2),
  falhas_para_alta int NOT NULL DEFAULT 2 CHECK (falhas_para_alta >= 1),
  falhas_para_critica int NOT NULL DEFAULT 3 CHECK (falhas_para_critica >= 2),
  agendamento_ativo boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_tolerancia_ge_intervalo CHECK (tolerancia_minutos >= intervalo_minutos),
  CONSTRAINT chk_travado_gt_tolerancia CHECK (execucao_travada_minutos > tolerancia_minutos),
  CONSTRAINT chk_falhas_sequencial CHECK (falhas_para_critica > falhas_para_alta)
);

GRANT SELECT ON public.automacao_config TO authenticated;
GRANT ALL ON public.automacao_config TO service_role;
ALTER TABLE public.automacao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_read" ON public.automacao_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "config_write_admin" ON public.automacao_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.automacao_config(id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_automacao_config_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); NEW.updated_by := auth.uid(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_automacao_config_touch ON public.automacao_config;
CREATE TRIGGER trg_automacao_config_touch BEFORE UPDATE ON public.automacao_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_automacao_config_touch();

-- ============================================================
-- 2) Escalonamento_execucoes append-only reform
-- ============================================================
ALTER TABLE public.escalonamento_execucoes
  ADD COLUMN IF NOT EXISTS execution_id uuid,
  ADD COLUMN IF NOT EXISTS duracao_ms int,
  ADD COLUMN IF NOT EXISTS regras_avaliadas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incidentes_avaliados int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicidades_ignoradas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS erros_encontrados int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mensagem_resumida text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.escalonamento_execucoes SET execution_id = id WHERE execution_id IS NULL;
ALTER TABLE public.escalonamento_execucoes ALTER COLUMN execution_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_esc_exec_execution_id ON public.escalonamento_execucoes(execution_id);
CREATE INDEX IF NOT EXISTS idx_esc_exec_created_at ON public.escalonamento_execucoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esc_exec_status ON public.escalonamento_execucoes(status);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION public.tg_esc_exec_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'escalonamento_execucoes é append-only (% bloqueado).', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_esc_exec_no_update ON public.escalonamento_execucoes;
DROP TRIGGER IF EXISTS trg_esc_exec_no_delete ON public.escalonamento_execucoes;
CREATE TRIGGER trg_esc_exec_no_update BEFORE UPDATE ON public.escalonamento_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_esc_exec_append_only();
CREATE TRIGGER trg_esc_exec_no_delete BEFORE DELETE ON public.escalonamento_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_esc_exec_append_only();

-- ============================================================
-- 3) Motor de execução com lock + append-only + tratamento de falhas
-- ============================================================
-- Refactor: processar_escalonamentos_pendentes torna-se wrapper para uso via RPC (manual)
CREATE OR REPLACE FUNCTION public.run_escalonamentos(p_origem text DEFAULT 'MANUAL')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec_id uuid := gen_random_uuid();
  v_iniciado timestamptz := clock_timestamp();
  v_finalizado timestamptz;
  v_gerado int := 0;
  v_proc int := 0;
  v_dup int := 0;
  v_regras int := 0;
  v_inc record;
  v_key text;
  v_lock_key bigint := 8834172938471;
  v_status text;
  v_msg text;
  v_erro text;
  v_falhas_consec int := 0;
  v_cfg record;
  v_new_id uuid;
BEGIN
  -- Autorização: se chamado com sessão de usuário, exigir super_admin.
  -- Cron (postgres) roda sem auth.uid() e é permitido.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF p_origem NOT IN ('CRON','MANUAL','REPROCESSAMENTO') THEN
    p_origem := 'MANUAL';
  END IF;

  SELECT * INTO v_cfg FROM public.automacao_config WHERE id = true;

  -- Detectar execução travada e liberar lock antes de tentar adquirir
  PERFORM 1 FROM public.escalonamento_execucoes
    WHERE status = 'INICIADO'
      AND iniciado_em < now() - make_interval(mins => COALESCE(v_cfg.execucao_travada_minutos, 15))
    LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.escalonamento_execucoes(execution_id, status, origem, executado_por, mensagem_resumida, iniciado_em, finalizado_em, processados, notificacoes_geradas)
    VALUES (gen_random_uuid(), 'FALHOU', p_origem, auth.uid(), 'Execução anterior expirada (timeout).', now(), now(), 0, 0);
    -- Alerta operacional
    INSERT INTO public.operacao_alertas(tipo, severidade, titulo, mensagem, origem)
    VALUES ('TEMPO_ELEVADO','ALTA','Execução travada do motor de SLA',
      'Execução INICIADA há mais que o limite configurado. Liberada para novo ciclo.','escalonamento');
  END IF;

  -- Lock não bloqueante
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    INSERT INTO public.escalonamento_execucoes(execution_id, status, origem, executado_por, mensagem_resumida, iniciado_em, finalizado_em, processados, notificacoes_geradas)
    VALUES (v_exec_id, 'IGNORADO_POR_LOCK', p_origem, auth.uid(),
            'Execução ignorada: já existe uma execução ativa.', v_iniciado, clock_timestamp(), 0, 0);
    RETURN jsonb_build_object('execution_id', v_exec_id, 'status','IGNORADO_POR_LOCK');
  END IF;

  -- INICIADO (evento)
  INSERT INTO public.escalonamento_execucoes(execution_id, status, origem, executado_por, iniciado_em, mensagem_resumida)
  VALUES (v_exec_id, 'INICIADO', p_origem, auth.uid(), v_iniciado, 'Execução iniciada.');

  BEGIN
    -- Regra 1: P1 sem responsável
    v_regras := v_regras + 1;
    FOR v_inc IN
      SELECT id, codigo, titulo FROM public.operacao_incidentes
      WHERE prioridade='P1' AND responsavel_id IS NULL AND status NOT IN ('ENCERRADO','CANCELADO','RESOLVIDO')
    LOOP
      v_proc := v_proc + 1;
      v_key := 'INCIDENTE_P1_SEM_RESP:'||v_inc.id::text;
      IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
        INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,modulo,rota_destino,destinatario_papel,idempotency_key,metadata)
        VALUES ('INCIDENTE_P1','Incidente P1 sem responsável: '||v_inc.codigo,
                COALESCE(v_inc.titulo,'Incidente P1 aguardando atribuição.'),
                'CRITICA','OPERACAO_ASSISTIDA', v_inc.id,'operacao-assistida','/operacao-assistida',
                'super_admin', v_key, jsonb_build_object('codigo',v_inc.codigo));
        v_gerado := v_gerado + 1;
      ELSE v_dup := v_dup + 1; END IF;
    END LOOP;

    -- Regra 2: incidente CRÍTICO em aberto
    v_regras := v_regras + 1;
    FOR v_inc IN
      SELECT id, codigo, titulo FROM public.operacao_incidentes
      WHERE severidade='CRITICA' AND status NOT IN ('RESOLVIDO','ENCERRADO','CANCELADO')
    LOOP
      v_proc := v_proc + 1;
      v_key := 'INCIDENTE_CRITICO:'||v_inc.id::text;
      IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
        INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
        VALUES ('INCIDENTE_CRITICO','Incidente CRÍTICO em aberto: '||v_inc.codigo,
                COALESCE(v_inc.titulo,'Requer ação imediata.'),
                'CRITICA','OPERACAO_ASSISTIDA', v_inc.id,'/operacao-assistida',
                'super_admin', v_key, jsonb_build_object('codigo',v_inc.codigo));
        v_gerado := v_gerado + 1;
      ELSE v_dup := v_dup + 1; END IF;
    END LOOP;

    -- Regra 3: SLA vencido
    v_regras := v_regras + 1;
    FOR v_inc IN
      SELECT id, codigo, titulo, prazo_resolucao FROM public.operacao_incidentes
      WHERE prazo_resolucao IS NOT NULL AND prazo_resolucao < now()
        AND status NOT IN ('RESOLVIDO','ENCERRADO','CANCELADO')
    LOOP
      v_proc := v_proc + 1;
      v_key := 'SLA_VENCIDO:'||v_inc.id::text;
      IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
        INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
        VALUES ('SLA_VENCIDO','SLA vencido: '||v_inc.codigo,
                'Prazo de resolução ultrapassado.','ALTA','OPERACAO_ASSISTIDA',
                v_inc.id,'/operacao-assistida','super_admin', v_key,
                jsonb_build_object('codigo',v_inc.codigo,'prazo',v_inc.prazo_resolucao));
        v_gerado := v_gerado + 1;
      ELSE v_dup := v_dup + 1; END IF;
    END LOOP;

    -- Regra 4: SLA próximo (30 min)
    v_regras := v_regras + 1;
    FOR v_inc IN
      SELECT id, codigo, titulo, prazo_resolucao FROM public.operacao_incidentes
      WHERE prazo_resolucao IS NOT NULL
        AND prazo_resolucao BETWEEN now() AND now() + interval '30 minutes'
        AND status NOT IN ('RESOLVIDO','ENCERRADO','CANCELADO')
    LOOP
      v_proc := v_proc + 1;
      v_key := 'SLA_PROXIMO:'||v_inc.id::text||':'||date_trunc('hour', v_inc.prazo_resolucao)::text;
      IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
        INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
        VALUES ('SLA_PROXIMO','SLA próximo do vencimento: '||v_inc.codigo,
                'Prazo em menos de 30 minutos.','ALTA','OPERACAO_ASSISTIDA',
                v_inc.id,'/operacao-assistida','super_admin', v_key,
                jsonb_build_object('codigo',v_inc.codigo,'prazo',v_inc.prazo_resolucao));
        v_gerado := v_gerado + 1;
      ELSE v_dup := v_dup + 1; END IF;
    END LOOP;

    v_finalizado := clock_timestamp();
    v_status := CASE WHEN v_gerado > 0 THEN 'CONCLUIDO' ELSE 'CONCLUIDO' END;
    v_msg := format('Processados %s incidentes; %s notificações geradas; %s duplicadas ignoradas.', v_proc, v_gerado, v_dup);

    INSERT INTO public.escalonamento_execucoes(
      execution_id, status, origem, executado_por, iniciado_em, finalizado_em,
      duracao_ms, processados, notificacoes_geradas, regras_avaliadas,
      incidentes_avaliados, duplicidades_ignoradas, mensagem_resumida
    ) VALUES (
      v_exec_id, v_status, p_origem, auth.uid(), v_iniciado, v_finalizado,
      GREATEST(0, EXTRACT(MILLISECOND FROM v_finalizado - v_iniciado)::int + EXTRACT(SECOND FROM v_finalizado - v_iniciado)::int * 1000),
      v_proc, v_gerado, v_regras, v_proc, v_dup, v_msg
    );

  EXCEPTION WHEN OTHERS THEN
    v_erro := regexp_replace(COALESCE(SQLERRM,'erro'), '[[:cntrl:]]+', ' ', 'g');
    v_erro := left(v_erro, 500);
    v_finalizado := clock_timestamp();

    -- Falhas consecutivas
    SELECT count(*) INTO v_falhas_consec FROM (
      SELECT status FROM public.escalonamento_execucoes
      WHERE status IN ('FALHOU','CONCLUIDO','CONCLUIDO_COM_ALERTAS')
      ORDER BY created_at DESC LIMIT 5
    ) t WHERE t.status = 'FALHOU';
    v_falhas_consec := v_falhas_consec + 1;

    INSERT INTO public.escalonamento_execucoes(
      execution_id, status, origem, executado_por, iniciado_em, finalizado_em,
      duracao_ms, erros_encontrados, mensagem_resumida, metadata
    ) VALUES (
      v_exec_id, 'FALHOU', p_origem, auth.uid(), v_iniciado, v_finalizado,
      GREATEST(0, EXTRACT(EPOCH FROM v_finalizado - v_iniciado)::int * 1000), 1,
      v_erro, jsonb_build_object('falhas_consecutivas', v_falhas_consec)
    );

    -- Alerta operacional (idempotência por janela + tipo)
    INSERT INTO public.operacao_alertas(tipo, severidade, titulo, mensagem, origem)
    VALUES (
      'ERRO_INESPERADO',
      CASE WHEN v_falhas_consec >= COALESCE(v_cfg.falhas_para_critica,3) THEN 'CRITICA'
           WHEN v_falhas_consec >= COALESCE(v_cfg.falhas_para_alta,2) THEN 'ALTA'
           ELSE 'MEDIA' END,
      'Falha no motor de escalonamento',
      left('Execução falhou: '||v_erro, 800),
      'escalonamento'
    );

    -- Notificação interna (idempotente por janela de 5 min)
    v_key := 'ESCALONAMENTO_FALHA:'||to_char(date_trunc('minute', now()),'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,rota_destino,destinatario_papel,idempotency_key,metadata)
      VALUES ('ESCALONAMENTO_FALHA','Falha no motor de escalonamento',
              left(v_erro, 500),
              CASE WHEN v_falhas_consec >= COALESCE(v_cfg.falhas_para_critica,3) THEN 'CRITICA'
                   WHEN v_falhas_consec >= COALESCE(v_cfg.falhas_para_alta,2) THEN 'ALTA' ELSE 'MEDIA' END,
              'OPERACAO','/operacoes','super_admin', v_key,
              jsonb_build_object('execution_id', v_exec_id, 'falhas_consecutivas', v_falhas_consec));
    END IF;

    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN jsonb_build_object('execution_id', v_exec_id, 'status','FALHOU', 'erro', v_erro);
  END;

  PERFORM pg_advisory_unlock(v_lock_key);
  RETURN jsonb_build_object('execution_id', v_exec_id, 'status', v_status,
    'processados', v_proc, 'gerados', v_gerado, 'duplicadas', v_dup);
END $$;

GRANT EXECUTE ON FUNCTION public.run_escalonamentos(text) TO authenticated;

-- Refactor wrapper: manual RPC (mantém API existente)
CREATE OR REPLACE FUNCTION public.processar_escalonamentos_pendentes()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;
  v_res := public.run_escalonamentos('MANUAL');
  PERFORM public.log_audit_event('notificacoes','EXECUTE','escalonamento',
    (v_res->>'execution_id')::uuid, NULL, NULL, NULL, v_res, true,
    'Execução manual de escalonamento','painel', NULL, NULL);
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public.reprocessar_escalonamentos()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;
  v_res := public.run_escalonamentos('REPROCESSAMENTO');
  PERFORM public.log_audit_event('notificacoes','EXECUTE','escalonamento_reprocessar',
    (v_res->>'execution_id')::uuid, NULL, NULL, NULL, v_res, true,
    'Reprocessamento de escalonamento','painel', NULL, NULL);
  RETURN v_res;
END $$;

GRANT EXECUTE ON FUNCTION public.reprocessar_escalonamentos() TO authenticated;

-- ============================================================
-- 4) Status/monitoramento
-- ============================================================
CREATE OR REPLACE FUNCTION public.automacao_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg record;
  v_ultima record;
  v_ultimo_sucesso timestamptz;
  v_ultima_falha timestamptz;
  v_prox timestamptz;
  v_falhas_consec int := 0;
  v_dur_media numeric;
  v_notif_24h int;
  v_ign_24h int;
  v_estado text;
  v_cron_ok boolean := false;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_cfg FROM public.automacao_config WHERE id=true;

  SELECT * INTO v_ultima FROM public.escalonamento_execucoes
    WHERE status <> 'INICIADO'
    ORDER BY created_at DESC LIMIT 1;

  SELECT max(finalizado_em) INTO v_ultimo_sucesso FROM public.escalonamento_execucoes
    WHERE status IN ('CONCLUIDO','CONCLUIDO_COM_ALERTAS');
  SELECT max(finalizado_em) INTO v_ultima_falha FROM public.escalonamento_execucoes
    WHERE status = 'FALHOU';

  SELECT avg(duracao_ms) INTO v_dur_media FROM public.escalonamento_execucoes
    WHERE status IN ('CONCLUIDO','CONCLUIDO_COM_ALERTAS') AND created_at > now() - interval '24 hours';

  SELECT COALESCE(sum(notificacoes_geradas),0) INTO v_notif_24h FROM public.escalonamento_execucoes
    WHERE created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_ign_24h FROM public.escalonamento_execucoes
    WHERE status='IGNORADO_POR_LOCK' AND created_at > now() - interval '24 hours';

  -- Falhas consecutivas nas últimas 5
  SELECT count(*) INTO v_falhas_consec FROM (
    SELECT status FROM public.escalonamento_execucoes
    WHERE status IN ('FALHOU','CONCLUIDO','CONCLUIDO_COM_ALERTAS')
    ORDER BY created_at DESC LIMIT 5
  ) t WHERE t.status='FALHOU';

  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='crm_mk9_run_escalonamentos') INTO v_cron_ok;

  IF v_ultima.finalizado_em IS NOT NULL THEN
    v_prox := v_ultima.finalizado_em + make_interval(mins => COALESCE(v_cfg.intervalo_minutos,5));
  END IF;

  v_estado := CASE
    WHEN NOT v_cron_ok OR NOT COALESCE(v_cfg.agendamento_ativo, true) THEN 'NAO_CONFIGURADO'
    WHEN v_ultima.finalizado_em IS NULL THEN 'INATIVO'
    WHEN v_falhas_consec >= COALESCE(v_cfg.falhas_para_alta,2) THEN 'COM_FALHA'
    WHEN v_ultima.finalizado_em < now() - make_interval(mins => COALESCE(v_cfg.tolerancia_minutos,10)) THEN 'ATRASADO'
    ELSE 'ATIVO'
  END;

  RETURN jsonb_build_object(
    'estado', v_estado,
    'agendamento_ativo', COALESCE(v_cfg.agendamento_ativo,false),
    'cron_configurado', v_cron_ok,
    'intervalo_minutos', v_cfg.intervalo_minutos,
    'tolerancia_minutos', v_cfg.tolerancia_minutos,
    'execucao_travada_minutos', v_cfg.execucao_travada_minutos,
    'ultima_execucao', v_ultima.finalizado_em,
    'ultima_execucao_status', v_ultima.status,
    'ultimo_sucesso', v_ultimo_sucesso,
    'ultima_falha', v_ultima_falha,
    'proxima_execucao_esperada', v_prox,
    'duracao_media_ms', COALESCE(v_dur_media, 0)::int,
    'notificacoes_24h', v_notif_24h,
    'ignoradas_por_lock_24h', v_ign_24h,
    'falhas_consecutivas', v_falhas_consec,
    'config', jsonb_build_object(
      'falhas_para_alta', v_cfg.falhas_para_alta,
      'falhas_para_critica', v_cfg.falhas_para_critica
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.automacao_status() TO authenticated;

-- ============================================================
-- 5) Update config helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.automacao_config_atualizar(
  p_intervalo int, p_tolerancia int, p_travada int,
  p_falhas_alta int, p_falhas_critica int, p_ativo boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_intervalo < 1 THEN RAISE EXCEPTION 'Intervalo mínimo é 1 minuto.'; END IF;
  IF p_tolerancia < p_intervalo THEN RAISE EXCEPTION 'Tolerância deve ser >= intervalo.'; END IF;
  IF p_travada <= p_tolerancia THEN RAISE EXCEPTION 'Limite de travada deve ser > tolerância.'; END IF;
  IF p_falhas_alta < 1 OR p_falhas_critica <= p_falhas_alta THEN
    RAISE EXCEPTION 'Limites de falhas inválidos.'; END IF;

  SELECT to_jsonb(c) INTO v_before FROM public.automacao_config c WHERE id=true;
  UPDATE public.automacao_config
    SET intervalo_minutos=p_intervalo, tolerancia_minutos=p_tolerancia,
        execucao_travada_minutos=p_travada, falhas_para_alta=p_falhas_alta,
        falhas_para_critica=p_falhas_critica, agendamento_ativo=p_ativo
    WHERE id=true;
  SELECT to_jsonb(c) INTO v_after FROM public.automacao_config c WHERE id=true;

  PERFORM public.log_audit_event('configuracoes','UPDATE','automacao_config', NULL,
    v_before, v_after, NULL, NULL, true, 'Configuração de automação atualizada','painel', NULL, NULL);
  RETURN v_after;
END $$;

GRANT EXECUTE ON FUNCTION public.automacao_config_atualizar(int,int,int,int,int,boolean) TO authenticated;

-- ============================================================
-- 6) pg_cron schedule (respeita agendamento_ativo)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cron_run_escalonamentos_tick()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.automacao_config WHERE id=true AND agendamento_ativo=true) THEN
    PERFORM public.run_escalonamentos('CRON');
  END IF;
END $$;

-- Agendar (5 min)
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='crm_mk9_run_escalonamentos') THEN
    PERFORM cron.unschedule('crm_mk9_run_escalonamentos');
  END IF;
  PERFORM cron.schedule('crm_mk9_run_escalonamentos','*/5 * * * *',
    $sql$ SELECT public.cron_run_escalonamentos_tick(); $sql$);
END $$;
