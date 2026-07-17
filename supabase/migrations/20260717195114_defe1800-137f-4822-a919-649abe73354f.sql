
-- ============ BACKUP LOGS ============
CREATE TABLE public.backup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('MANUAL','AUTOMATICO')),
  status text NOT NULL DEFAULT 'SOLICITADO' CHECK (status IN ('SOLICITADO','EM_ANDAMENTO','SUCESSO','FALHA','CANCELADO')),
  solicitado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  solicitado_por_nome text,
  inicio timestamptz NOT NULL DEFAULT now(),
  fim timestamptz,
  duracao_segundos integer,
  origem text DEFAULT 'painel',
  tamanho_bytes bigint,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.backup_logs TO authenticated;
GRANT ALL ON public.backup_logs TO service_role;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_logs select admin/compliance"
ON public.backup_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE POLICY "backup_logs insert super admin"
ON public.backup_logs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Bloqueia UPDATE/DELETE via trigger para preservar histórico
CREATE OR REPLACE FUNCTION public.tg_backup_logs_no_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'backup_logs é imutável.' USING ERRCODE='check_violation';
END $$;
CREATE TRIGGER trg_backup_logs_no_update BEFORE UPDATE ON public.backup_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_backup_logs_no_change();
CREATE TRIGGER trg_backup_logs_no_delete BEFORE DELETE ON public.backup_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_backup_logs_no_change();

CREATE INDEX idx_backup_logs_created ON public.backup_logs(created_at DESC);

-- ============ ALERTAS OPERACIONAIS ============
CREATE TABLE public.operacao_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('CONEXAO','RPC','STORAGE','TEMPO_ELEVADO','ERRO_INESPERADO','OUTRO')),
  severidade text NOT NULL DEFAULT 'MEDIA' CHECK (severidade IN ('BAIXA','MEDIA','ALTA','CRITICA')),
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','RESOLVIDO','IGNORADO')),
  titulo text NOT NULL,
  mensagem text,
  origem text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.operacao_alertas TO authenticated;
GRANT ALL ON public.operacao_alertas TO service_role;
ALTER TABLE public.operacao_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas select admin/compliance"
ON public.operacao_alertas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE POLICY "alertas insert admin"
ON public.operacao_alertas FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "alertas update admin"
ON public.operacao_alertas FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_alertas_updated BEFORE UPDATE ON public.operacao_alertas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_alertas_status ON public.operacao_alertas(status, created_at DESC);

-- ============ MÉTRICAS ============
CREATE TABLE public.operacao_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  tempo_ms integer NOT NULL,
  sucesso boolean NOT NULL DEFAULT true,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.operacao_metricas TO authenticated;
GRANT ALL ON public.operacao_metricas TO service_role;
ALTER TABLE public.operacao_metricas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metricas select admin/compliance"
ON public.operacao_metricas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE POLICY "metricas insert admin"
ON public.operacao_metricas FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE INDEX idx_metricas_created ON public.operacao_metricas(created_at DESC);

-- ============ RPC: DASHBOARD ============
CREATE OR REPLACE FUNCTION public.operacoes_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb; v_last jsonb; v_metric_avg numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT to_jsonb(b) INTO v_last FROM (
    SELECT id, tipo, status, solicitado_por_nome, inicio, fim, duracao_segundos, tamanho_bytes
    FROM public.backup_logs ORDER BY created_at DESC LIMIT 1
  ) b;

  SELECT AVG(tempo_ms) INTO v_metric_avg FROM public.operacao_metricas
   WHERE created_at >= now() - interval '24 hours';

  SELECT jsonb_build_object(
    'sistema_status','ONLINE',
    'banco_status','ONLINE',
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'db_size_bytes', pg_database_size(current_database()),
    'usuarios', (SELECT count(*) FROM public.profiles),
    'usuarios_ativos', (SELECT count(*) FROM public.profiles WHERE ativo=true),
    'colaboradores', (SELECT count(*) FROM public.colaboradores WHERE ativo=true),
    'ausencias', (SELECT count(*) FROM public.ausencias),
    'ausencias_pendentes',(SELECT count(*) FROM public.ausencias WHERE status='PENDENTE'),
    'comunicacoes', (SELECT count(*) FROM public.comunicacoes),
    'auditorias_24h',(SELECT count(*) FROM public.audit_logs WHERE created_at >= now() - interval '24 hours'),
    'auditorias_total',(SELECT count(*) FROM public.audit_logs),
    'ultimo_backup', v_last,
    'alertas_ativos', (SELECT count(*) FROM public.operacao_alertas WHERE status='ATIVO'),
    'alertas_resolvidos', (SELECT count(*) FROM public.operacao_alertas WHERE status='RESOLVIDO'),
    'alertas_ignorados', (SELECT count(*) FROM public.operacao_alertas WHERE status='IGNORADO'),
    'tempo_medio_ms_24h', COALESCE(round(v_metric_avg,1),0),
    'gerado_em', now()
  ) INTO v;
  RETURN v;
