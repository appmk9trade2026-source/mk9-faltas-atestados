
-- Corrigindo search_path na função de protocolo (Security Warn 3)
alter function public.generate_incident_protocol() set search_path = public;

-- Revogando EXECUTE público em funções internas (Security Warn 5/6)
revoke execute on function public.generate_incident_protocol() from public;
revoke execute on function public.generate_incident_protocol() from authenticated;
grant execute on function public.generate_incident_protocol() to service_role;
