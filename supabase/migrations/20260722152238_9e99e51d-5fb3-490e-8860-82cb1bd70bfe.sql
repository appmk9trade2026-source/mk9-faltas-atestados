
-- =========================================================================
-- Etapa 30 — Hardening de segurança do banco (linter + scanner)
-- Idempotente. Sem RLS relaxado. Sem novas permissões amplas.
-- =========================================================================

-- 1) SECURITY DEFINER VIEW (ERROR)
-- whatsapp_tst_monitor não tinha security_invoker=true → executava com
-- privilégios do dono. whatsapp_tst_saude já estava correto.
ALTER VIEW public.whatsapp_tst_monitor SET (security_invoker = true);

-- 2) FUNCTION SEARCH PATH MUTABLE
-- tg_bi_refresh_immutable era a única função do projeto sem search_path fixo.
-- Recria com SET search_path = public.
CREATE OR REPLACE FUNCTION public.tg_bi_refresh_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'bi_absenteismo_diario é imutável: use refresh_bi_absenteismo()';
END;
$fn$;

-- 3) VISUALIZADOR — alerta_visivel_para
-- Antes: retornava TRUE para qualquer alerta se o usuário fosse visualizador.
-- Agora: usa o mesmo escopo do RH (empresa/projeto vinculado, ou globais).
CREATE OR REPLACE FUNCTION public.alerta_visivel_para(_alerta public.alertas, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN TRUE;
  END IF;

  IF public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'visualizador'::app_role) THEN
    IF _alerta.empresa_id IS NULL AND _alerta.projeto_id IS NULL THEN
      RETURN TRUE;
    END IF;
    IF _alerta.empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.usuario_empresas ue
      WHERE ue.user_id = _user_id AND ue.empresa_id = _alerta.empresa_id
    ) THEN
      RETURN TRUE;
    END IF;
    IF _alerta.projeto_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.usuario_projetos up
      WHERE up.user_id = _user_id AND up.projeto_id = _alerta.projeto_id
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  IF public.has_role(_user_id, 'supervisor'::app_role) THEN
    IF _alerta.projeto_id IS NULL THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.usuario_projetos up
      WHERE up.user_id = _user_id AND up.projeto_id = _alerta.projeto_id
    );
  END IF;

  RETURN FALSE;
END;
$fn$;

-- 4) REVOGAR EXECUTE de PUBLIC/anon em funções SECURITY DEFINER
-- Triggers (não devem ser chamáveis nem por authenticated):
DO $$
DECLARE
  fn text;
  triggers text[] := ARRAY[
    'public.tg_ausencia_supervisor_escopo()',
    'public.tg_ausencias_gera_protocolo()',
    'public.tg_prevent_self_user_permission()',
    'public.tg_profiles_bloquear_ultimo_super_admin()',
    'public.tg_protect_super_admin_critical_perms()',
    'public.tg_user_roles_bloquear_ultimo_super_admin()',
    'public.tg_usuario_empresas_cascata_projetos()',
    'public.tg_usuario_projetos_valida_empresa()',
    'public.tg_wa_test_recipients_audit()',
    'public.tg_wa_tst_audit()',
    'public.tg_wa_tst_normalize_and_hash()',
    'public.tg_wa_tst_single_principal_por_empresa()',
    'public.tg_bi_refresh_immutable()'
  ];
  rpcs text[] := ARRAY[
    'public.ai_assistente_consumir_rate_limit(uuid)',
    'public.ai_assistente_saude(integer)',
    'public.alerta_visivel_para(public.alertas, uuid)',
    'public.backfill_protocolos_pendentes(integer)',
    'public.check_projeto_equivalente(uuid, text, uuid)',
    'public.consolidar_projetos(uuid, uuid, text)',
    'public.gen_projeto_codigo_protocolo(text, uuid, uuid)',
    'public.gerar_alertas_do_sistema()',
    'public.gerar_protocolo_ausencia(uuid, date)',
    'public.get_projetos_ativos_por_empresa(uuid)',
    'public.materializar_whatsapp_usuario_boas_vindas(uuid, text, text)',
    'public.preview_consolidar_projetos(uuid, uuid)',
    'public.rbac_log_deny(audit_action, text, text, uuid, uuid, uuid, text)',
    'public.report_projetos_colisoes_ativas()',
    'public.require_permission(text, text, uuid, uuid, uuid, uuid, text)',
    'public.whatsapp_enfileirar_template_teste(uuid, text, uuid, text, date, date)',
    'public.whatsapp_preview_template_teste(text, uuid, text, date, date)'
  ];
BEGIN
  FOREACH fn IN ARRAY triggers LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;

  FOREACH fn IN ARRAY rpcs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- 5) STORAGE — atestados: adicionar UPDATE e DELETE explícitos
-- Apenas super_admin/RH podem atualizar; apenas super_admin pode remover.
DROP POLICY IF EXISTS atestados_update_gestao ON storage.objects;
CREATE POLICY atestados_update_gestao ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'atestados'
    AND (public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'rh'::app_role))
  )
  WITH CHECK (
    bucket_id = 'atestados'
    AND (public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'rh'::app_role))
  );

DROP POLICY IF EXISTS atestados_delete_gestao ON storage.objects;
CREATE POLICY atestados_delete_gestao ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'atestados'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );
