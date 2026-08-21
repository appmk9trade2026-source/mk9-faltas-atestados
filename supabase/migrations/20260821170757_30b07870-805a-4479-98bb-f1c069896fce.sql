GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_projeto(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisor_has_projeto_via_equipe(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coordenador_has_projeto_via_equipe(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_projeto_empresa_match(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) TO authenticated, service_role;

ALTER FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) SECURITY DEFINER;