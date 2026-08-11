GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(date, date, uuid, uuid, text, tipo_ausencia, status_ausencia, uuid) TO anon;