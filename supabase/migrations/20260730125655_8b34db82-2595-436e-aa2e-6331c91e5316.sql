REVOKE EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) FROM anon;