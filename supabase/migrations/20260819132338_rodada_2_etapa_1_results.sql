-- Resultados da Rodada 2 - Etapa 1 - Baseline Técnico

insert into public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id)
values ('nova_ausencia', 'BUILD', 'PASS', 'N/A', 'Build de produção com sucesso (Vite + Server Bundle). Nenhuma regressão detectada.', 'RUN-20260819-P0-002')
on conflict (flow_id, gate_id) do update set
status = excluded.status,
severity = excluded.severity,
evidence = excluded.evidence,
trace_id = excluded.trace_id,
updated_at = now();

insert into public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id)
values ('nova_ausencia', 'SERVER_FUNCTION', 'PASS', 'N/A', 'TypeScript check OK. Server functions bundles sem erros de import/export.', 'RUN-20260819-P0-002')
on conflict (flow_id, gate_id) do update set
status = excluded.status,
severity = excluded.severity,
evidence = excluded.evidence,
trace_id = excluded.trace_id,
updated_at = now();

insert into public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id)
values ('ocorrencia_ponto', 'BUILD', 'PASS', 'N/A', 'Rota e componentes carregáveis. Ready for Supervisor Test.', 'RUN-20260819-P0-002')
on conflict (flow_id, gate_id) do update set
status = excluded.status,
severity = excluded.severity,
evidence = excluded.evidence,
trace_id = excluded.trace_id,
updated_at = now();

insert into public.audit_stability_results (flow_id, gate_id, status, severity, evidence, trace_id)
values ('processamento_interno', 'BUILD', 'PASS', 'N/A', 'Infraestrutura de Claim/Lock validada tecnicamente. Ready for RH Test.', 'RUN-20260819-P0-002')
on conflict (flow_id, gate_id) do update set
status = excluded.status,
severity = excluded.severity,
evidence = excluded.evidence,
trace_id = excluded.trace_id,
updated_at = now();
