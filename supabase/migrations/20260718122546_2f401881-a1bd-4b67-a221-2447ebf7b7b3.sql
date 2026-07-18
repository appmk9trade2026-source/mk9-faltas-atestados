
REVOKE EXECUTE ON FUNCTION public.oa_incidente_transicionar(uuid, public.oa_incidente_status, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.oa_dashboard(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.oa_periodo_encerrar(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.oa_periodo_prorrogar(uuid, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.oa_incidente_transicionar(uuid, public.oa_incidente_status, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oa_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oa_periodo_encerrar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oa_periodo_prorrogar(uuid, date, text) TO authenticated;
