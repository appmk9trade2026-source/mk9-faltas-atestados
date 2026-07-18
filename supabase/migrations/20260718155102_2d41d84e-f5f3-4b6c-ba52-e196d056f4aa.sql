
-- ============================================================================
-- FASE 3 · WhatsApp · Worker + Retry + Dead-Letter
-- ============================================================================

-- 1) Tabela append-only de execuções do worker ------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_worker_execucoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id          text NOT NULL UNIQUE,
  worker                text NOT NULL,
  status                text NOT NULL CHECK (status IN ('OK','ERRO','PROVIDER_DESATIVADO','SEM_ITENS')),
  inicio                timestamptz NOT NULL,
  fim                   timestamptz,
  duracao_ms            integer,
  selecionadas          integer NOT NULL DEFAULT 0,
  enviadas              integer NOT NULL DEFAULT 0,
  falhas_temporarias    integer NOT NULL DEFAULT 0,
  falhas_definitivas    integer NOT NULL DEFAULT 0,
  ignoradas             integer NOT NULL DEFAULT 0,
  detalhes              jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_worker_execucoes TO authenticated;
GRANT ALL    ON public.whatsapp_worker_execucoes TO service_role;

ALTER TABLE public.whatsapp_worker_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins leem execucoes do worker"
  ON public.whatsapp_worker_execucoes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

-- Bloqueia UPDATE e DELETE (append-only) -------------------------------------
CREATE OR REPLACE FUNCTION public.tg_wa_worker_exec_readonly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'whatsapp_worker_execucoes é append-only (%)', TG_OP;
END $$;

REVOKE ALL ON FUNCTION public.tg_wa_worker_exec_readonly() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS wa_worker_exec_no_update ON public.whatsapp_worker_execucoes;
CREATE TRIGGER wa_worker_exec_no_update
  BEFORE UPDATE OR DELETE ON public.whatsapp_worker_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_worker_exec_readonly();

CREATE INDEX IF NOT EXISTS ix_wa_worker_exec_created_at
  ON public.whatsapp_worker_execucoes (created_at DESC);

-- 2) Helper: cálculo de backoff exponencial com jitter ----------------------
CREATE OR REPLACE FUNCTION public.whatsapp_calc_backoff(
  p_tentativas integer,
  p_base_seg integer,
  p_max_seg integer
) RETURNS interval
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_base   integer := GREATEST(COALESCE(p_base_seg, 30), 1);
  v_max    integer := GREATEST(COALESCE(p_max_seg, 3600), v_base);
  v_expo   bigint;
  v_seg    bigint;
  v_jitter double precision;
