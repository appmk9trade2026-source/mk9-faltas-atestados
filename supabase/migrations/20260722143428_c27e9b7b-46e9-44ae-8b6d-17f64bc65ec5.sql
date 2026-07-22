DROP FUNCTION IF EXISTS public.wa_tst_confirmar(uuid);
REVOKE ALL ON FUNCTION public.wa_tst_confirmar(uuid, inet) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wa_tst_confirmar(uuid, inet) TO authenticated;