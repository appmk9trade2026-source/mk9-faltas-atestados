-- Rodada 2 - Etapa 2: Simulação Supervisor / Ocorrência
-- Mapeamento e transição de estado no banco de dados

-- Registrar o início da Etapa 2 na matriz de auditoria
INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES 
  ('ocorrencia_ponto', 'STORAGE', 'NOT_TESTED', 'P1', 'Aguardando simulação de upload privado (JPG, PNG, PDF).', 'RUN-20260819-P0-002', now()),
  ('ocorrencia_ponto', 'RBAC_RLS', 'NOT_TESTED', 'P0', 'Aguardando validação de escopo do Supervisor.', 'RUN-20260819-P0-002', now()),
  ('ocorrencia_ponto', 'IDEMPOTENCY', 'NOT_TESTED', 'P0', 'Aguardando teste de double-click e retry.', 'RUN-20260819-P0-002', now()),
  ('ocorrencia_ponto', 'HTML_GUARD', 'NOT_TESTED', 'P0', 'Aguardando validação de fronteira contra respostas HTML.', 'RUN-20260819-P0-002', now())
ON CONFLICT (flow_id, gate_id) 
DO UPDATE SET 
  status = EXCLUDED.status,
  evidence = EXCLUDED.evidence,
  trace_id = EXCLUDED.trace_id,
  updated_at = now();

-- Manter status PASS para os gates técnicos já validados na Etapa 1
UPDATE public.audit_stability_results 
SET evidence = evidence || ' (Validado na Etapa 1 - Baseline Técnico)'
WHERE gate_id IN ('BUILD', 'SERVER_FUNCTION') AND status = 'PASS';
