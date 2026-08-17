
-- 1. Saneamento da Outbox Antiga
UPDATE public.operational_notification_outbox 
SET status = 'CANCELLED' 
WHERE id = '6ecfc9a4-1fed-485c-a77b-d0dc01cae8e4';

-- 2. Cadastro do Recipient de Produção
INSERT INTO public.operational_notification_recipients (
  channel, 
  destination, 
  label, 
  environment, 
  active, 
  admin_verified, 
  is_test_recipient, 
  provider_check_capability
) VALUES (
  'WHATSAPP', 
  '5511999999999', 
  'RECIPIENT_PRODUCTION_TECHNICAL', 
  'PRODUCTION', 
  true, 
  true, 
  false, 
  'NOT_SUPPORTED'
);

-- 3. Auditoria do Cancelamento
INSERT INTO public.operational_notification_audit_logs (
  actor_id,
  action,
  before_state,
  after_state,
  trace_id
) VALUES (
  'f8cc378b-9f2b-4b06-95fc-4fe79cc319c3',
  'OUTBOX_CANCELLED',
  '{"id": "6ecfc9a4-1fed-485c-a77b-d0dc01cae8e4", "status": "PENDENTE"}',
  '{"id": "6ecfc9a4-1fed-485c-a77b-d0dc01cae8e4", "status": "CANCELLED", "reason": "STALE_SANDBOX_TEST"}',
  '00000000-0000-0000-0000-000000000005'
);
