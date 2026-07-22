
ALTER VIEW public.whatsapp_tst_saude   SET (security_invoker = true);
ALTER VIEW public.whatsapp_tst_monitor SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.wa_tst_confirmar(uuid, inet)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reenfileirar_acidente_para_tst(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.materializar_whatsapp_acidente(uuid)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_tst_confirmar(uuid, inet)          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reenfileirar_acidente_para_tst(uuid)  TO authenticated;
-- materializar_whatsapp_acidente é interna (trigger + reenfileirar); mantém apenas service_role
GRANT  EXECUTE ON FUNCTION public.materializar_whatsapp_acidente(uuid)  TO service_role;
