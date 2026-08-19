
create type public.stability_status as enum ('NOT_TESTED', 'PASS', 'GAP', 'BLOCKED');
create type public.stability_severity as enum ('P0', 'P1', 'P2', 'P3', 'N/A');

create table public.audit_stability_results (
    id uuid primary key default gen_random_uuid(),
    flow_id text not null,
    gate_id text not null,
    status public.stability_status not null default 'NOT_TESTED',
    severity public.stability_severity not null default 'N/A',
    evidence text,
    root_cause text,
    recommended_fix text,
    trace_id text,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id),
    unique(flow_id, gate_id)
);

grant select, insert, update, delete on public.audit_stability_results to authenticated;
grant all on public.audit_stability_results to service_role;

alter table public.audit_stability_results enable row level security;

create policy "Only super admins can manage stability results"
on public.audit_stability_results
for all
to authenticated
using (public.has_role(auth.uid(), 'super_admin'));

-- Seed inicial para os fluxos principais
insert into public.audit_stability_results (flow_id, gate_id, status)
values 
('nova_ausencia', 'BUILD', 'NOT_TESTED'),
('nova_ausencia', 'SERVER_FUNCTION', 'NOT_TESTED'),
('nova_ausencia', 'RESPONSE_CONTRACT', 'NOT_TESTED'),
('nova_ausencia', 'HTML_GUARD', 'NOT_TESTED'),
('nova_ausencia', 'ZOD_SANITIZATION', 'NOT_TESTED'),
('nova_ausencia', 'IDEMPOTENCY', 'NOT_TESTED'),
('nova_ausencia', 'DOUBLE_CLICK', 'NOT_TESTED'),
('nova_ausencia', 'RBAC_RLS', 'NOT_TESTED'),
('nova_ausencia', 'AUDIT_EVENT', 'NOT_TESTED'),
('nova_ausencia', 'TRACE_ID', 'NOT_TESTED'),
('nova_ausencia', 'STORAGE', 'NOT_TESTED'),
('ocorrencia_ponto', 'BUILD', 'NOT_TESTED'),
('ocorrencia_ponto', 'SERVER_FUNCTION', 'NOT_TESTED'),
('ocorrencia_ponto', 'STORAGE_CONTRACT', 'NOT_TESTED'),
('processamento_interno', 'BUILD', 'NOT_TESTED'),
('processamento_interno', 'SERVER_BUNDLE', 'NOT_TESTED');
