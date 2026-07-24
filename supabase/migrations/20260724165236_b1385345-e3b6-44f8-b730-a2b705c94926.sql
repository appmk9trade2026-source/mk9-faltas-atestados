
-- CORREÇÃO DE EXCLUSÃO DE USUÁRIO (esp. Coordenador)
-- Causa raiz: FKs para auth.users sem ON DELETE definido bloqueavam
-- deleteUser (NO ACTION). Também: profiles.coordenador_usuario_id era
-- SET NULL, desvinculando Supervisores silenciosamente.

-- 1) FKs auditoria/criador → SET NULL (preserva o registro histórico).
ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_created_by_fkey,
  ADD CONSTRAINT user_permissions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_destinatario_usuario_id_fkey,
  ADD CONSTRAINT whatsapp_outbox_destinatario_usuario_id_fkey
    FOREIGN KEY (destinatario_usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_created_by_fkey,
  ADD CONSTRAINT whatsapp_templates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_test_recipients
  DROP CONSTRAINT IF EXISTS whatsapp_test_recipients_created_by_fkey,
  ADD CONSTRAINT whatsapp_test_recipients_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_tst_destinatarios
  DROP CONSTRAINT IF EXISTS whatsapp_tst_destinatarios_confirmado_por_fkey,
  ADD CONSTRAINT whatsapp_tst_destinatarios_confirmado_por_fkey
    FOREIGN KEY (confirmado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS whatsapp_tst_destinatarios_created_by_fkey,
  ADD CONSTRAINT whatsapp_tst_destinatarios_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS whatsapp_tst_destinatarios_updated_by_fkey,
  ADD CONSTRAINT whatsapp_tst_destinatarios_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Dependência bloqueante: Supervisores vinculados ao Coordenador.
--    profiles.coordenador_usuario_id continua SET NULL como salvaguarda,
--    mas a exclusão bloqueia via contador quando há vínculos ativos.
CREATE OR REPLACE FUNCTION public.contar_dependencias_usuario(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  n bigint;
  total bigint := 0;
BEGIN
  SELECT count(*) INTO n FROM public.ausencias WHERE registrado_por = p_user_id;
  v := v || jsonb_build_object('ausencias_registradas', n); total := total + n;

  SELECT count(*) INTO n FROM public.comunicacoes WHERE criado_por = p_user_id OR aprovado_por = p_user_id;
  v := v || jsonb_build_object('comunicacoes', n); total := total + n;

  SELECT count(*) INTO n FROM public.homologacoes WHERE aprovado_por = p_user_id;
  v := v || jsonb_build_object('homologacoes', n); total := total + n;

  SELECT count(*) INTO n FROM public.importacoes WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('importacoes', n); total := total + n;

  SELECT count(*) INTO n FROM public.alertas_eventos WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('alertas_eventos', n); total := total + n;

  SELECT count(*) INTO n FROM public.operacao_alertas WHERE criado_por = p_user_id;
  v := v || jsonb_build_object('operacao_alertas', n); total := total + n;

  SELECT count(*) INTO n FROM public.operacao_incidentes WHERE responsavel_id = p_user_id;
  v := v || jsonb_build_object('operacao_incidentes', n); total := total + n;

  SELECT count(*) INTO n FROM public.audit_logs WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('auditorias', n); total := total + n;

  SELECT count(*) INTO n FROM public.access_reviews
    WHERE criado_por = p_user_id OR responsavel_id = p_user_id OR usuario_id = p_user_id;
  v := v || jsonb_build_object('access_reviews', n); total := total + n;

  SELECT count(*) INTO n FROM public.bi_visoes_salvas WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('bi_visoes_salvas', n); total := total + n;

  SELECT count(*) INTO n FROM public.notificacao_eventos WHERE usuario_id = p_user_id;
  v := v || jsonb_build_object('notificacao_eventos', n); total := total + n;

  SELECT count(*) INTO n FROM public.login_events WHERE user_id = p_user_id;
  v := v || jsonb_build_object('login_events', n); total := total + n;

  -- NOVO: Supervisores vinculados a este Coordenador (bloqueante).
  SELECT count(*) INTO n FROM public.profiles
    WHERE coordenador_usuario_id = p_user_id AND ativo IS DISTINCT FROM false;
  v := v || jsonb_build_object('supervisores_vinculados', n); total := total + n;

  -- NOVO: Colaboradores diretamente sob supervisão deste usuário (bloqueante).
  SELECT count(*) INTO n FROM public.colaboradores
    WHERE supervisor_usuario_id = p_user_id AND ativo IS DISTINCT FROM false;
  v := v || jsonb_build_object('colaboradores_supervisionados', n); total := total + n;

  -- Vínculos informativos (removidos junto)
  SELECT count(*) INTO n FROM public.usuario_empresas WHERE user_id = p_user_id;
  v := v || jsonb_build_object('vinculos_empresas', n);

  SELECT count(*) INTO n FROM public.usuario_projetos WHERE user_id = p_user_id;
  v := v || jsonb_build_object('vinculos_projetos', n);

  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = p_user_id;
  v := v || jsonb_build_object('roles', n);

  v := v || jsonb_build_object('total_bloqueante', total);
  RETURN v;
END;
$function$;
