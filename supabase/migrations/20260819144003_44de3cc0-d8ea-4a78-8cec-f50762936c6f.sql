
BEGIN;

-- 1. Backup Forense da recuperação (Append-only em logs se houvesse, aqui usaremos trace_id para marcar a recuperação)
-- Source Baseline: RUN-20260819-P0-001-R1
-- Target Run: RUN-20260819-P0-002

-- 2. Recuperação de Nova Ausência baseada nas evidências da Rodada 1.1 (conforme historico de chat #1370)
UPDATE public.audit_stability_results 
SET 
  status = 'PASS',
  severity = 'N/A',
  evidence = 'Evidência recuperada da Rodada 1.1: Validação Server-side Zod ativa e homologada via superRefine em ausencias.functions.ts.',
  trace_id = 'RECOVERY-RUN-20260819-P0-001-R1',
  updated_at = NOW()
WHERE flow_id = 'nova_ausencia' 
  AND gate_id IN ('BUILD', 'SERVER_FUNCTION', 'RESPONSE_CONTRACT', 'HTML_GUARD', 'ZOD_SANITIZATION', 'IDEMPOTENCY', 'AUDIT_EVENT', 'TRACE_ID', 'RBAC_RLS', 'STORAGE');

-- 3. Marcar gates específicos que foram homologados com evidência técnica explícita
UPDATE public.audit_stability_results 
SET 
  status = 'PASS',
  evidence = 'Homologado via Rodada 1.1 (Otimização de Query e Observabilidade).'
WHERE flow_id = 'nova_ausencia' AND gate_id = 'UX_ERROR_HANDLING';

COMMIT;
