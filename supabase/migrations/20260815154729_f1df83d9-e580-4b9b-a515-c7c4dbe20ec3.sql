-- 1. Ativar SANDBOX e Kill Switch
UPDATE public.operational_notification_config 
SET environment = 'SANDBOX', kill_switch_enabled = true 
WHERE id = (SELECT id FROM public.operational_notification_config LIMIT 1);

-- 2. Criar Incidente de Teste
INSERT INTO public.operational_health_incidents (
  fingerprint, module, operation, stage, category, severity, status, metadata
) VALUES (
  'AUTH-REAL-TEST-P0', 'HEALTH', 'AUTHORIZATION', 'SANDBOX', 'REAL_TEST', 'P0', 'OPEN', 
  '{"authorized_by": "CRM-MK9-STAGE8", "test_id": "TR-8-REAL-001"}'
);

-- 3. Criar Alerta de Teste
INSERT INTO public.operational_alerts (
  incident_id, fingerprint, severity, status, decision_reason, alert_count, sample_trace_id
) VALUES (
  (SELECT id FROM public.operational_health_incidents WHERE fingerprint = 'AUTH-REAL-TEST-P0' LIMIT 1),
  'AUTH-REAL-TEST-P0',
  'P0',
  'READY',
  'AUTHORIZATION_FLOW',
  1,
  '00000000-0000-0000-0000-000000000000'
);

-- 4. Enfileirar Notificação na Outbox
INSERT INTO public.operational_notification_outbox (
  alert_id, incident_id, fingerprint, severity, channel, status, idempotency_key, metadata
) VALUES (
  (SELECT id FROM public.operational_alerts WHERE fingerprint = 'AUTH-REAL-TEST-P0' LIMIT 1),
  (SELECT id FROM public.operational_health_incidents WHERE fingerprint = 'AUTH-REAL-TEST-P0' LIMIT 1),
  'AUTH-REAL-TEST-P0',
  'P0',
  'WHATSAPP',
  'PENDING',
  'TR-8-REAL-001',
  '{"test_id": "TR-8-REAL-001", "trace_id": "TR-8-REAL-001"}'
);
