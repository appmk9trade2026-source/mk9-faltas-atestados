
CREATE OR REPLACE FUNCTION public.whatsapp_status_pode_evoluir(
  atual public.whatsapp_status,
  novo  public.whatsapp_status
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  WITH ord(st, ordem) AS (VALUES
    ('PENDENTE'::public.whatsapp_status,          0),
    ('PROCESSANDO'::public.whatsapp_status,       1),
    ('FALHOU_TEMPORARIO'::public.whatsapp_status, 2),
    ('ENVIADO'::public.whatsapp_status,           3),
    ('ENTREGUE'::public.whatsapp_status,          4),
    ('LIDO'::public.whatsapp_status,              5),
    ('FALHOU_DEFINITIVO'::public.whatsapp_status, 6),
    ('CANCELADO'::public.whatsapp_status,         7)
  )
  SELECT COALESCE(
    (SELECT n.ordem > a.ordem FROM ord a, ord n WHERE a.st = atual AND n.st = novo),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.whatsapp_status_pode_evoluir(public.whatsapp_status, public.whatsapp_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_status_pode_evoluir(public.whatsapp_status, public.whatsapp_status) TO service_role, authenticated;

CREATE INDEX IF NOT EXISTS wa_outbox_ev_idem_idx
  ON public.whatsapp_outbox_eventos (provider_message_id, status_novo, evento)
  WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.whatsapp_outbox_processar_webhook(
  p_instance            text,
  p_provider_message_id text,
  p_status_novo         public.whatsapp_status,
  p_codigo              text DEFAULT NULL,
  p_mensagem            text DEFAULT NULL,
  p_metadata            jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_outbox    public.whatsapp_outbox%ROWTYPE;
  v_existe_ev boolean;
  v_pode      boolean;
  v_meta      jsonb;
  v_msg       text;
BEGIN
  IF p_provider_message_id IS NULL OR length(trim(p_provider_message_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'action', 'INVALID_MESSAGE_ID');
  END IF;

  IF p_status_novo NOT IN ('ENVIADO','ENTREGUE','LIDO','FALHOU_DEFINITIVO') THEN
    RETURN jsonb_build_object('ok', false, 'action', 'STATUS_NAO_SUPORTADO');
  END IF;

  v_meta := COALESCE(p_metadata, '{}'::jsonb)
         - 'payload' - 'raw' - 'body' - 'text' - 'message'
         - 'telefone' - 'phone' - 'number' - 'nome' - 'name'
         - 'document' - 'documento' - 'cid' - 'diagnostico';
  v_meta := jsonb_set(v_meta, '{instance}', to_jsonb(p_instance), true);
  v_msg  := left(COALESCE(p_mensagem, ''), 300);
  IF v_msg = '' THEN v_msg := NULL; END IF;

  SELECT * INTO v_outbox
    FROM public.whatsapp_outbox
   WHERE provider_message_id = p_provider_message_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'action', 'WEBHOOK_IGNORADO_MENSAGEM_NAO_ENCONTRADA');
  END IF;

  IF v_outbox.provider_instance IS NOT NULL
     AND p_instance IS NOT NULL
     AND v_outbox.provider_instance <> p_instance THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_anterior, status_novo, provider_message_id, codigo, mensagem_resumida, metadata_segura)
    VALUES
      (v_outbox.id, 'PROVIDER_MESSAGE_ID_CONFLITO', v_outbox.status, NULL, p_provider_message_id, 'INSTANCIA_DIVERGENTE',
       'instância divergente', v_meta);
    RETURN jsonb_build_object('ok', true, 'action', 'PROVIDER_MESSAGE_ID_CONFLITO', 'outbox_id', v_outbox.id);
  END IF;

  INSERT INTO public.whatsapp_outbox_eventos
    (outbox_id, evento, status_anterior, status_novo, provider_message_id, codigo, mensagem_resumida, metadata_segura)
  VALUES
    (v_outbox.id, 'WEBHOOK_RECEBIDO', v_outbox.status, p_status_novo, p_provider_message_id, p_codigo, v_msg, v_meta);

  SELECT EXISTS (
    SELECT 1
      FROM public.whatsapp_outbox_eventos
     WHERE provider_message_id = p_provider_message_id
       AND status_novo = p_status_novo
       AND evento IN ('STATUS_ENVIADO','STATUS_ENTREGUE','STATUS_LIDO','STATUS_FALHOU')
  ) INTO v_existe_ev;

  IF v_existe_ev THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_anterior, status_novo, provider_message_id, codigo, mensagem_resumida, metadata_segura)
    VALUES
      (v_outbox.id, 'WEBHOOK_DUPLICADO', v_outbox.status, p_status_novo, p_provider_message_id, p_codigo, v_msg, v_meta);
    RETURN jsonb_build_object('ok', true, 'action', 'DUPLICADO', 'outbox_id', v_outbox.id, 'status_atual', v_outbox.status);
  END IF;

  v_pode := public.whatsapp_status_pode_evoluir(v_outbox.status, p_status_novo);

  IF NOT v_pode THEN
    INSERT INTO public.whatsapp_outbox_eventos
      (outbox_id, evento, status_anterior, status_novo, provider_message_id, codigo, mensagem_resumida, metadata_segura)
    VALUES
      (v_outbox.id, 'WEBHOOK_IGNORADO', v_outbox.status, p_status_novo, p_provider_message_id, 'REGRESSAO_BLOQUEADA', v_msg, v_meta);
    RETURN jsonb_build_object('ok', true, 'action', 'REGRESSAO_BLOQUEADA', 'outbox_id', v_outbox.id, 'status_atual', v_outbox.status);
  END IF;

  UPDATE public.whatsapp_outbox
     SET status               = p_status_novo,
         enviado_em           = CASE WHEN p_status_novo = 'ENVIADO' AND enviado_em IS NULL THEN now() ELSE enviado_em END,
         confirmado_em        = CASE WHEN p_status_novo IN ('ENTREGUE','LIDO') AND confirmado_em IS NULL THEN now() ELSE confirmado_em END,
         falhou_em            = CASE WHEN p_status_novo = 'FALHOU_DEFINITIVO' AND falhou_em IS NULL THEN now() ELSE falhou_em END,
         ultimo_erro_codigo   = CASE WHEN p_status_novo = 'FALHOU_DEFINITIVO' THEN p_codigo ELSE ultimo_erro_codigo END,
         ultimo_erro_resumido = CASE WHEN p_status_novo = 'FALHOU_DEFINITIVO' THEN v_msg    ELSE ultimo_erro_resumido END
   WHERE id = v_outbox.id;

  INSERT INTO public.whatsapp_outbox_eventos
    (outbox_id, evento, status_anterior, status_novo, provider_message_id, codigo, mensagem_resumida, metadata_segura)
  VALUES
    (v_outbox.id,
     CASE p_status_novo
       WHEN 'ENVIADO'           THEN 'STATUS_ENVIADO'
       WHEN 'ENTREGUE'          THEN 'STATUS_ENTREGUE'
       WHEN 'LIDO'              THEN 'STATUS_LIDO'
       WHEN 'FALHOU_DEFINITIVO' THEN 'STATUS_FALHOU'
     END,
     v_outbox.status, p_status_novo, p_provider_message_id, p_codigo, v_msg, v_meta);

  RETURN jsonb_build_object('ok', true, 'action', 'ATUALIZADO', 'outbox_id', v_outbox.id, 'status_atual', p_status_novo);
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_outbox_processar_webhook(text, text, public.whatsapp_status, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_outbox_processar_webhook(text, text, public.whatsapp_status, text, text, jsonb) TO service_role;
