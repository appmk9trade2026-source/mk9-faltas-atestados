CREATE TABLE public.operational_health_incidents (
    id uuid primary key default gen_random_uuid(),
    fingerprint text not null unique,
    module text not null,
    operation text not null,
    stage text,
    category text not null,
    severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
    status text not null default 'OPEN' check (status in ('OPEN', 'MONITORING', 'RESOLVED')),
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    occurrence_count bigint not null default 1,
    affected_users_count bigint not null default 1,
    sample_trace_id uuid,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE ON public.operational_health_incidents TO authenticated;
GRANT ALL ON public.operational_health_incidents TO service_role;

ALTER TABLE public.operational_health_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can see all health incidents"
ON public.operational_health_incidents
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_health_incidents_fingerprint ON public.operational_health_incidents(fingerprint);
CREATE INDEX idx_health_incidents_status ON public.operational_health_incidents(status) WHERE status != 'RESOLVED';