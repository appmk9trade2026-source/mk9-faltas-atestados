
CREATE OR REPLACE FUNCTION public.tg_wa_outbox_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'whatsapp_outbox: DELETE bloqueado — use RPC de cancelamento'; END; $$;

CREATE OR REPLACE FUNCTION public.tg_wa_outbox_ev_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'whatsapp_outbox_eventos é append-only'; END; $$;
