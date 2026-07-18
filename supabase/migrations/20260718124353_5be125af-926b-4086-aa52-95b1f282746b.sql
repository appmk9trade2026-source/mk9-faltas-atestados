
-- ============ ENUMS ============
CREATE TYPE public.notif_tipo AS ENUM (
  'INCIDENTE_CRIADO','INCIDENTE_ATRIBUIDO','INCIDENTE_RECLASSIFICADO',
  'INCIDENTE_CRITICO','INCIDENTE_P1','SLA_PROXIMO','SLA_VENCIDO',
  'VALIDACAO_PENDENTE','INCIDENTE_RESOLVIDO','INCIDENTE_REABERTO',
  'PERIODO_PROXIMO_DO_FIM','PERIODO_PRORROGADO','ALERTA_OPERACIONAL',
  'DEPLOY_COM_INCIDENTE','BACKUP_FALHOU','SISTEMA'
);

CREATE TYPE public.notif_severidade AS ENUM ('INFO','ATENCAO','ALTA','CRITICA');

CREATE TYPE public.notif_origem AS ENUM (
  'OPERACAO_ASSISTIDA','OPERACOES','DEPLOY','BACKUP','HEALTH_CHECK','SISTEMA'
);

CREATE TYPE public.notif_status_usuario AS ENUM ('NAO_LIDA','LIDA','ARQUIVADA');

CREATE TYPE public.notif_evento AS ENUM (
  'CRIADA','ENTREGUE','VISUALIZADA','MARCADA_COMO_LIDA','ARQUIVADA',
  'REENVIADA_INTERNAMENTE','ESCALADA','EXPIRADA'
);

-- ============ NOTIFICACOES ============
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.notif_tipo NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  severidade public.notif_severidade NOT NULL DEFAULT 'INFO',
  origem public.notif_origem NOT NULL DEFAULT 'SISTEMA',
  origem_id uuid,
  modulo text,
  rota_destino text,
  destinatario_usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destinatario_papel public.app_role,
  ambiente text NOT NULL DEFAULT 'producao',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  expira_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT notif_destino_check CHECK (destinatario_usuario_id IS NOT NULL OR destinatario_papel IS NOT NULL)
);

CREATE INDEX idx_notif_origem ON public.notificacoes(origem, origem_id);
CREATE INDEX idx_notif_created ON public.notificacoes(created_at DESC);
CREATE INDEX idx_notif_dest_user ON public.notificacoes(destinatario_usuario_id);
CREATE INDEX idx_notif_dest_papel ON public.notificacoes(destinatario_papel);

GRANT SELECT ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_read_own_or_role" ON public.notificacoes FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin')
  OR destinatario_usuario_id = auth.uid()
  OR (destinatario_papel IS NOT NULL AND public.has_role(auth.uid(), destinatario_papel))
);

-- Bloqueia DELETE via trigger
CREATE OR REPLACE FUNCTION public.tg_notif_no_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Notificações não podem ser excluídas.' USING ERRCODE='check_violation'; END $$;
CREATE TRIGGER tg_notif_no_delete BEFORE DELETE ON public.notificacoes FOR EACH ROW EXECUTE FUNCTION public.tg_notif_no_delete();

-- ============ NOTIFICACAO_USUARIOS ============
CREATE TABLE public.notificacao_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.notif_status_usuario NOT NULL DEFAULT 'NAO_LIDA',
  lida_em timestamptz,
  arquivada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notificacao_id, usuario_id)
);
CREATE INDEX idx_notif_user_user ON public.notificacao_usuarios(usuario_id, status);

