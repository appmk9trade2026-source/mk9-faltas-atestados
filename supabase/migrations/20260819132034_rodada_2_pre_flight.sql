-- Inicia a Rodada 2 na matriz de estabilidade
-- Nova Ausência já está homologada (Baseline)
update public.audit_stability_results
set trace_id = 'RUN-20260819-P0-001-R1',
    evidence = 'Baseline Homologado em R1.1. Fluxo congelado para R2.'
where flow_id = 'nova_ausencia' and status = 'PASS';

-- Prepara os novos gates da Rodada 2
insert into public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id)
values 
('ocorrencia_ponto', 'STORAGE', 'NOT_TESTED', 'P0', 'Aguardando teste de upload e signed URL privado.', 'RUN-20260819-P0-002'),
('ocorrencia_ponto', 'RBAC_RLS', 'NOT_TESTED', 'P0', 'Verificar se Supervisor acessa apenas suas ocorrências.', 'RUN-20260819-P0-002'),
('processamento_interno', 'CONCURRENCY', 'NOT_TESTED', 'P0', 'Simular disputa de Claim/Lock entre dois RHs.', 'RUN-20260819-P0-002')
on conflict (flow_id, gate_id) do update set
status = excluded.status,
severity = excluded.severity,
evidence = excluded.evidence,
trace_id = excluded.trace_id,
updated_at = now();
