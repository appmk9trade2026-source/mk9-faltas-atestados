
-- ============================================================
-- ETAPA 29B — HARDENING DE PERMISSÕES (FASE B) — retry
-- ============================================================

-- ---------- TRIGGERS ----------
REVOKE ALL ON FUNCTION public.handle_new_user()                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_audit_row()                                                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_incidente_notificar()                                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_roadmap_audit()                                            FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.handle_new_user()                                         TO service_role;
GRANT  EXECUTE ON FUNCTION public.tg_audit_row()                                            TO service_role;
GRANT  EXECUTE ON FUNCTION public.tg_incidente_notificar()                                  TO service_role;
GRANT  EXECUTE ON FUNCTION public.tg_roadmap_audit()                                        TO service_role;

-- ---------- CRON_ONLY ----------
REVOKE ALL ON FUNCTION public.cron_refresh_bi_absenteismo_tick()                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_run_escalonamentos_tick()                                FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cron_refresh_bi_absenteismo_tick()                        TO service_role;
GRANT  EXECUTE ON FUNCTION public.cron_run_escalonamentos_tick()                            TO service_role;

-- ---------- INTERNAS ----------
REVOKE ALL ON FUNCTION public._obs_can_read()                                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role)                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_user(uuid)                                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_audit_event(text, audit_action, text, uuid, uuid, uuid, jsonb, jsonb, boolean, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materializar_notificacao(notif_tipo, text, text, notif_severidade, notif_origem, uuid, text, text, uuid, app_role, text, jsonb, text, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materializar_destinatarios(uuid)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preferencia_notificacao_efetiva(uuid, notif_tipo, notif_severidade) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_admin()                                 FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._obs_can_read()                                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role)                                  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_active_user(uuid)                                      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.log_audit_event(text, audit_action, text, uuid, uuid, uuid, jsonb, jsonb, boolean, text, text, text, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.materializar_notificacao(notif_tipo, text, text, notif_severidade, notif_origem, uuid, text, text, uuid, app_role, text, jsonb, text, timestamptz, uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.materializar_destinatarios(uuid)                          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.preferencia_notificacao_efetiva(uuid, notif_tipo, notif_severidade) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.bootstrap_first_super_admin()                             TO authenticated, service_role;

-- ---------- CRON + ADMIN MANUAL ----------
REVOKE ALL ON FUNCTION public.refresh_bi_absenteismo(text)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_escalonamentos(text)                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.processar_escalonamentos_pendentes()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reprocessar_escalonamentos()                                  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refresh_bi_absenteismo(text)                              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.run_escalonamentos(text)                                  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.processar_escalonamentos_pendentes()                      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.reprocessar_escalonamentos()                              TO authenticated, service_role;

-- ---------- RPCs FRONTEND ADMIN ----------
REVOKE ALL ON FUNCTION public.acessos_dashboard()                                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analisar_conflitos_regras_escalonamento()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquivar_notificacao(uuid)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_preferencia_notificacao(notif_tipo, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.automacao_config_atualizar(integer, integer, integer, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.automacao_status()                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bi_analisar_tendencias(jsonb)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bi_detectar_variacoes_atipicas(jsonb)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bi_executivo_consultar(jsonb)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bi_healthcheck()                                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bi_recorrencia_consultar(jsonb)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contar_notificacoes_nao_lidas()                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_notificacao(notif_tipo, text, text, notif_severidade, notif_origem, uuid, text, text, uuid, app_role, text, jsonb, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cron_healthcheck()                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.database_healthcheck()                                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.database_indices_report()                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.database_performance()                                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.database_slow_queries(integer, integer)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gerar_campanha_revisao(integer)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_notificacoes_usuario(notif_status_usuario, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.listar_preferencias_notificacao()                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_notificacao_como_lida(uuid)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metricas_notificacoes()                                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notificacoes_motor_healthcheck()                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oa_dashboard(uuid)                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oa_incidente_transicionar(uuid, oa_incidente_status, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oa_periodo_encerrar(uuid, text)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oa_periodo_prorrogar(uuid, date, text)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.observabilidade_registrar_execucao(text, jsonb)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.operacoes_dashboard()                                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.operacoes_health_check()                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plataforma_health_score()                                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_login_event(login_event_tipo, login_event_resultado, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_solicitacao_backup(text)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurar_preferencias_padrao()                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revogar_sessao(uuid, text)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.roadmap_dashboard()                                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saude_sistema()                                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.simular_regras_escalonamento(jsonb)                           FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.acessos_dashboard()                                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.analisar_conflitos_regras_escalonamento()                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.arquivar_notificacao(uuid)                                TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.atualizar_preferencia_notificacao(notif_tipo, boolean, boolean) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.automacao_config_atualizar(integer, integer, integer, integer, integer, boolean) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.automacao_status()                                        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.bi_analisar_tendencias(jsonb)                             TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.bi_detectar_variacoes_atipicas(jsonb)                     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.bi_executivo_consultar(jsonb)                             TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.bi_healthcheck()                                          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.bi_recorrencia_consultar(jsonb)                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.contar_notificacoes_nao_lidas()                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.criar_notificacao(notif_tipo, text, text, notif_severidade, notif_origem, uuid, text, text, uuid, app_role, text, jsonb, text, timestamptz) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.cron_healthcheck()                                        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.database_healthcheck()                                    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.database_indices_report()                                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.database_performance()                                    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.database_slow_queries(integer, integer)                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.gerar_campanha_revisao(integer)                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.listar_notificacoes_usuario(notif_status_usuario, integer, integer) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.listar_preferencias_notificacao()                         TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.marcar_notificacao_como_lida(uuid)                        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.metricas_notificacoes()                                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.notificacoes_motor_healthcheck()                          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.oa_dashboard(uuid)                                        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.oa_incidente_transicionar(uuid, oa_incidente_status, text, text, text, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.oa_periodo_encerrar(uuid, text)                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.oa_periodo_prorrogar(uuid, date, text)                    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.observabilidade_registrar_execucao(text, jsonb)           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.operacoes_dashboard()                                     TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.operacoes_health_check()                                  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.plataforma_health_score()                                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.registrar_login_event(login_event_tipo, login_event_resultado, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.registrar_solicitacao_backup(text)                        TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.restaurar_preferencias_padrao()                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.revogar_sessao(uuid, text)                                TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.roadmap_dashboard()                                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.saude_sistema()                                           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.simular_regras_escalonamento(jsonb)                       TO authenticated, service_role;

-- ============================================================
-- Inventário V2
-- ============================================================
DROP FUNCTION IF EXISTS public.security_functions_inventory();

CREATE OR REPLACE FUNCTION public.security_functions_inventory()
RETURNS TABLE (
  schema_name text,
  function_name text,
  signature text,
  security_definer boolean,
  search_path_configurado boolean,
  search_path_valor text,
  execute_public boolean,
  execute_anon boolean,
  execute_authenticated boolean,
  execute_service_role boolean,
  owner_name text,
  volatility text,
  status text,
  grant_status text,
  expected_roles text,
  risk_level text,
  categoria text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS signature,
      p.prosecdef AS security_definer,
      EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%') AS search_path_configurado,
      (SELECT split_part(c,'=',2) FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%' LIMIT 1) AS search_path_valor,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              WHERE a.grantee = 0 AND a.privilege_type='EXECUTE') AS execute_public,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname='anon') AND a.privilege_type='EXECUTE') AS execute_anon_direct,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS execute_authenticated_raw,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS execute_service_role_raw,
      pg_get_userbyid(p.proowner) AS owner_name,
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  ),
  scored AS (
    SELECT b.*,
      (b.execute_anon_direct OR b.execute_public) AS execute_anon,
      CASE
        WHEN b.execute_public THEN 'PUBLIC_EXECUTE'
        WHEN b.execute_anon_direct THEN 'ANON_EXECUTE'
        WHEN NOT b.search_path_configurado THEN 'SEARCH_PATH_AUSENTE'
        ELSE 'OK'
      END AS status,
      CASE
        WHEN b.function_name LIKE 'tg\_%' OR b.function_name='handle_new_user' THEN 'TRIGGER'
        WHEN b.function_name LIKE 'cron\_%\_tick' THEN 'CRON_ONLY'
        WHEN b.function_name IN ('refresh_bi_absenteismo','run_escalonamentos','processar_escalonamentos_pendentes','reprocessar_escalonamentos') THEN 'ADMIN+CRON'
        WHEN b.function_name IN ('has_role','is_active_user','_obs_can_read','log_audit_event','materializar_notificacao','materializar_destinatarios','preferencia_notificacao_efetiva','bootstrap_first_super_admin') THEN 'INTERNAL'
        ELSE 'ADMIN_RPC'
      END AS categoria
    FROM base b
  )
  SELECT
    schema_name, function_name, signature, security_definer,
    search_path_configurado, search_path_valor, execute_public, execute_anon,
    execute_authenticated_raw, execute_service_role_raw, owner_name, volatility, status,
    CASE
      WHEN execute_public THEN 'EXPOSTO_PUBLIC'
      WHEN execute_anon THEN 'EXPOSTO_ANON'
      WHEN categoria='CRON_ONLY' AND NOT execute_authenticated_raw THEN 'CRON_ONLY'
      WHEN categoria='TRIGGER' AND NOT execute_authenticated_raw AND NOT execute_anon THEN 'TRIGGER_OK'
      WHEN execute_authenticated_raw AND execute_service_role_raw THEN 'AUTH_SERVICE'
      WHEN execute_service_role_raw AND NOT execute_authenticated_raw THEN 'SERVICE_ROLE'
      ELSE 'REVISAR'
    END AS grant_status,
    CASE categoria
      WHEN 'TRIGGER'    THEN 'service_role'
      WHEN 'CRON_ONLY'  THEN 'service_role'
      WHEN 'INTERNAL'   THEN 'authenticated, service_role'
      WHEN 'ADMIN+CRON' THEN 'authenticated, service_role'
      ELSE 'authenticated, service_role'
    END AS expected_roles,
    CASE
      WHEN execute_public OR execute_anon THEN 'ALTO'
      WHEN categoria='INTERNAL' AND execute_authenticated_raw THEN 'MEDIO'
      ELSE 'BAIXO'
    END AS risk_level,
    categoria
  FROM scored
  ORDER BY function_name;
$$;

REVOKE ALL    ON FUNCTION public.security_functions_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_functions_inventory() TO authenticated, service_role;

INSERT INTO public.audit_logs (modulo, acao, entidade, sucesso, observacoes, origem, empresa_id, projeto_id, antes, depois)
VALUES ('SEGURANCA','CREATE','permissoes_execute', true,
        'Etapa 29B — Hardening de permissões: REVOKE de anon/public em 57 funções SECURITY DEFINER + GRANT mínimo.',
        'MIGRATION', NULL, NULL, NULL,
        jsonb_build_object('etapa','29B','funcoes_alteradas',57));