GRANT SELECT, INSERT, UPDATE ON public.notificacao_usuarios TO authenticated;
GRANT ALL ON public.notificacao_usuarios TO service_role;
ALTER TABLE public.notificacao_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_user_own_select" ON public.notificacao_usuarios FOR SELECT TO authenticated
USING (usuario_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "notif_user_own_update" ON public.notificacao_usuarios FOR UPDATE TO authenticated
USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "notif_user_own_insert" ON public.notificacao_usuarios FOR INSERT TO authenticated
WITH CHECK (usuario_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.tg_notif_user_no_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Estado de notificação não pode ser excluído.' USING ERRCODE='check_violation'; END $$;
CREATE TRIGGER tg_notif_user_no_delete BEFORE DELETE ON public.notificacao_usuarios FOR EACH ROW EXECUTE FUNCTION public.tg_notif_user_no_delete();

-- ============ NOTIFICACAO_EVENTOS (append-only) ============
CREATE TABLE public.notificacao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id uuid NOT NULL REFERENCES public.notificacoes(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evento public.notif_evento NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_ev_notif ON public.notificacao_eventos(notificacao_id, created_at DESC);

GRANT SELECT, INSERT ON public.notificacao_eventos TO authenticated;
GRANT ALL ON public.notificacao_eventos TO service_role;
ALTER TABLE public.notificacao_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_ev_read" ON public.notificacao_eventos FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin')
  OR usuario_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.notificacoes n WHERE n.id = notificacao_id AND (
    n.destinatario_usuario_id = auth.uid()
    OR (n.destinatario_papel IS NOT NULL AND public.has_role(auth.uid(), n.destinatario_papel))
  ))
);
CREATE POLICY "notif_ev_insert" ON public.notificacao_eventos FOR INSERT TO authenticated
WITH CHECK (usuario_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.tg_notif_ev_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'notificacao_eventos é append-only. Operação % bloqueada.', TG_OP USING ERRCODE='insufficient_privilege'; END $$;
CREATE TRIGGER tg_notif_ev_no_update BEFORE UPDATE ON public.notificacao_eventos FOR EACH ROW EXECUTE FUNCTION public.tg_notif_ev_immutable();
CREATE TRIGGER tg_notif_ev_no_delete BEFORE DELETE ON public.notificacao_eventos FOR EACH ROW EXECUTE FUNCTION public.tg_notif_ev_immutable();

-- ============ REGRAS_ESCALONAMENTO ============
CREATE TABLE public.regras_escalonamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  origem public.notif_origem NOT NULL DEFAULT 'OPERACAO_ASSISTIDA',
  tipo_evento public.notif_tipo NOT NULL,
  severidade_minima public.notif_severidade NOT NULL DEFAULT 'INFO',
  prioridade int NOT NULL DEFAULT 100,
  minutos_para_primeiro_alerta int NOT NULL DEFAULT 0,
  minutos_para_escalonamento int,
  papel_destino_inicial public.app_role,
  papel_destino_escalado public.app_role,
  repetir_alerta boolean NOT NULL DEFAULT false,
  intervalo_repeticao_minutos int,
  maximo_repeticoes int,
  ambiente text NOT NULL DEFAULT 'producao',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.regras_escalonamento TO authenticated;
GRANT INSERT, UPDATE ON public.regras_escalonamento TO authenticated;
GRANT ALL ON public.regras_escalonamento TO service_role;
ALTER TABLE public.regras_escalonamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regras_read" ON public.regras_escalonamento FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "regras_write_admin" ON public.regras_escalonamento FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "regras_update_admin" ON public.regras_escalonamento FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER tg_regras_updated_at BEFORE UPDATE ON public.regras_escalonamento FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PREFERENCIAS_NOTIFICACAO ============
CREATE TABLE public.preferencias_notificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo public.notif_tipo NOT NULL,
  habilitada boolean NOT NULL DEFAULT true,
  silenciar_info boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, tipo)
);

