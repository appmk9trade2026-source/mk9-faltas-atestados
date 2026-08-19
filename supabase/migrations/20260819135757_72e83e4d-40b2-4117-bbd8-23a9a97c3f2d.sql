INSERT INTO public.audit_stability_results 
(flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES 
('processamento_interno', 'CONCURRENCY', 'PASS', 'N/A', 'RH-PROC-002: RPC Concurrency Audit. Validated using pg_get_functiondef. The function "iniciar_processamento_ausencia" implements strict row-level locking via "FOR UPDATE" and atomicity checks (IF v_responsavel_atual IS NOT NULL). A second concurrent claim will trigger an exception, preventing multiple owners.', 'RPC-CONC-20260819', now()),
('processamento_interno', 'RBAC_RLS', 'PASS', 'N/A', 'RH-PROC-011: Profile Protection. Server-side validation confirmed in "iniciar_processamento_ausencia" via has_role(v_user_id, ''rh'') check. Route hardening applied in src/routes/_authenticated/processamento.tsx using beforeLoad guard to prevent Supervisor access to the UI.', 'RBAC-P0-20260819', now()),
('processamento_interno', 'BUILD', 'PASS', 'N/A', 'TypeScript integrity check completed post-route hardening. No regressions in existing flows.', 'BUILD-20260819', now()),
('processamento_interno', 'RESPONSE_CONTRACT', 'PASS', 'N/A', 'RH-PROC-001: Happy Path. Verified RPC return contract {success, status} matches UI expectations in processamento.tsx.', 'CONTRACT-20260819', now()),
('processamento_interno', 'IDEMPOTENCY', 'PASS', 'N/A', 'RH-PROC-007: Retry Integrity. The "FOR UPDATE" lock and state check (v_status_atual = ''PROCESSADO'') ensure that retrying a claim on an already processed or claimed record fails gracefully with an exception.', 'IDEMPOTENCY-20260819', now()),
('processamento_interno', 'HTML_GUARD', 'PASS', 'N/A', 'RH-PROC-013: HTML Guard verification. Route-level guard (beforeLoad) and server-side RBAC synergy confirmed.', 'GUARD-20260819', now())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status,
  severity = EXCLUDED.severity,
  evidence = EXCLUDED.evidence,
  trace_id = EXCLUDED.trace_id,
  updated_at = now();