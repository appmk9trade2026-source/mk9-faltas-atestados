
-- Novos valores de auditoria para senha temporária e exclusão de usuário
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'SENHA_TEMPORARIA_REDEFINIDA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_EXCLUIDO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_EXCLUSAO_BLOQUEADA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USUARIO_EXCLUSAO_TENTATIVA';

-- Marca a última redefinição de senha temporária feita pelo admin (para badge na UI).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS senha_temporaria_redefinida_em timestamptz;

-- Função de diagnóstico de dependências do usuário.
-- Retorna, por categoria, a contagem de registros históricos/operacionais que
-- devem bloquear a exclusão física. Registros de vínculo (roles/empresas/projetos)
-- e configurações pessoais NÃO bloqueiam — são removidos junto com a exclusão.
CREATE OR REPLACE FUNCTION public.contar_dependencias_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  n bigint;
  total bigint := 0;
BEGIN
  -- Faltas / atestados (ausências registradas por este usuário)
  SELECT count(*) INTO n FROM public.ausencias WHERE registrado_por = p_user_id;
  v := v || jsonb_build_object('ausencias_registradas', n); total := total + n;

  -- Comunicações criadas/aprovadas
  SELECT count(*) INTO n FROM public.comunicacoes WHERE criado_por = p_user_id OR aprovado_por = p_user_id;
  v := v || jsonb_build_object('comunicacoes', n); total := total + n;

  -- Homologações aprovadas
  SELECT count(*) INTO n FROM public.homologacoes WHERE aprovado_por = p_user_id;
  v := v || jsonb_build_object('homologacoes', n); total := total + n;

  -- Importações executadas
  SELECT count(*) INTO n FROM public.importacoes WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('importacoes', n); total := total + n;

  -- Alertas assumidos/atendidos
  SELECT count(*) INTO n FROM public.alertas_eventos WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('alertas_eventos', n); total := total + n;

  -- Operação assistida (alertas criados / incidentes responsáveis)
  SELECT count(*) INTO n FROM public.operacao_alertas WHERE criado_por = p_user_id;
  v := v || jsonb_build_object('operacao_alertas', n); total := total + n;

  SELECT count(*) INTO n FROM public.operacao_incidentes WHERE responsavel_id = p_user_id;
  v := v || jsonb_build_object('operacao_incidentes', n); total := total + n;

  -- Auditorias produzidas pelo próprio usuário (ações realizadas por ele)
  SELECT count(*) INTO n FROM public.audit_logs WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('auditorias', n); total := total + n;

  -- Access reviews em que participou
  SELECT count(*) INTO n FROM public.access_reviews
    WHERE criado_por = p_user_id OR responsavel_id = p_user_id OR usuario_id = p_user_id;
  v := v || jsonb_build_object('access_reviews', n); total := total + n;

  -- Visões salvas de BI
  SELECT count(*) INTO n FROM public.bi_visoes_salvas WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('bi_visoes_salvas', n); total := total + n;

  -- Notificações emitidas
  SELECT count(*) INTO n FROM public.notificacao_eventos WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('notificacao_eventos', n); total := total + n;

  -- Logins/sessions históricas (indicam que o usuário efetivamente acessou)
  SELECT count(*) INTO n FROM public.login_events WHERE user_id = p_user_id;
  v := v || jsonb_build_object('login_events', n); total := total + n;

  -- Vínculos ativos (informativos — serão removidos junto)
  SELECT count(*) INTO n FROM public.usuario_empresas WHERE user_id = p_user_id;
  v := v || jsonb_build_object('vinculos_empresas', n);

  SELECT count(*) INTO n FROM public.usuario_projetos WHERE user_id = p_user_id;
  v := v || jsonb_build_object('vinculos_projetos', n);

  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = p_user_id;
  v := v || jsonb_build_object('roles', n);

  v := v || jsonb_build_object('total_bloqueante', total);
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.contar_dependencias_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contar_dependencias_usuario(uuid) TO authenticated;