BEGIN
  -- 2^(tentativas-1) * base, com teto
  v_expo := v_base * (2 ^ GREATEST(p_tentativas - 1, 0))::bigint;
  IF v_expo > v_max THEN v_expo := v_max; END IF;
  -- jitter 50%..150%
  v_jitter := 0.5 + random();
  v_seg := GREATEST(1, (v_expo * v_jitter)::bigint);
  IF v_seg > v_max THEN v_seg := v_max; END IF;
  RETURN make_interval(secs => v_seg);
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_calc_backoff(integer,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_calc_backoff(integer,integer,integer) TO service_role;

-- 3) Reserva de lote --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_reservar_lote(
  p_worker_id text,
  p_limite    integer DEFAULT NULL
) RETURNS TABLE (
  id                 uuid,
  telefone_hash      text,
  telefone_mascarado text,
  template_id        uuid,
  template_codigo    text,
  template_versao    integer,
  publico            whatsapp_publico,
  payload            jsonb,
  provider           whatsapp_provider,
  provider_instance  text,
  idempotency_key    text,
  tentativas         integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg  public.whatsapp_provider_config;
  v_lim  integer;
BEGIN
  SELECT * INTO v_cfg FROM public.whatsapp_provider_config ORDER BY created_at LIMIT 1;
  IF v_cfg IS NULL OR NOT v_cfg.enabled OR v_cfg.modo NOT IN ('HOMOLOGACAO','PRODUCAO') THEN
    RETURN;
  END IF;
  v_lim := COALESCE(p_limite, v_cfg.batch_size, 20);

  RETURN QUERY
  WITH cand AS (
    SELECT o.id
      FROM public.whatsapp_outbox o
     WHERE o.status IN ('PENDENTE','FALHOU_TEMPORARIO')
       AND o.proxima_tentativa_em <= now()
     ORDER BY o.prioridade DESC, o.proxima_tentativa_em ASC
     LIMIT v_lim
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.whatsapp_outbox o
       SET status         = 'PROCESSANDO',
           locked_at      = now(),
           locked_by      = p_worker_id,
           processado_em  = now()
     FROM cand
     WHERE o.id = cand.id
     RETURNING o.*
  )
  SELECT u.id, u.telefone_hash, u.telefone_mascarado, u.template_id,
         u.template_codigo, u.template_versao, u.publico, u.payload,
         u.provider, u.provider_instance, u.idempotency_key, u.tentativas
    FROM upd u;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_reservar_lote(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_reservar_lote(text,integer) TO service_role;

-- 4) Recuperação de travadas ------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_recuperar_travadas(
  p_timeout_seg integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg     public.whatsapp_provider_config;
  v_timeout integer;
  v_ids     uuid[];
BEGIN
  SELECT * INTO v_cfg FROM public.whatsapp_provider_config ORDER BY created_at LIMIT 1;
  v_timeout := COALESCE(p_timeout_seg, GREATEST(COALESCE(v_cfg.timeout_ms,15000) / 1000 * 4, 120));

  WITH cand AS (
    SELECT id FROM public.whatsapp_outbox
     WHERE status = 'PROCESSANDO'
       AND locked_at IS NOT NULL
       AND locked_at < now() - make_interval(secs => v_timeout)
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.whatsapp_outbox o
       SET status               = 'FALHOU_TEMPORARIO',
           tentativas           = o.tentativas + 1,
           locked_at            = NULL,
           locked_by            = NULL,
           proxima_tentativa_em = now() + public.whatsapp_calc_backoff(
             o.tentativas + 1,
             COALESCE(v_cfg.retry_base_segundos, 30),
             COALESCE(v_cfg.retry_max_segundos, 3600)
           ),
           ultimo_erro_codigo   = 'WORKER_TIMEOUT',
           ultimo_erro_resumido = 'Reserva expirou sem confirmação'
     FROM cand
     WHERE o.id = cand.id
     RETURNING o.id
  )
  SELECT array_agg(id) INTO v_ids FROM upd;

  IF v_ids IS NOT NULL THEN
    INSERT INTO public.whatsapp_outbox_eventos (outbox_id, evento, status_novo, codigo, mensagem_resumida)
    SELECT id, 'REAGENDADO', 'FALHOU_TEMPORARIO'::whatsapp_status, 'WORKER_TIMEOUT', 'Recuperação de reserva expirada'
      FROM unnest(v_ids) AS id;
  END IF;

  RETURN COALESCE(array_length(v_ids,1), 0);
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_recuperar_travadas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_recuperar_travadas(integer) TO service_role;

-- 5) Marcações de status ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_marcar_enviado(
  p_id uuid,
  p_provider_message_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_outbox
     SET status               = 'ENVIADO',
         provider_message_id  = COALESCE(provider_message_id, p_provider_message_id),
         enviado_em           = COALESCE(enviado_em, now()),
         locked_at            = NULL,
         locked_by            = NULL,
         ultimo_erro_codigo   = NULL,
         ultimo_erro_resumido = NULL
   WHERE id = p_id
     AND status = 'PROCESSANDO';

  IF FOUND THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_novo, provider_message_id, codigo)
    VALUES (p_id, 'ENVIO_ACEITO', 'ENVIADO'::whatsapp_status, p_provider_message_id, 'OK');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_marcar_enviado(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_marcar_enviado(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_outbox_marcar_falha_temporaria(
  p_id uuid,
  p_codigo text,
  p_mensagem_resumida text
) RETURNS whatsapp_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg  public.whatsapp_provider_config;
  v_row  public.whatsapp_outbox;
  v_max  integer;
  v_next timestamptz;
  v_status whatsapp_status;
BEGIN
  SELECT * INTO v_cfg FROM public.whatsapp_provider_config ORDER BY created_at LIMIT 1;
  v_max := COALESCE(v_cfg.max_tentativas, 5);

  SELECT * INTO v_row FROM public.whatsapp_outbox WHERE id = p_id FOR UPDATE;
  IF v_row IS NULL OR v_row.status <> 'PROCESSANDO' THEN
    RETURN NULL;
  END IF;

  IF (v_row.tentativas + 1) >= v_max THEN
    UPDATE public.whatsapp_outbox
       SET status               = 'FALHOU_DEFINITIVO',
           tentativas           = tentativas + 1,
           locked_at            = NULL, locked_by = NULL,
           falhou_em            = now(),
           ultimo_erro_codigo   = p_codigo,
           ultimo_erro_resumido = left(coalesce(p_mensagem_resumida,''), 500)
     WHERE id = p_id;
    v_status := 'FALHOU_DEFINITIVO';
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_anterior, status_novo, codigo, mensagem_resumida)
    VALUES (p_id, 'FALHA_DEFINITIVA', 'PROCESSANDO', 'FALHOU_DEFINITIVO', p_codigo, left(coalesce(p_mensagem_resumida,''),500));
  ELSE
    v_next := now() + public.whatsapp_calc_backoff(
      v_row.tentativas + 1,
      COALESCE(v_cfg.retry_base_segundos, 30),
      COALESCE(v_cfg.retry_max_segundos, 3600)
    );
    UPDATE public.whatsapp_outbox
       SET status               = 'FALHOU_TEMPORARIO',
           tentativas           = tentativas + 1,
           locked_at            = NULL, locked_by = NULL,
           proxima_tentativa_em = v_next,
           ultimo_erro_codigo   = p_codigo,
           ultimo_erro_resumido = left(coalesce(p_mensagem_resumida,''),500)
     WHERE id = p_id;
    v_status := 'FALHOU_TEMPORARIO';
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_anterior, status_novo, codigo, mensagem_resumida, metadata_segura)
    VALUES (p_id, 'FALHA_TEMPORARIA', 'PROCESSANDO', 'FALHOU_TEMPORARIO', p_codigo,
            left(coalesce(p_mensagem_resumida,''),500),
            jsonb_build_object('proxima_tentativa_em', v_next));
  END IF;

  RETURN v_status;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_marcar_falha_temporaria(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_marcar_falha_temporaria(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_outbox_marcar_falha_definitiva(
  p_id uuid,
  p_codigo text,
  p_mensagem_resumida text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_outbox
     SET status               = 'FALHOU_DEFINITIVO',
         tentativas           = tentativas + 1,
         locked_at            = NULL, locked_by = NULL,
         falhou_em            = now(),
         ultimo_erro_codigo   = p_codigo,
         ultimo_erro_resumido = left(coalesce(p_mensagem_resumida,''),500)
   WHERE id = p_id
     AND status IN ('PROCESSANDO','PENDENTE','FALHOU_TEMPORARIO');

  IF FOUND THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_novo, codigo, mensagem_resumida)
    VALUES (p_id, 'FALHA_DEFINITIVA', 'FALHOU_DEFINITIVO'::whatsapp_status, p_codigo, left(coalesce(p_mensagem_resumida,''),500));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_marcar_falha_definitiva(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_marcar_falha_definitiva(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_outbox_cancelar(
  p_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_outbox
     SET status = 'CANCELADO',
         locked_at = NULL, locked_by = NULL,
         ultimo_erro_codigo   = 'CANCELADO',
         ultimo_erro_resumido = left(coalesce(p_motivo,''),500)
   WHERE id = p_id
     AND status IN ('PENDENTE','FALHOU_TEMPORARIO','PROCESSANDO');
  IF FOUND THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_novo, codigo, mensagem_resumida)
    VALUES (p_id, 'CANCELADO', 'CANCELADO'::whatsapp_status, 'CANCELADO', left(coalesce(p_motivo,''),500));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_cancelar(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_cancelar(uuid,text) TO service_role;

-- 6) Registrar execução do worker (append-only) -----------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_registrar_execucao(
  p_execution_id       text,
  p_worker             text,
  p_status             text,
  p_inicio             timestamptz,
  p_fim                timestamptz,
  p_selecionadas       integer,
  p_enviadas           integer,
  p_falhas_temporarias integer,
  p_falhas_definitivas integer,
  p_ignoradas          integer,
  p_detalhes           jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_worker_execucoes
    (execution_id, worker, status, inicio, fim, duracao_ms,
     selecionadas, enviadas, falhas_temporarias, falhas_definitivas, ignoradas, detalhes)
  VALUES
    (p_execution_id, p_worker, p_status, p_inicio, p_fim,
     GREATEST(0, (EXTRACT(EPOCH FROM (COALESCE(p_fim, now()) - p_inicio)) * 1000)::integer),
     COALESCE(p_selecionadas,0), COALESCE(p_enviadas,0),
     COALESCE(p_falhas_temporarias,0), COALESCE(p_falhas_definitivas,0),
     COALESCE(p_ignoradas,0), COALESCE(p_detalhes,'{}'::jsonb))
  ON CONFLICT (execution_id) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_registrar_execucao(text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_registrar_execucao(text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,integer,jsonb) TO service_role;

-- 7) Reenfileirar (Dead Letter → PENDENTE) — Super Admin apenas -------------
CREATE OR REPLACE FUNCTION public.whatsapp_outbox_reenfileirar(
  p_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'super_admin') THEN
    RAISE EXCEPTION 'Apenas Super Admin pode reenfileirar mensagens WhatsApp';
  END IF;

  UPDATE public.whatsapp_outbox
     SET status               = 'PENDENTE',
         locked_at            = NULL, locked_by = NULL,
         proxima_tentativa_em = now(),
         falhou_em            = NULL,
         ultimo_erro_codigo   = NULL,
         ultimo_erro_resumido = NULL
   WHERE id = p_id
     AND status IN ('FALHOU_DEFINITIVO','CANCELADO');

  IF FOUND THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_novo, codigo, mensagem_resumida)
    VALUES (p_id, 'REAGENDADO', 'PENDENTE'::whatsapp_status, 'REENFILEIRADO',
            left(coalesce(p_motivo,'Reenfileirado por Super Admin'),500));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_reenfileirar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_reenfileirar(uuid,text) TO authenticated, service_role;

-- 8) Índices auxiliares ------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_wa_outbox_reserva
  ON public.whatsapp_outbox (status, proxima_tentativa_em)
  WHERE status IN ('PENDENTE','FALHOU_TEMPORARIO');

CREATE INDEX IF NOT EXISTS ix_wa_outbox_travadas
  ON public.whatsapp_outbox (status, locked_at)
  WHERE status = 'PROCESSANDO';
