
-- Motor de detecção determinística de incidentes (Versão Final Alinhada ao Schema)
create or replace function public.detect_potential_incidents(
    _window_minutes int default 60,
    _threshold_potential int default 5
)
returns table (
    source_module text,
    safe_code text,
    category text,
    ticket_count bigint,
    user_count bigint,
    first_detected timestamptz,
    last_detected timestamptz,
    fingerprint text
)
language sql
stable
security definer
set search_path = public
as $$
    with recent_tickets as (
        select 
            source_route as source_module,
            safe_code,
            category,
            requester_user_id as user_id,
            created_at
        from public.support_tickets
        where created_at > now() - (_window_minutes * interval '1 minute')
          and safe_code is not null
    ),
    grouped_tickets as (
        select 
            source_module,
            safe_code,
            category,
            count(*) as ticket_count,
            count(distinct user_id) as user_count,
            min(created_at) as first_detected,
            max(created_at) as last_detected,
            source_module || ':' || safe_code || ':' || coalesce(category, 'general') as fingerprint
        from recent_tickets
        group by source_module, safe_code, category
    )
    select * 
    from grouped_tickets
    where ticket_count >= _threshold_potential;
$$;

-- Revogar execute público
revoke execute on function public.detect_potential_incidents(int, int) from public;
revoke execute on function public.detect_potential_incidents(int, int) from authenticated;
grant execute on function public.detect_potential_incidents(int, int) to service_role;
