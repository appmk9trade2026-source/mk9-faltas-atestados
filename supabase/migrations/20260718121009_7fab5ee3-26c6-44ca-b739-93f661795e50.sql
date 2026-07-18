
-- ============================================================================
-- Etapa 18: Modelo imutável de eventos de backup
-- ============================================================================

-- 1) Tabela de eventos (append-only)
CREATE TABLE IF NOT EXISTS public.backup_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.backup_logs(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  evento text NOT NULL CHECK (evento IN ('SOLICITADO','INICIADO','CONCLUIDO','FALHOU','CANCELADO')),
  status text NOT NULL,
  origem text NOT NULL DEFAULT 'painel',
  mensagem text,
  tamanho_bytes bigint,
  duracao_segundos integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_bee_solicitacao_created
  ON public.backup_execution_events (solicitacao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_bee_correlation
  ON public.backup_execution_events (correlation_id);
CREATE INDEX IF NOT EXISTS ix_bee_created_at
  ON public.backup_execution_events (created_at DESC);

-- 2) Grants
GRANT SELECT, INSERT ON public.backup_execution_events TO authenticated;
GRANT ALL ON public.backup_execution_events TO service_role;

-- 3) RLS
ALTER TABLE public.backup_execution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bee_select_admin_compliance"
  ON public.backup_execution_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE POLICY "bee_insert_admin"
  ON public.backup_execution_events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- 4) Trigger de imutabilidade (bloqueia UPDATE e DELETE)
CREATE OR REPLACE FUNCTION public.tg_bee_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'backup_execution_events é append-only. Operação % bloqueada.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_bee_no_update ON public.backup_execution_events;
CREATE TRIGGER trg_bee_no_update
  BEFORE UPDATE ON public.backup_execution_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_bee_immutable();

DROP TRIGGER IF EXISTS trg_bee_no_delete ON public.backup_execution_events;
CREATE TRIGGER trg_bee_no_delete
  BEFORE DELETE ON public.backup_execution_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_bee_immutable();

-- 5) Atualizar registrar_solicitacao_backup para insertar evento SOLICITADO
CREATE OR REPLACE FUNCTION public.registrar_solicitacao_backup(_observacoes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_nome text; v_corr uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id=auth.uid();

  INSERT INTO public.backup_logs(tipo,status,solicitado_por,solicitado_por_nome,inicio,observacoes,origem)
  VALUES ('MANUAL','SOLICITADO',auth.uid(),v_nome,now(),_observacoes,'painel')
  RETURNING id INTO v_id;

  v_corr := gen_random_uuid();

  INSERT INTO public.backup_execution_events(
    solicitacao_id, correlation_id, evento, status, origem,
    mensagem, metadata, created_by
  ) VALUES (
    v_id, v_corr, 'SOLICITADO', 'SOLICITADO', 'painel',
    _observacoes,
    jsonb_build_object('tipo','MANUAL','solicitante', v_nome),
    auth.uid()
  );

  PERFORM public.log_audit_event(
    'operacoes','CREATE','backup_logs',v_id,NULL,NULL,NULL,
    jsonb_build_object('tipo','MANUAL','observacoes',_observacoes,'correlation_id',v_corr),true,
    'Solicitação de backup manual','painel',NULL,NULL
  );
  RETURN v_id;
END $$;

-- 6) Atualizar operacoes_dashboard para calcular estado atual pelo evento mais recente
CREATE OR REPLACE FUNCTION public.operacoes_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb; v_last jsonb; v_metric_avg numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Estado atual = último evento (fallback para backup_logs sem eventos)
  SELECT to_jsonb(x) INTO v_last FROM (
    SELECT
      bl.id,
      bl.tipo,
      COALESCE(ev.status, bl.status)                AS status,
      COALESCE(ev.evento, bl.status)                AS ultimo_evento,
      bl.solicitado_por_nome,
      bl.inicio,
      bl.fim,
      COALESCE(ev.duracao_segundos, bl.duracao_segundos) AS duracao_segundos,
      COALESCE(ev.tamanho_bytes, bl.tamanho_bytes)       AS tamanho_bytes,
      COALESCE(ev.created_at, bl.created_at)             AS atualizado_em
    FROM public.backup_logs bl
    LEFT JOIN LATERAL (
      SELECT status, evento, duracao_segundos, tamanho_bytes, created_at
      FROM public.backup_execution_events
      WHERE solicitacao_id = bl.id
      ORDER BY created_at DESC
      LIMIT 1
    ) ev ON true
    ORDER BY bl.created_at DESC
    LIMIT 1
  ) x;

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
    'eventos_backup_total', (SELECT count(*) FROM public.backup_execution_events),
    'gerado_em', now()
  ) INTO v;
  RETURN v;
END $$;
