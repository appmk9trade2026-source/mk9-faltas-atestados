-- RODADA 2 — ETAPA 3
-- HOMOLOGAÇÃO OPERACIONAL — RH / PROCESSAMENTO INTERNO

-- 1. Assegurar que os gates para 'processamento_interno' existem e estão resetados
INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, updated_at)
SELECT 'processamento_interno', gate, 'NOT_TESTED', 'N/A', NOW()
FROM unnest(ARRAY[
  'BUILD', 'SERVER_FUNCTION', 'RESPONSE_CONTRACT', 'HTML_GUARD', 
  'ZOD_SANITIZATION', 'IDEMPOTENCY', 'DOUBLE_CLICK', 'RBAC_RLS', 
  'AUDIT_EVENT', 'TRACE_ID', 'STORAGE', 'CONCURRENCY', 
  'UX_ERROR_HANDLING', 'REGRESSION'
]) as gate
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status,
  severity = EXCLUDED.severity,
  evidence = NULL,
  root_cause = NULL,
  recommended_fix = NULL,
  trace_id = NULL,
  updated_at = NOW();

-- 2. Garantir que o grant de acesso continue válido para a tabela
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_stability_results TO authenticated;
GRANT ALL ON public.audit_stability_results TO service_role;