END $$;

-- ============ RPC: HEALTH CHECK ============
CREATE OR REPLACE FUNCTION public.operacoes_health_check()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
  v_rls int; v_triggers int; v_policies int; v_views int; v_mviews int; v_tables int;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_tables FROM pg_tables WHERE schemaname='public';
  SELECT count(*) INTO v_rls FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname='public';
  SELECT count(*) INTO v_triggers FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal;
  SELECT count(*) INTO v_views FROM pg_views WHERE schemaname='public';
  SELECT count(*) INTO v_mviews FROM pg_matviews WHERE schemaname='public';

  v := jsonb_build_object(
    'checks', jsonb_build_array(
      jsonb_build_object('nome','Conexão Supabase','status','OK','detalhe','psql conectado'),
      jsonb_build_object('nome','Banco','status','OK','detalhe',(SELECT version())),
      jsonb_build_object('nome','Auth','status','OK','detalhe',(SELECT count(*)::text||' usuários' FROM auth.users)),
      jsonb_build_object('nome','RPC dashboard_metrics','status',
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='dashboard_metrics') THEN 'OK' ELSE 'ERRO' END,''),
      jsonb_build_object('nome','RPC saude_sistema','status',
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='saude_sistema') THEN 'OK' ELSE 'ERRO' END,''),
      jsonb_build_object('nome','Storage','status',
        CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='storage') THEN 'OK' ELSE 'ERRO' END,''),
      jsonb_build_object('nome','Políticas RLS','status',
        CASE WHEN v_rls=v_tables THEN 'OK' ELSE 'ATENCAO' END,
        v_rls||'/'||v_tables||' tabelas com RLS · '||v_policies||' policies'),
      jsonb_build_object('nome','Triggers','status','OK','detalhe',v_triggers::text||' triggers'),
      jsonb_build_object('nome','Views','status','OK','detalhe',v_views::text||' views'),
      jsonb_build_object('nome','Materialized Views','status','OK','detalhe',v_mviews::text||' mviews')
    ),
    'resumo', jsonb_build_object(
      'tabelas', v_tables,'rls', v_rls,'policies', v_policies,
      'triggers', v_triggers,'views', v_views,'mviews', v_mviews
    ),
    'gerado_em', now()
  );
  RETURN v;
END $$;

-- ============ RPC: REGISTRAR SOLICITAÇÃO DE BACKUP ============
CREATE OR REPLACE FUNCTION public.registrar_solicitacao_backup(_observacoes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_nome text;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id=auth.uid();

  INSERT INTO public.backup_logs(tipo,status,solicitado_por,solicitado_por_nome,inicio,observacoes,origem)
  VALUES ('MANUAL','SOLICITADO',auth.uid(),v_nome,now(),_observacoes,'painel')
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    'operacoes','CREATE','backup_logs',v_id,NULL,NULL,NULL,
    jsonb_build_object('tipo','MANUAL','observacoes',_observacoes),true,
    'Solicitação de backup manual','painel',NULL,NULL
  );
  RETURN v_id;
END $$;
