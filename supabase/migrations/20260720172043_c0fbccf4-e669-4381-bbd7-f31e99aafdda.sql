
-- =============== AI Conversations ===============
CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX ai_conversations_user_idx ON public.ai_conversations(user_id, updated_at DESC);
CREATE INDEX ai_conversations_active_idx ON public.ai_conversations(user_id) WHERE archived_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_owner_all" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============== AI Messages ===============
CREATE TABLE public.ai_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('USER','ASSISTANT','SYSTEM_TOOL')),
  content TEXT NOT NULL DEFAULT '',
  structured_content JSONB,
  model_identifier TEXT,
  provider_identifier TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PROCESSING','COMPLETED','FAILED','BLOCKED')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conv_idx ON public.ai_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_messages_owner_all" ON public.ai_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- =============== AI Feedback ===============
CREATE TABLE public.ai_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.ai_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('UP','DOWN')),
  motivo TEXT,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
CREATE INDEX ai_feedback_message_idx ON public.ai_feedback(message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_feedback TO authenticated;
GRANT ALL ON public.ai_feedback TO service_role;

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_feedback_owner_all" ON public.ai_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============== AI Rate Limits (per hour bucket) ===============
CREATE TABLE public.ai_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  janela_inicio TIMESTAMPTZ NOT NULL,
  contador INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, janela_inicio)
);

GRANT SELECT ON public.ai_rate_limits TO authenticated;
GRANT ALL ON public.ai_rate_limits TO service_role;

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_rate_limits_owner_read" ON public.ai_rate_limits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============== Trigger updated_at ===============
CREATE OR REPLACE FUNCTION public.tg_ai_conversations_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER ai_conversations_touch
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_conversations_touch();

CREATE OR REPLACE FUNCTION public.tg_ai_messages_touch_conv()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.ai_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER ai_messages_touch_conv
  AFTER INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_messages_touch_conv();

-- =============== Rate Limit Function ===============
-- Retorna { permitido, restantes, limite, janela_reset }. Consome 1 crédito quando permitido.
CREATE OR REPLACE FUNCTION public.ai_assistente_consumir_rate_limit(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limite INTEGER;
  _janela TIMESTAMPTZ;
  _atual INTEGER;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'no_user');
  END IF;

  -- Limite por perfil (o mais alto vence)
  SELECT COALESCE(MAX(CASE role::text
    WHEN 'super_admin' THEN 100
    WHEN 'compliance' THEN 60
    WHEN 'rh' THEN 50
    WHEN 'supervisor' THEN 30
    WHEN 'operacao' THEN 20
    WHEN 'visualizador' THEN 15
    ELSE 10
  END), 10)
  INTO _limite
  FROM public.user_roles WHERE user_id = _user_id;

  _janela := date_trunc('hour', now());

  INSERT INTO public.ai_rate_limits(user_id, janela_inicio, contador)
    VALUES (_user_id, _janela, 0)
    ON CONFLICT (user_id, janela_inicio) DO NOTHING;

  SELECT contador INTO _atual FROM public.ai_rate_limits
    WHERE user_id = _user_id AND janela_inicio = _janela FOR UPDATE;

  IF _atual >= _limite THEN
    RETURN jsonb_build_object(
      'permitido', false,
      'motivo', 'rate_limit',
      'limite', _limite,
      'restantes', 0,
      'janela_reset', _janela + interval '1 hour'
    );
  END IF;

  UPDATE public.ai_rate_limits
    SET contador = contador + 1
    WHERE user_id = _user_id AND janela_inicio = _janela;

  RETURN jsonb_build_object(
    'permitido', true,
    'limite', _limite,
    'restantes', _limite - (_atual + 1),
    'janela_reset', _janela + interval '1 hour'
  );
END; $$;

REVOKE ALL ON FUNCTION public.ai_assistente_consumir_rate_limit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_assistente_consumir_rate_limit(UUID) TO authenticated, service_role;

-- =============== Health metrics (super_admin only) ===============
CREATE OR REPLACE FUNCTION public.ai_assistente_saude(_janela_horas INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _res JSONB; _desde TIMESTAMPTZ;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  _desde := now() - make_interval(hours => GREATEST(_janela_horas, 1));

  SELECT jsonb_build_object(
    'perguntas', COUNT(*) FILTER (WHERE role = 'USER'),
    'respostas_completadas', COUNT(*) FILTER (WHERE role = 'ASSISTANT' AND status = 'COMPLETED'),
    'respostas_falhas', COUNT(*) FILTER (WHERE role = 'ASSISTANT' AND status = 'FAILED'),
    'respostas_bloqueadas', COUNT(*) FILTER (WHERE role = 'ASSISTANT' AND status = 'BLOCKED'),
    'latencia_media_ms', COALESCE(ROUND(AVG(latency_ms) FILTER (WHERE role = 'ASSISTANT' AND status = 'COMPLETED'))::int, 0),
    'tokens_entrada', COALESCE(SUM(input_tokens), 0),
    'tokens_saida', COALESCE(SUM(output_tokens), 0),
    'desde', _desde
  ) INTO _res
  FROM public.ai_messages
  WHERE created_at >= _desde;

  RETURN _res;
END; $$;

REVOKE ALL ON FUNCTION public.ai_assistente_saude(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_assistente_saude(INTEGER) TO authenticated, service_role;