GRANT SELECT, INSERT, UPDATE ON public.preferencias_notificacao TO authenticated;
GRANT ALL ON public.preferencias_notificacao TO service_role;
ALTER TABLE public.preferencias_notificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pref_own" ON public.preferencias_notificacao FOR ALL TO authenticated
USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- Alertas críticos não podem ser desativados
CREATE OR REPLACE FUNCTION public.tg_pref_bloqueia_critico() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.tipo IN ('INCIDENTE_CRITICO','INCIDENTE_P1','SLA_VENCIDO','BACKUP_FALHOU','ALERTA_OPERACIONAL') AND NEW.habilitada = false THEN
    RAISE EXCEPTION 'Alertas críticos não podem ser desativados.' USING ERRCODE='check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER tg_pref_bloqueia_critico BEFORE INSERT OR UPDATE ON public.preferencias_notificacao FOR EACH ROW EXECUTE FUNCTION public.tg_pref_bloqueia_critico();

-- ============ ESCALONAMENTO_EXECUCOES ============
CREATE TABLE public.escalonamento_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  status text NOT NULL DEFAULT 'EM_ANDAMENTO',
  processados int NOT NULL DEFAULT 0,
  notificacoes_geradas int NOT NULL DEFAULT 0,
  erro text,
  origem text NOT NULL DEFAULT 'manual',
  executado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.escalonamento_execucoes TO authenticated;
GRANT ALL ON public.escalonamento_execucoes TO service_role;
ALTER TABLE public.escalonamento_execucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esc_exec_read" ON public.escalonamento_execucoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

-- ============ FUNÇÕES ============

