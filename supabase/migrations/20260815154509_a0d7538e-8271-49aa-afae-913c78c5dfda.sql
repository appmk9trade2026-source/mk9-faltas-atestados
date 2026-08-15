WITH new_incident AS (
  INSERT INTO public.operational_health_incidents (
    fingerprint, module, operation, category, severity, status, 
    first_seen_at, last_seen_at, occurrence_count, affected_users_count,
    metadata
  ) VALUES (
    'dGVzdGVfaG9tb2xvZ2FjYW9fcDBfc2FuZGJveA==' || now()::text, 'HEALTH_CHECK', 'E2E_TEST', 'TECHNICAL', 'P0', 'OPEN',
    now(), now(), 1, 1,
    '{"is_test": true, "test_run_id": "TR-8-REAL-001"}'
  ) RETURNING id, fingerprint, severity, sample_trace_id
),
new_alert AS (
  INSERT INTO public.operational_alerts (
    incident_id, fingerprint, severity, status, decision_reason, alert_count, next_eligible_at
  ) 
  SELECT id, fingerprint, severity, 'READY', 'TEST_AUTHORIZATION', 1, now()
  FROM new_incident
  RETURNING id, incident_id, fingerprint, severity
)
INSERT INTO public.operational_notification_outbox (
  incident_id, alert_id, channel, status, idempotency_key, metadata, fingerprint, severity
)
SELECT 
  incident_id, id, 'WHATSAPP', 'PENDING', 
  'TR-8-REAL-001-' || id::text,
  '{"is_test": true, "test_run_id": "TR-8-REAL-001"}',
  fingerprint,
  severity
FROM new_alert
RETURNING id, incident_id, alert_id;