
-- Configuração privada do cron do worker WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_cron_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  endpoint_url text NOT NULL,
  worker_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sem GRANT para anon/authenticated: só service_role e SECURITY DEFINER acessam.
GRANT ALL ON public.whatsapp_cron_config TO service_role;

ALTER TABLE public.whatsapp_cron_config ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy → nenhum acesso via Data API. Somente service_role/DEFINER.
-- Adicionamos apenas uma policy vazia para deixar explícito o design.
DROP POLICY IF EXISTS "whatsapp_cron_config_no_access" ON public.whatsapp_cron_config;
CREATE POLICY "whatsapp_cron_config_no_access"
  ON public.whatsapp_cron_config FOR ALL
  TO authenticated
  USING (false) WITH CHECK (false);

-- Função tick: chama o endpoint com header x-worker-secret
CREATE OR REPLACE FUNCTION public.cron_tick_whatsapp_outbox()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.whatsapp_cron_config;
  v_req_id bigint;
BEGIN
  SELECT * INTO v_cfg FROM public.whatsapp_cron_config WHERE id = true;
  IF v_cfg IS NULL OR v_cfg.enabled = false OR v_cfg.worker_secret IS NULL OR v_cfg.endpoint_url IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_cfg.endpoint_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-worker-secret', v_cfg.worker_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_req_id;

  RETURN v_req_id;
END $$;

REVOKE ALL ON FUNCTION public.cron_tick_whatsapp_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_tick_whatsapp_outbox() TO service_role;

-- Extensões (idempotentes; provavelmente já habilitadas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendamentos: tick a cada 1 min + recovery a cada 5 min (mesma função, cobre travadas)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp_outbox_worker_tick') THEN
    PERFORM cron.unschedule('whatsapp_outbox_worker_tick');
  END IF;
  PERFORM cron.schedule(
    'whatsapp_outbox_worker_tick',
    '* * * * *',
    $sql$ SELECT public.cron_tick_whatsapp_outbox(); $sql$
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp_outbox_worker_recover') THEN
    PERFORM cron.unschedule('whatsapp_outbox_worker_recover');
  END IF;
  PERFORM cron.schedule(
    'whatsapp_outbox_worker_recover',
    '*/5 * * * *',
    $sql$ SELECT public.cron_tick_whatsapp_outbox(); $sql$
  );
END $$;