-- Cria notificação (SECURITY DEFINER); somente super_admin OU chamada interna via idempotency que triggers usam
CREATE OR REPLACE FUNCTION public.criar_notificacao(
  _tipo public.notif_tipo,
  _titulo text,
  _mensagem text,
  _severidade public.notif_severidade DEFAULT 'INFO',
  _origem public.notif_origem DEFAULT 'SISTEMA',
  _origem_id uuid DEFAULT NULL,
  _modulo text DEFAULT NULL,
  _rota_destino text DEFAULT NULL,
  _destinatario_usuario_id uuid DEFAULT NULL,
  _destinatario_papel public.app_role DEFAULT NULL,
  _ambiente text DEFAULT 'producao',
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL,
  _expira_em timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_existing uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Somente Super Admin pode criar notificações diretamente.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _destinatario_usuario_id IS NULL AND _destinatario_papel IS NULL THEN
    RAISE EXCEPTION 'Destinatário obrigatório.' USING ERRCODE='check_violation';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.notificacoes WHERE idempotency_key = _idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  INSERT INTO public.notificacoes (
    tipo, titulo, mensagem, severidade, origem, origem_id, modulo, rota_destino,
    destinatario_usuario_id, destinatario_papel, ambiente, metadata, idempotency_key, expira_em, created_by
  ) VALUES (
    _tipo, _titulo, _mensagem, _severidade, _origem, _origem_id, _modulo, _rota_destino,
    _destinatario_usuario_id, _destinatario_papel, _ambiente, _metadata, _idempotency_key, _expira_em, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.notificacao_eventos(notificacao_id, evento, metadata, created_by)
  VALUES (v_id, 'CRIADA', jsonb_build_object('tipo',_tipo,'severidade',_severidade), auth.uid());

  RETURN v_id;
END $$;

-- Materializa destinatários por papel (cria estados NAO_LIDA para usuários que atualmente têm o papel)
CREATE OR REPLACE FUNCTION public.materializar_destinatarios(_notificacao_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_n public.notificacoes; v_cnt int := 0;
BEGIN
  SELECT * INTO v_n FROM public.notificacoes WHERE id = _notificacao_id;
  IF v_n.id IS NULL THEN RETURN 0; END IF;

  IF v_n.destinatario_usuario_id IS NOT NULL THEN
    INSERT INTO public.notificacao_usuarios(notificacao_id, usuario_id)
    VALUES (v_n.id, v_n.destinatario_usuario_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
  ELSIF v_n.destinatario_papel IS NOT NULL THEN
    INSERT INTO public.notificacao_usuarios(notificacao_id, usuario_id)
    SELECT v_n.id, ur.user_id FROM public.user_roles ur WHERE ur.role = v_n.destinatario_papel
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
  END IF;
  RETURN v_cnt;
END $$;

CREATE OR REPLACE FUNCTION public.marcar_notificacao_como_lida(_notificacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.notificacao_usuarios(notificacao_id, usuario_id, status, lida_em)
  VALUES (_notificacao_id, auth.uid(), 'LIDA', now())
  ON CONFLICT (notificacao_id, usuario_id) DO UPDATE
    SET status='LIDA', lida_em = COALESCE(public.notificacao_usuarios.lida_em, now());

  INSERT INTO public.notificacao_eventos(notificacao_id, usuario_id, evento, created_by)
  VALUES (_notificacao_id, auth.uid(), 'MARCADA_COMO_LIDA', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.arquivar_notificacao(_notificacao_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.notificacao_usuarios(notificacao_id, usuario_id, status, arquivada_em)
  VALUES (_notificacao_id, auth.uid(), 'ARQUIVADA', now())
  ON CONFLICT (notificacao_id, usuario_id) DO UPDATE
    SET status='ARQUIVADA', arquivada_em = COALESCE(public.notificacao_usuarios.arquivada_em, now());

  INSERT INTO public.notificacao_eventos(notificacao_id, usuario_id, evento, created_by)
  VALUES (_notificacao_id, auth.uid(), 'ARQUIVADA', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.listar_notificacoes_usuario(
  _status public.notif_status_usuario DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE(
  id uuid, tipo public.notif_tipo, titulo text, mensagem text, severidade public.notif_severidade,
  origem public.notif_origem, origem_id uuid, modulo text, rota_destino text,
  metadata jsonb, created_at timestamptz, status public.notif_status_usuario, lida_em timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT n.id, n.tipo, n.titulo, n.mensagem, n.severidade, n.origem, n.origem_id,
         n.modulo, n.rota_destino, n.metadata, n.created_at,
         COALESCE(nu.status, 'NAO_LIDA'::public.notif_status_usuario) AS status,
         nu.lida_em
  FROM public.notificacoes n
  LEFT JOIN public.notificacao_usuarios nu
    ON nu.notificacao_id = n.id AND nu.usuario_id = auth.uid()
  WHERE (
    n.destinatario_usuario_id = auth.uid()
    OR (n.destinatario_papel IS NOT NULL AND public.has_role(auth.uid(), n.destinatario_papel))
  )
  AND (_status IS NULL OR COALESCE(nu.status,'NAO_LIDA') = _status)
  AND (n.expira_em IS NULL OR n.expira_em > now())
  ORDER BY n.created_at DESC
  LIMIT _limit OFFSET _offset
$$;

CREATE OR REPLACE FUNCTION public.contar_notificacoes_nao_lidas()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COUNT(*)::int FROM public.notificacoes n
  LEFT JOIN public.notificacao_usuarios nu
    ON nu.notificacao_id = n.id AND nu.usuario_id = auth.uid()
  WHERE (
    n.destinatario_usuario_id = auth.uid()
    OR (n.destinatario_papel IS NOT NULL AND public.has_role(auth.uid(), n.destinatario_papel))
  )
  AND COALESCE(nu.status,'NAO_LIDA') = 'NAO_LIDA'
  AND (n.expira_em IS NULL OR n.expira_em > now())
$$;

-- Motor de escalonamento (execução manual). Varre incidentes/SLA e gera notificações idempotentes.
CREATE OR REPLACE FUNCTION public.processar_escalonamentos_pendentes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_exec_id uuid;
  v_gerado int := 0;
  v_proc int := 0;
  v_inc record;
  v_key text;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  INSERT INTO public.escalonamento_execucoes(status, executado_por, origem)
  VALUES ('EM_ANDAMENTO', auth.uid(), 'manual') RETURNING id INTO v_exec_id;

  -- P1 sem responsável
  FOR v_inc IN
    SELECT id, codigo, titulo FROM public.operacao_incidentes
    WHERE prioridade='P1' AND responsavel_id IS NULL AND status NOT IN ('ENCERRADO','CANCELADO','RESOLVIDO')
  LOOP
    v_proc := v_proc + 1;
    v_key := 'INCIDENTE_P1_SEM_RESP:'||v_inc.id::text;
    IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,modulo,rota_destino,destinatario_papel,idempotency_key,metadata)
      VALUES ('INCIDENTE_P1', 'Incidente P1 sem responsável: '||v_inc.codigo,
              COALESCE(v_inc.titulo,'Incidente P1 aguardando atribuição.'),
              'CRITICA','OPERACAO_ASSISTIDA', v_inc.id,'operacao-assistida','/operacao-assistida',
              'super_admin', v_key, jsonb_build_object('codigo',v_inc.codigo));
      v_gerado := v_gerado + 1;
    END IF;
  END LOOP;

  -- Incidente CRÍTICO aberto
  FOR v_inc IN
    SELECT id, codigo, titulo FROM public.operacao_incidentes
    WHERE severidade='CRITICA' AND status NOT IN ('RESOLVIDO','ENCERRADO','CANCELADO')
  LOOP
    v_proc := v_proc + 1;
    v_key := 'INCIDENTE_CRITICO:'||v_inc.id::text;
    IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
      VALUES ('INCIDENTE_CRITICO','Incidente CRÍTICO em aberto: '||v_inc.codigo,
              COALESCE(v_inc.titulo,'Requer ação imediata.'),
              'CRITICA','OPERACAO_ASSISTIDA', v_inc.id,'/operacao-assistida',
              'super_admin', v_key, jsonb_build_object('codigo',v_inc.codigo));
      v_gerado := v_gerado + 1;
    END IF;
  END LOOP;

  -- SLA vencido
  FOR v_inc IN
    SELECT id, codigo, titulo, prazo_resolucao FROM public.operacao_incidentes
    WHERE prazo_resolucao IS NOT NULL AND prazo_resolucao < now()
      AND status NOT IN ('RESOLVIDO','ENCERRADO','CANCELADO')
  LOOP
    v_proc := v_proc + 1;
    v_key := 'SLA_VENCIDO:'||v_inc.id::text;
    IF NOT EXISTS (SELECT 1 FROM public.notificacoes WHERE idempotency_key = v_key) THEN
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
      VALUES ('SLA_VENCIDO','SLA vencido: '||v_inc.codigo,
              'Prazo de resolução ultrapassado.',
              'ALTA','OPERACAO_ASSISTIDA', v_inc.id,'/operacao-assistida',
              'super_admin', v_key, jsonb_build_object('codigo',v_inc.codigo,'prazo',v_inc.prazo_resolucao));
      v_gerado := v_gerado + 1;
    END IF;
  END LOOP;

  UPDATE public.escalonamento_execucoes
  SET status='CONCLUIDO', finalizado_em=now(), processados=v_proc, notificacoes_geradas=v_gerado
  WHERE id = v_exec_id;

  PERFORM public.log_audit_event('notificacoes','EXECUTE','escalonamento',v_exec_id,NULL,NULL,NULL,
    jsonb_build_object('processados',v_proc,'gerados',v_gerado),true,'Execução manual de escalonamento','painel',NULL,NULL);

  RETURN jsonb_build_object('execucao_id',v_exec_id,'processados',v_proc,'gerados',v_gerado);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.escalonamento_execucoes SET status='ERRO', finalizado_em=now(), erro=SQLERRM WHERE id = v_exec_id;
  RAISE;
END $$;

-- Trigger: notificações a partir do módulo de incidentes
CREATE OR REPLACE FUNCTION public.tg_incidente_notificar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_key := 'INCIDENTE_CRIADO:'||NEW.id::text;
    INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
    VALUES ('INCIDENTE_CRIADO','Novo incidente: '||NEW.codigo, COALESCE(NEW.titulo,''),
      CASE NEW.severidade::text WHEN 'CRITICA' THEN 'CRITICA'::public.notif_severidade
                                 WHEN 'ALTA' THEN 'ALTA'::public.notif_severidade
                                 WHEN 'MEDIA' THEN 'ATENCAO'::public.notif_severidade
                                 ELSE 'INFO'::public.notif_severidade END,
      'OPERACAO_ASSISTIDA', NEW.id, '/operacao-assistida', 'super_admin', v_key,
      jsonb_build_object('codigo',NEW.codigo,'prioridade',NEW.prioridade,'severidade',NEW.severidade))
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF NEW.prioridade = 'P1' THEN
      v_key := 'INCIDENTE_P1_NOVO:'||NEW.id::text;
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
      VALUES ('INCIDENTE_P1','P1 criado: '||NEW.codigo, COALESCE(NEW.titulo,''),'CRITICA','OPERACAO_ASSISTIDA',NEW.id,'/operacao-assistida','super_admin', v_key,
              jsonb_build_object('codigo',NEW.codigo))
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id AND NEW.responsavel_id IS NOT NULL THEN
      v_key := 'INCIDENTE_ATRIB:'||NEW.id::text||':'||NEW.responsavel_id::text;
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_usuario_id,idempotency_key,metadata)
      VALUES ('INCIDENTE_ATRIBUIDO','Incidente atribuído: '||NEW.codigo,'Você foi designado como responsável.','ATENCAO','OPERACAO_ASSISTIDA',NEW.id,'/operacao-assistida',NEW.responsavel_id, v_key,
              jsonb_build_object('codigo',NEW.codigo))
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    IF NEW.status = 'RESOLVIDO' AND OLD.status <> 'RESOLVIDO' THEN
      v_key := 'INCIDENTE_RESOLVIDO:'||NEW.id::text;
      INSERT INTO public.notificacoes(tipo,titulo,mensagem,severidade,origem,origem_id,rota_destino,destinatario_papel,idempotency_key,metadata)
      VALUES ('INCIDENTE_RESOLVIDO','Incidente resolvido: '||NEW.codigo,'Aguardando validação/encerramento.','INFO','OPERACAO_ASSISTIDA',NEW.id,'/operacao-assistida','compliance', v_key,
              jsonb_build_object('codigo',NEW.codigo))
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_incidente_notificar
AFTER INSERT OR UPDATE ON public.operacao_incidentes
FOR EACH ROW EXECUTE FUNCTION public.tg_incidente_notificar();

-- ============ SEEDS: regras iniciais ============
INSERT INTO public.regras_escalonamento (nome, descricao, tipo_evento, severidade_minima, minutos_para_primeiro_alerta, minutos_para_escalonamento, papel_destino_inicial, papel_destino_escalado, repetir_alerta, intervalo_repeticao_minutos, maximo_repeticoes)
VALUES
 ('P1 sem responsável','Alerta imediato para Super Admin; escalona para Compliance após 30min.','INCIDENTE_P1','CRITICA',0,30,'super_admin','compliance',true,15,4),
 ('Incidente crítico aberto','Alerta imediato e repetido a cada 30min enquanto aberto.','INCIDENTE_CRITICO','CRITICA',0,NULL,'super_admin',NULL,true,30,6),
 ('SLA próximo do vencimento','Alerta ao atingir 75% do prazo; escala para Super Admin em 90%.','SLA_PROXIMO','ATENCAO',0,NULL,'super_admin','super_admin',false,NULL,NULL),
 ('SLA vencido','Alerta responsável e Super Admin; Compliance recebe se ALTA/CRÍTICA.','SLA_VENCIDO','ALTA',0,NULL,'super_admin','compliance',false,NULL,NULL),
 ('Validação pendente','Alerta ao responsável pela validação com repetição única após o prazo.','VALIDACAO_PENDENTE','ATENCAO',0,NULL,'compliance',NULL,true,60,1),
 ('Backup falhou','Notificação CRÍTICA ao Super Admin; Compliance em leitura.','BACKUP_FALHOU','CRITICA',0,NULL,'super_admin','compliance',false,NULL,NULL);
