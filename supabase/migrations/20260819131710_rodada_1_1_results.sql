insert into public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id)
values 
('nova_ausencia', 'ZOD_SANITIZATION', 'PASS', 'N/A', 'GAP B Resolvido. Schema canônico agora valida Meio Período server-side.', 'RUN-20260819-P0-001-R1'),
('nova_ausencia', 'UX_ERROR_HANDLING', 'PASS', 'N/A', 'Sanitização de erro implementada. Mensagens funcionais sem stack trace.', 'RUN-20260819-P0-001-R1'),
('nova_ausencia', 'TRACE_ID', 'PASS', 'N/A', 'Otimização de query no Drawer e limite de seleção implementado (GAP A).', 'RUN-20260819-P0-001-R1')
on conflict (flow_id, gate_id) do update set
status = excluded.status,
severity = excluded.severity,
evidence = excluded.evidence,
trace_id = excluded.trace_id,
updated_at = now();
