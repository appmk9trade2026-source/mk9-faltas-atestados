
-- 1. Enums
create type public.support_incident_status as enum ('POTENTIAL', 'INVESTIGATING', 'CONFIRMED', 'MONITORING', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE');
create type public.support_incident_severity as enum ('P0', 'P1', 'P2', 'P3');
create type public.support_incident_relation_type as enum ('AUTO_SUGGESTED', 'HUMAN_CONFIRMED', 'MANUAL', 'REJECTED');
create type public.support_incident_confidence as enum ('HIGH', 'MEDIUM', 'LOW');

-- 2. Tabela de Incidentes
create table public.support_incidents (
    id uuid primary key default gen_random_uuid(),
    incident_protocol text unique,
    title text not null,
    description text,
    status public.support_incident_status not null default 'POTENTIAL',
    severity public.support_incident_severity not null default 'P2',
    source_module text not null,
    primary_safe_code text,
    detection_source text not null default 'DETERMINISTIC',
    incident_fingerprint text unique not null,
    first_detected_at timestamptz not null default now(),
    confirmed_at timestamptz,
    resolved_at timestamptz,
    closed_at timestamptz,
    confirmed_by uuid references auth.users(id),
    resolved_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Vínculo Incidente <-> Tickets
create table public.support_incident_tickets (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid references public.support_incidents(id) on delete cascade not null,
    ticket_id uuid references public.support_tickets(id) on delete cascade not null,
    relation_type public.support_incident_relation_type not null default 'AUTO_SUGGESTED',
    confidence_level public.support_incident_confidence not null default 'MEDIUM',
    linked_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    unique(incident_id, ticket_id)
);

-- 4. Protocol Generator INC-YYYYMMDD-XXXX
create or replace function public.generate_incident_protocol()
returns trigger as $$
declare
    prefix text := 'INC-' || to_char(now(), 'YYYYMMDD') || '-';
    new_seq int;
begin
    select coalesce(max(substring(incident_protocol from 14)::int), 0) + 1
    into new_seq
    from public.support_incidents
    where incident_protocol like prefix || '%';

    new.incident_protocol := prefix || lpad(new_seq::text, 4, '0');
    return new;
end;
$$ language plpgsql;

create trigger tr_generate_incident_protocol
before insert on public.support_incidents
for each row execute function public.generate_incident_protocol();

-- 5. Segurança
grant select, insert, update on public.support_incidents to authenticated;
grant all on public.support_incidents to service_role;
grant select, insert, update, delete on public.support_incident_tickets to authenticated;
grant all on public.support_incident_tickets to service_role;

alter table public.support_incidents enable row level security;
alter table public.support_incident_tickets enable row level security;

create policy "Admins e RH podem ler incidentes"
on public.support_incidents for select
to authenticated
using (true);

create policy "Super Admins podem criar e gerenciar incidentes"
on public.support_incidents for all
to authenticated
using (public.has_role(auth.uid(), 'super_admin'));

create policy "Admins e RH podem ler vínculos de incidentes"
on public.support_incident_tickets for select
to authenticated
using (true);

create policy "Super Admins podem gerenciar vínculos"
on public.support_incident_tickets for all
to authenticated
using (public.has_role(auth.uid(), 'super_admin'));

-- 6. Índices para Performance
create index idx_support_incidents_fingerprint on public.support_incidents(incident_fingerprint);
create index idx_support_incidents_status on public.support_incidents(status);
create index idx_support_incident_tickets_incident on public.support_incident_tickets(incident_id);
create index idx_support_incident_tickets_ticket on public.support_incident_tickets(ticket_id);
