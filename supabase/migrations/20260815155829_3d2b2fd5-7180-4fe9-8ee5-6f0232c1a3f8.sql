
-- 1. Criar Incidente de Teste
WITH new_incident AS (
  INSERT INTO public.operational_health_incidents (
    fingerprint, module, operation, category, severity, status, 
    occurrence_count, affected_users_count, sample_trace_id, metadata
  ) VALUES (
    'TR-8-REAL-002-FINGERPRINT', 'TEST', 'HOMOLOGACAO_P0', 'TECHNICAL', 'P0', 'OPEN',
    1, 1, gen_random_uuid(), '{"is_test": true, "test_run": "TR-8-REAL-002"}'::jsonb
  ) RETURNING id, fingerprint, sample_trace_id
),
-- 2. Criar Alerta P0
new_alert AS (
  INSERT INTO public.operational_alerts (
    incident_id, fingerprint, severity, status, decision_reason, 
    alert_count, last_alerted_at, sample_trace_id
  ) 
  SELECT id, fingerprint, 'P0', 'READY', 'TR-8-REAL-002-FIXTURE', 1, now(), sample_trace_id
  FROM new_incident
  RETURNING id, incident_id, fingerprint, sample_trace_id
)
-- 3. Gerar Outbox
INSERT INTO public.operational_notification_outbox (
  alert_id, incident_id, fingerprint, severity, channel, status, 
  idempotency_key, metadata
)
SELECT id, incident_id, fingerprint, 'P0', 'WHATSAPP', 'PENDING',
  'TR-8-REAL-002-' || encode(digest(id::text, 'sha256'), 'hex'),
  jsonb_build_object('trace_id', 'TR-8-REAL-002', 'is_test', true, 'trace_uuid', sample_trace_id)
FROM new_alert;
