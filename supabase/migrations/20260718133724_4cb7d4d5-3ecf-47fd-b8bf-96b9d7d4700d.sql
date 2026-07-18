
-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.session_status AS ENUM ('ATIVA','ENCERRADA','EXPIRADA','REVOGADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.login_event_tipo AS ENUM ('LOGIN','LOGOUT','TOKEN_REFRESH','FALHA_LOGIN','SESSAO_REVOGADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.login_event_resultado AS ENUM ('SUCESSO','FALHA','BLOQUEADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_review_status AS ENUM ('PENDENTE','APROVADA','REVOGADA','PRORROGADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 1. USER_SESSIONS
-- =========================================================
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  provider text,
  device text,
  browser text,
  os text,
  ip_hash text,
  user_agent_hash text,
  cidade text,
  pais text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  encerrada_em timestamptz,
  motivo_encerramento text,
  status public.session_status NOT NULL DEFAULT 'ATIVA',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_status ON public.user_sessions(status);
CREATE INDEX idx_user_sessions_last_activity ON public.user_sessions(last_activity DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions super admin all" ON public.user_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "sessions compliance read" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'compliance'));

CREATE POLICY "sessions self read" ON public.user_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "sessions self insert" ON public.user_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "sessions self update activity" ON public.user_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_user_sessions_updated_at
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_user_sessions_audit
  AFTER INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('acessos','user_sessions');

-- =========================================================
-- 2. LOGIN_EVENTS (append-only)
-- =========================================================
CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evento public.login_event_tipo NOT NULL,
  provider text,
  resultado public.login_event_resultado NOT NULL DEFAULT 'SUCESSO',
  origem text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_events_user ON public.login_events(user_id);
CREATE INDEX idx_login_events_created ON public.login_events(created_at DESC);
CREATE INDEX idx_login_events_evento ON public.login_events(evento);

GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_events super read" ON public.login_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "login_events compliance read" ON public.login_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'compliance'));

CREATE POLICY "login_events self read" ON public.login_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "login_events self insert" ON public.login_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE OR REPLACE FUNCTION public.tg_login_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'login_events é append-only. Operação % bloqueada.', TG_OP
    USING ERRCODE='insufficient_privilege';
END $$;

CREATE TRIGGER trg_login_events_no_update
  BEFORE UPDATE OR DELETE ON public.login_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_login_events_append_only();

-- =========================================================
-- 3. ACCESS_REVIEWS
-- =========================================================
CREATE TABLE public.access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario_nome text,
  papel public.app_role NOT NULL,
  status public.access_review_status NOT NULL DEFAULT 'PENDENTE',
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text,
  inicio timestamptz NOT NULL DEFAULT now(),
  prazo timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  conclusao timestamptz,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_access_reviews_user ON public.access_reviews(usuario_id);
CREATE INDEX idx_access_reviews_status ON public.access_reviews(status);
CREATE INDEX idx_access_reviews_prazo ON public.access_reviews(prazo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_reviews TO authenticated;
GRANT ALL ON public.access_reviews TO service_role;

ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews super all" ON public.access_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "reviews compliance read" ON public.access_reviews
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'compliance'));

CREATE TRIGGER trg_access_reviews_updated_at
  BEFORE UPDATE ON public.access_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_access_reviews_audit
  AFTER INSERT OR UPDATE ON public.access_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('acessos','access_reviews');

-- =========================================================
-- 4. RPCs
-- =========================================================

-- Registrar evento de login com hash de IP/UA (privacidade)
CREATE OR REPLACE FUNCTION public.registrar_login_event(
  _evento public.login_event_tipo,
  _resultado public.login_event_resultado DEFAULT 'SUCESSO',
  _provider text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _origem text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_meta jsonb;
BEGIN
  v_meta := COALESCE(_metadata,'{}'::jsonb)
    || jsonb_build_object(
      'ip_hash', CASE WHEN _ip IS NULL THEN NULL ELSE encode(digest(_ip,'sha256'),'hex') END,
      'ua_hash', CASE WHEN _user_agent IS NULL THEN NULL ELSE encode(digest(_user_agent,'sha256'),'hex') END
    );
  INSERT INTO public.login_events(user_id, evento, provider, resultado, origem, metadata)
  VALUES (auth.uid(), _evento, _provider, _resultado, _origem, v_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.registrar_login_event(public.login_event_tipo,public.login_event_resultado,text,text,text,text,jsonb) TO authenticated;

-- Revogar sessão
CREATE OR REPLACE FUNCTION public.revogar_sessao(_session_id uuid, _motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT user_id INTO v_user FROM public.user_sessions WHERE id=_session_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;

  UPDATE public.user_sessions
     SET status='REVOGADA',
         encerrada_em=now(),
         motivo_encerramento=COALESCE(_motivo,'Revogada por administrador')
   WHERE id=_session_id AND status='ATIVA';

  INSERT INTO public.login_events(user_id, evento, resultado, origem, metadata)
  VALUES (v_user, 'SESSAO_REVOGADA', 'SUCESSO', 'painel',
          jsonb_build_object('session_id', _session_id, 'motivo', _motivo));
END $$;

GRANT EXECUTE ON FUNCTION public.revogar_sessao(uuid,text) TO authenticated;

-- Dashboard KPIs
CREATE OR REPLACE FUNCTION public.acessos_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'usuarios_ativos', (SELECT count(*) FROM public.profiles WHERE ativo=true),
    'sessoes_ativas', (SELECT count(*) FROM public.user_sessions WHERE status='ATIVA'),
    'sessoes_expiradas', (SELECT count(*) FROM public.user_sessions WHERE status='EXPIRADA'),
    'sessoes_revogadas', (SELECT count(*) FROM public.user_sessions WHERE status='REVOGADA'),
    'logins_hoje', (SELECT count(*) FROM public.login_events WHERE evento='LOGIN' AND created_at::date=CURRENT_DATE),
    'falhas_24h', (SELECT count(*) FROM public.login_events WHERE resultado='FALHA' AND created_at >= now()-interval '24 hours'),
    'revisoes_pendentes', (SELECT count(*) FROM public.access_reviews WHERE status='PENDENTE'),
    'revisoes_vencidas', (SELECT count(*) FROM public.access_reviews WHERE status='PENDENTE' AND prazo < now()),
    'permissoes_revogadas', (SELECT count(*) FROM public.access_reviews WHERE status='REVOGADA'),
    'gerado_em', now()
  ) INTO v;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.acessos_dashboard() TO authenticated;

-- Gerar campanha de revisão para todos os perfis administrativos
CREATE OR REPLACE FUNCTION public.gerar_campanha_revisao(_dias_prazo int DEFAULT 90)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count int; v_resp_nome text;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT nome INTO v_resp_nome FROM public.profiles WHERE id=auth.uid();

  WITH ins AS (
    INSERT INTO public.access_reviews(usuario_id, usuario_nome, papel, responsavel_id, responsavel_nome, prazo, criado_por)
    SELECT ur.user_id, p.nome, ur.role, auth.uid(), v_resp_nome,
           now() + make_interval(days => _dias_prazo), auth.uid()
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id=ur.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.access_reviews r
      WHERE r.usuario_id=ur.user_id AND r.papel=ur.role AND r.status='PENDENTE'
    )
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.gerar_campanha_revisao(int) TO authenticated;
