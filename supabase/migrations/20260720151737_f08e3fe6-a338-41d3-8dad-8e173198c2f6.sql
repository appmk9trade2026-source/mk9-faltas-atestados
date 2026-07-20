ALTER TABLE public.whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_proxima_tentativa_finita_chk
  CHECK (proxima_tentativa_em IS NULL OR proxima_tentativa_em <> 'infinity'::timestamptz)
  NOT VALID;

ALTER TABLE public.whatsapp_outbox
  VALIDATE CONSTRAINT whatsapp_outbox_proxima_tentativa_finita_chk;