-- Registrar resultados da Rodada 2B - Etapa 2B (Execução Forense Supervisor)

-- SUP-OCC-001 Happy Path
INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'BUILD', 'PASS', 'N/A', 'Build íntegro verificado na Etapa 1. Bundling de Server Functions OK.', 'TR-20260819-001', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'SERVER_FUNCTION', 'PASS', 'N/A', 'Assinatura RPC verificada. Payload Zod validado server-side.', 'TR-20260819-002', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'HTML_GUARD', 'PASS', 'N/A', 'Textarea renderizado como literal. Sanitização DOM ativa no frontend.', 'TR-20260819-003', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'ZOD_SANITIZATION', 'PASS', 'N/A', 'Server-side validation ativa. Campos extras descartados pelo strip().', 'TR-20260819-004', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'RBAC_RLS', 'PASS', 'N/A', 'Supervisor restrito ao próprio escopo. RLS testado via service role simulation.', 'TR-20260819-005', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'STORAGE', 'PASS', 'N/A', 'Bucket privado. Caminho determinístico uuid/filename.ext validado.', 'TR-20260819-006', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

INSERT INTO public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id, updated_at)
VALUES ('ocorrencia_ponto', 'IDEMPOTENCY', 'GAP', 'P2', 'Correlation_id presente mas sem bloqueio estrito de replay no banco (apenas server function logic).', 'TR-20260819-007', NOW())
ON CONFLICT (flow_id, gate_id) DO UPDATE SET 
  status = EXCLUDED.status, 
  evidence = EXCLUDED.evidence, 
  updated_at = NOW();

