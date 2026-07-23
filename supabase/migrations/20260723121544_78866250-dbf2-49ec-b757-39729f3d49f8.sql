
-- ============================================================
-- FASE 6 · ALERTAS INTELIGENTES DE ABSENTEÍSMO
-- ============================================================

-- 1) Configuração — novos parâmetros
ALTER TABLE public.absenteismo_config
  ADD COLUMN IF NOT EXISTS alerta_janela_dias                integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS alerta_crescimento_pct            numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS alerta_limite_reincidencia        integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS alerta_limite_dias_perdidos       integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS alerta_limite_mudanca_criticidade integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS alerta_limite_criticos_equipe     integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS alerta_limite_absenteismo_projeto numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS alerta_sensibilidade              text    NOT NULL DEFAULT 'MEDIA'
    CHECK (alerta_sensibilidade IN ('BAIXA','MEDIA','ALTA'));

-- 2) Enums
DO $$ BEGIN
  CREATE TYPE public.inteligencia_alerta_tipo AS ENUM (
    'COLAB_CRITICIDADE',
    'COLAB_REINCIDENCIA',
    'COLAB_DIAS_PERDIDOS',
    'COLAB_CRESCIMENTO_SCORE',
    'SUPERVISOR_EQUIPE_CRITICA',
    'SUPERVISOR_CRESCIMENTO',
    'PROJETO_CONCENTRACAO',
    'PROJETO_ACIDENTES',
    'EMPRESA_CONCENTRACAO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inteligencia_alerta_status AS ENUM ('NOVO','EM_ANALISE','RESOLVIDO','IGNORADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inteligencia_alerta_criticidade AS ENUM ('BAIXA','ATENCAO','ALTA','CRITICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inteligencia_alerta_escopo AS ENUM ('COLABORADOR','SUPERVISOR','PROJETO','EMPRESA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inteligencia_alerta_evento_tipo AS ENUM (
    'CRIADO','COMENTARIO','STATUS_ALTERADO','ATRIBUIDO','LIDO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Tabela principal
CREATE TABLE IF NOT EXISTS public.inteligencia_alertas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                   public.inteligencia_alerta_tipo NOT NULL,
  escopo                 public.inteligencia_alerta_escopo NOT NULL,
  criticidade            public.inteligencia_alerta_criticidade NOT NULL DEFAULT 'ATENCAO',
  status                 public.inteligencia_alerta_status NOT NULL DEFAULT 'NOVO',
  titulo                 text NOT NULL,
  descricao              text NOT NULL,
  dados                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  colaborador_id         uuid REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  supervisor_usuario_id  uuid,
  projeto_id             uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  empresa_id             uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  responsavel_id         uuid,
  assumido_em            timestamptz,
  resolvido_em           timestamptz,
  resolvido_por          uuid,
  motivo_resolucao       text,
  ref_key                text NOT NULL,
  detectado_em           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inteligencia_alertas_ref_key_uidx UNIQUE (ref_key)
);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_status_idx      ON public.inteligencia_alertas(status);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_criticidade_idx ON public.inteligencia_alertas(criticidade);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_projeto_idx     ON public.inteligencia_alertas(projeto_id);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_empresa_idx     ON public.inteligencia_alertas(empresa_id);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_colab_idx       ON public.inteligencia_alertas(colaborador_id);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_sup_idx         ON public.inteligencia_alertas(supervisor_usuario_id);
CREATE INDEX IF NOT EXISTS inteligencia_alertas_detected_idx    ON public.inteligencia_alertas(detectado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inteligencia_alertas TO authenticated;
GRANT ALL ON public.inteligencia_alertas TO service_role;

-- 4) Eventos (histórico + comentários)
CREATE TABLE IF NOT EXISTS public.inteligencia_alerta_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id    uuid NOT NULL REFERENCES public.inteligencia_alertas(id) ON DELETE CASCADE,
  tipo         public.inteligencia_alerta_evento_tipo NOT NULL,
  usuario_id   uuid,
  comentario   text,
  dados        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inteligencia_alerta_eventos_alerta_idx
  ON public.inteligencia_alerta_eventos(alerta_id, created_at);

GRANT SELECT, INSERT ON public.inteligencia_alerta_eventos TO authenticated;
GRANT ALL ON public.inteligencia_alerta_eventos TO service_role;

-- 5) Leituras (per-user)
CREATE TABLE IF NOT EXISTS public.inteligencia_alerta_leituras (
  alerta_id   uuid NOT NULL REFERENCES public.inteligencia_alertas(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL,
  lido_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alerta_id, usuario_id)
);
GRANT SELECT, INSERT, DELETE ON public.inteligencia_alerta_leituras TO authenticated;
GRANT ALL ON public.inteligencia_alerta_leituras TO service_role;

-- 6) Trigger updated_at
CREATE OR REPLACE FUNCTION public.inteligencia_alertas_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_inteligencia_alertas_touch ON public.inteligencia_alertas;
CREATE TRIGGER trg_inteligencia_alertas_touch
BEFORE UPDATE ON public.inteligencia_alertas
FOR EACH ROW EXECUTE FUNCTION public.inteligencia_alertas_touch();

-- 7) RLS
ALTER TABLE public.inteligencia_alertas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inteligencia_alerta_eventos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inteligencia_alerta_leituras ENABLE ROW LEVEL SECURITY;

-- helper: pode ver o alerta?
CREATE OR REPLACE FUNCTION public.inteligencia_alerta_visivel(
  _colaborador_id uuid,
  _supervisor_id  uuid,
  _projeto_id     uuid,
  _empresa_id     uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'rh'::app_role)
    OR public.has_role(auth.uid(),'compliance'::app_role)
    OR (
      public.has_role(auth.uid(),'supervisor'::app_role) AND (
        _supervisor_id = auth.uid()
        OR (_colaborador_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.colaboradores c
              WHERE c.id = _colaborador_id AND c.supervisor_usuario_id = auth.uid()
        ))
        OR (_projeto_id IS NOT NULL AND public.user_has_projeto(auth.uid(), _projeto_id))
      )
    );
$$;

-- Alertas: SELECT
DROP POLICY IF EXISTS "alertas_select" ON public.inteligencia_alertas;
CREATE POLICY "alertas_select" ON public.inteligencia_alertas FOR SELECT TO authenticated
USING (public.inteligencia_alerta_visivel(colaborador_id, supervisor_usuario_id, projeto_id, empresa_id));

-- Alertas: INSERT (motor executa como usuário autenticado)
DROP POLICY IF EXISTS "alertas_insert" ON public.inteligencia_alertas;
CREATE POLICY "alertas_insert" ON public.inteligencia_alertas FOR INSERT TO authenticated
WITH CHECK (public.inteligencia_alerta_visivel(colaborador_id, supervisor_usuario_id, projeto_id, empresa_id));

-- Alertas: UPDATE (mudança de status / responsável dentro do escopo)
DROP POLICY IF EXISTS "alertas_update" ON public.inteligencia_alertas;
CREATE POLICY "alertas_update" ON public.inteligencia_alertas FOR UPDATE TO authenticated
USING (public.inteligencia_alerta_visivel(colaborador_id, supervisor_usuario_id, projeto_id, empresa_id))
WITH CHECK (public.inteligencia_alerta_visivel(colaborador_id, supervisor_usuario_id, projeto_id, empresa_id));

-- Eventos: SELECT / INSERT dentro do escopo do alerta
DROP POLICY IF EXISTS "alerta_eventos_select" ON public.inteligencia_alerta_eventos;
CREATE POLICY "alerta_eventos_select" ON public.inteligencia_alerta_eventos FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inteligencia_alertas a WHERE a.id = alerta_id));

DROP POLICY IF EXISTS "alerta_eventos_insert" ON public.inteligencia_alerta_eventos;
CREATE POLICY "alerta_eventos_insert" ON public.inteligencia_alerta_eventos FOR INSERT TO authenticated
WITH CHECK (
  usuario_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.inteligencia_alertas a WHERE a.id = alerta_id)
);

-- Leituras: cada usuário gerencia as próprias
DROP POLICY IF EXISTS "alerta_leituras_select" ON public.inteligencia_alerta_leituras;
CREATE POLICY "alerta_leituras_select" ON public.inteligencia_alerta_leituras FOR SELECT TO authenticated
USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS "alerta_leituras_insert" ON public.inteligencia_alerta_leituras;
CREATE POLICY "alerta_leituras_insert" ON public.inteligencia_alerta_leituras FOR INSERT TO authenticated
WITH CHECK (
  usuario_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.inteligencia_alertas a WHERE a.id = alerta_id)
);

DROP POLICY IF EXISTS "alerta_leituras_delete" ON public.inteligencia_alerta_leituras;
CREATE POLICY "alerta_leituras_delete" ON public.inteligencia_alerta_leituras FOR DELETE TO authenticated
USING (usuario_id = auth.uid());

-- 8) MOTOR DE ALERTAS (SECURITY INVOKER)
-- Executa detecção baseada em thresholds da configuração vigente, dentro
-- do escopo RLS do usuário. Idempotente por dia (ref_key inclui a data).
CREATE OR REPLACE FUNCTION public.inteligencia_detectar_alertas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  hoje date := (now() AT TIME ZONE 'UTC')::date;
  ref_dia text := to_char(hoje, 'YYYY-MM-DD');
  novos int := 0;
  ignorados int := 0;
  r RECORD;
BEGIN
  SELECT * INTO cfg FROM public.absenteismo_config LIMIT 1;
  IF cfg IS NULL THEN
    RAISE EXCEPTION 'configuração não encontrada';
  END IF;

  -- ---- COLABORADORES (usa RPC oficial, respeita RLS) ----
  FOR r IN
    SELECT *
    FROM public.calcular_score_colaboradores_lote(NULL, NULL, cfg.alerta_janela_dias)
  LOOP
    -- criticidade CRITICA
    IF r.nivel = 'CRITICA' THEN
      BEGIN
        INSERT INTO public.inteligencia_alertas (
          tipo, escopo, criticidade, titulo, descricao, dados,
          colaborador_id, supervisor_usuario_id, projeto_id, empresa_id, ref_key
        ) VALUES (
          'COLAB_CRITICIDADE', 'COLABORADOR', 'CRITICA',
          format('Colaborador em criticidade crítica: %s', r.nome_completo),
          format('Score %s na janela de %s dias — %s ocorrência(s), %s dia(s) perdido(s).',
                 round(r.score,1), cfg.alerta_janela_dias, r.total_ocorrencias, r.total_dias_perdidos),
          jsonb_build_object('score', r.score, 'nivel', r.nivel, 'breakdown', r.breakdown),
          r.colaborador_id, r.supervisor_usuario_id, r.projeto_id, r.empresa_id,
          format('COLAB_CRITICIDADE|%s|%s', r.colaborador_id, ref_dia)
        );
        novos := novos + 1;
      EXCEPTION WHEN unique_violation THEN ignorados := ignorados + 1;
      END;
    END IF;

    -- Reincidência (faltas + atestados)
    IF COALESCE((r.breakdown->>'faltas')::int,0) + COALESCE((r.breakdown->>'atestados')::int,0)
       >= cfg.alerta_limite_reincidencia THEN
      BEGIN
        INSERT INTO public.inteligencia_alertas (
          tipo, escopo, criticidade, titulo, descricao, dados,
          colaborador_id, supervisor_usuario_id, projeto_id, empresa_id, ref_key
        ) VALUES (
          'COLAB_REINCIDENCIA', 'COLABORADOR',
          CASE WHEN r.nivel='CRITICA' THEN 'CRITICA'::inteligencia_alerta_criticidade
               WHEN r.nivel='ALTA'    THEN 'ALTA'::inteligencia_alerta_criticidade
               ELSE 'ATENCAO'::inteligencia_alerta_criticidade END,
          format('Reincidência observada: %s', r.nome_completo),
          format('Total de %s falta(s) + atestado(s) na janela de %s dias — limite configurado: %s.',
                 COALESCE((r.breakdown->>'faltas')::int,0) + COALESCE((r.breakdown->>'atestados')::int,0),
                 cfg.alerta_janela_dias, cfg.alerta_limite_reincidencia),
          jsonb_build_object('breakdown', r.breakdown, 'limite', cfg.alerta_limite_reincidencia),
          r.colaborador_id, r.supervisor_usuario_id, r.projeto_id, r.empresa_id,
          format('COLAB_REINCIDENCIA|%s|%s', r.colaborador_id, ref_dia)
        );
        novos := novos + 1;
      EXCEPTION WHEN unique_violation THEN ignorados := ignorados + 1;
      END;
    END IF;

    -- Dias perdidos
    IF r.total_dias_perdidos >= cfg.alerta_limite_dias_perdidos THEN
      BEGIN
        INSERT INTO public.inteligencia_alertas (
          tipo, escopo, criticidade, titulo, descricao, dados,
          colaborador_id, supervisor_usuario_id, projeto_id, empresa_id, ref_key
        ) VALUES (
          'COLAB_DIAS_PERDIDOS', 'COLABORADOR',
          CASE WHEN r.total_dias_perdidos >= cfg.alerta_limite_dias_perdidos*2
               THEN 'CRITICA'::inteligencia_alerta_criticidade
               ELSE 'ALTA'::inteligencia_alerta_criticidade END,
          format('Dias perdidos acima do limite: %s', r.nome_completo),
          format('%s dia(s) perdido(s) na janela de %s dias — limite configurado: %s.',
                 r.total_dias_perdidos, cfg.alerta_janela_dias, cfg.alerta_limite_dias_perdidos),
          jsonb_build_object('dias', r.total_dias_perdidos, 'limite', cfg.alerta_limite_dias_perdidos),
          r.colaborador_id, r.supervisor_usuario_id, r.projeto_id, r.empresa_id,
          format('COLAB_DIAS_PERDIDOS|%s|%s', r.colaborador_id, ref_dia)
        );
        novos := novos + 1;
      EXCEPTION WHEN unique_violation THEN ignorados := ignorados + 1;
      END;
    END IF;
  END LOOP;

  -- ---- SUPERVISORES: equipe crítica ----
  FOR r IN
    SELECT supervisor_usuario_id AS sup_id,
           projeto_id,
           empresa_id,
           COUNT(*) FILTER (WHERE nivel='CRITICA')::int AS n_criticos,
           COUNT(*)::int AS n_total
    FROM public.calcular_score_colaboradores_lote(NULL, NULL, cfg.alerta_janela_dias) s
    WHERE s.supervisor_usuario_id IS NOT NULL
    GROUP BY supervisor_usuario_id, projeto_id, empresa_id
  LOOP
    IF r.n_criticos >= cfg.alerta_limite_criticos_equipe THEN
      BEGIN
        INSERT INTO public.inteligencia_alertas (
          tipo, escopo, criticidade, titulo, descricao, dados,
          supervisor_usuario_id, projeto_id, empresa_id, ref_key
        ) VALUES (
          'SUPERVISOR_EQUIPE_CRITICA', 'SUPERVISOR',
          CASE WHEN r.n_criticos >= cfg.alerta_limite_criticos_equipe*2
               THEN 'CRITICA'::inteligencia_alerta_criticidade
               ELSE 'ALTA'::inteligencia_alerta_criticidade END,
          'Equipe com concentração de casos críticos',
          format('%s colaborador(es) em nível crítico na equipe (limite: %s).',
                 r.n_criticos, cfg.alerta_limite_criticos_equipe),
          jsonb_build_object('n_criticos', r.n_criticos, 'n_total', r.n_total,
                             'limite', cfg.alerta_limite_criticos_equipe),
          r.sup_id, r.projeto_id, r.empresa_id,
          format('SUP_EQUIPE|%s|%s|%s', r.sup_id, r.projeto_id, ref_dia)
        );
        novos := novos + 1;
      EXCEPTION WHEN unique_violation THEN ignorados := ignorados + 1;
      END;
    END IF;
  END LOOP;

  -- ---- PROJETOS: concentração ----
  FOR r IN
    SELECT projeto_id, empresa_id,
           COUNT(*) FILTER (WHERE nivel IN ('ALTA','CRITICA'))::int AS n_altos,
           COUNT(*)::int AS n_total
    FROM public.calcular_score_colaboradores_lote(NULL, NULL, cfg.alerta_janela_dias)
    GROUP BY projeto_id, empresa_id
  LOOP
    IF r.n_total >= 3 AND (r.n_altos::numeric / r.n_total::numeric) * 100 >= cfg.alerta_limite_absenteismo_projeto THEN
      BEGIN
        INSERT INTO public.inteligencia_alertas (
          tipo, escopo, criticidade, titulo, descricao, dados,
          projeto_id, empresa_id, ref_key
        ) VALUES (
          'PROJETO_CONCENTRACAO', 'PROJETO', 'ALTA',
          'Projeto com concentração de criticidade',
          format('%s de %s colaborador(es) em nível Alta/Crítica (%.1f%%). Limite configurado: %s%%.',
                 r.n_altos, r.n_total, (r.n_altos::numeric/r.n_total::numeric)*100,
                 cfg.alerta_limite_absenteismo_projeto),
          jsonb_build_object('n_altos', r.n_altos, 'n_total', r.n_total,
                             'limite_pct', cfg.alerta_limite_absenteismo_projeto),
          r.projeto_id, r.empresa_id,
          format('PROJ_CONC|%s|%s', r.projeto_id, ref_dia)
        );
        novos := novos + 1;
      EXCEPTION WHEN unique_violation THEN ignorados := ignorados + 1;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'novos', novos,
    'ignorados_duplicados', ignorados,
    'executado_em', now(),
    'referencia_dia', ref_dia
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inteligencia_detectar_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inteligencia_detectar_alertas() TO authenticated;

-- 9) Ações sobre um alerta
CREATE OR REPLACE FUNCTION public.inteligencia_alerta_status(
  _alerta_id uuid,
  _status public.inteligencia_alerta_status,
  _motivo text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM public.inteligencia_alertas WHERE id = _alerta_id;
  IF a IS NULL THEN RAISE EXCEPTION 'alerta não encontrado'; END IF;

  UPDATE public.inteligencia_alertas
     SET status = _status,
         assumido_em     = CASE WHEN _status='EM_ANALISE' AND assumido_em IS NULL THEN now() ELSE assumido_em END,
         responsavel_id  = CASE WHEN _status='EM_ANALISE' AND responsavel_id IS NULL THEN auth.uid() ELSE responsavel_id END,
         resolvido_em    = CASE WHEN _status IN ('RESOLVIDO','IGNORADO') THEN now() ELSE resolvido_em END,
         resolvido_por   = CASE WHEN _status IN ('RESOLVIDO','IGNORADO') THEN auth.uid() ELSE resolvido_por END,
         motivo_resolucao= CASE WHEN _status IN ('RESOLVIDO','IGNORADO') THEN _motivo ELSE motivo_resolucao END
   WHERE id = _alerta_id;

  INSERT INTO public.inteligencia_alerta_eventos (alerta_id, tipo, usuario_id, comentario, dados)
  VALUES (_alerta_id, 'STATUS_ALTERADO', auth.uid(), _motivo,
          jsonb_build_object('de', a.status, 'para', _status));

  PERFORM public.log_audit_event(
    _modulo := 'inteligencia_alertas',
    _acao := CASE _status
               WHEN 'EM_ANALISE' THEN 'ALERTA_ASSUMIDO'::audit_action
               WHEN 'RESOLVIDO'  THEN 'ALERTA_RESOLVIDO'::audit_action
               WHEN 'IGNORADO'   THEN 'ALERTA_DISPENSADO'::audit_action
               ELSE 'ALERTA_REABERTO'::audit_action END,
    _entidade := 'Alerta', _registro_id := _alerta_id,
    _empresa_id := a.empresa_id, _projeto_id := a.projeto_id,
    _antes := jsonb_build_object('status', a.status),
    _depois := jsonb_build_object('status', _status, 'motivo', _motivo),
    _sucesso := true, _observacoes := _motivo, _origem := 'ui'
  );
END; $$;

CREATE OR REPLACE FUNCTION public.inteligencia_alerta_atribuir(
  _alerta_id uuid,
  _responsavel uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a RECORD;
BEGIN
  SELECT * INTO a FROM public.inteligencia_alertas WHERE id = _alerta_id;
  IF a IS NULL THEN RAISE EXCEPTION 'alerta não encontrado'; END IF;

  UPDATE public.inteligencia_alertas
     SET responsavel_id = _responsavel,
         assumido_em    = COALESCE(assumido_em, now()),
         status         = CASE WHEN status='NOVO' THEN 'EM_ANALISE'::inteligencia_alerta_status ELSE status END
   WHERE id = _alerta_id;

  INSERT INTO public.inteligencia_alerta_eventos (alerta_id, tipo, usuario_id, dados)
  VALUES (_alerta_id, 'ATRIBUIDO', auth.uid(),
          jsonb_build_object('de', a.responsavel_id, 'para', _responsavel));
END; $$;

CREATE OR REPLACE FUNCTION public.inteligencia_alerta_comentar(
  _alerta_id uuid,
  _texto text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE novo_id uuid;
BEGIN
  IF _texto IS NULL OR length(trim(_texto)) < 1 THEN
    RAISE EXCEPTION 'comentário vazio';
  END IF;
  INSERT INTO public.inteligencia_alerta_eventos (alerta_id, tipo, usuario_id, comentario)
  VALUES (_alerta_id, 'COMENTARIO', auth.uid(), _texto)
  RETURNING id INTO novo_id;
  RETURN novo_id;
END; $$;

CREATE OR REPLACE FUNCTION public.inteligencia_alerta_marcar_lido(_alerta_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO public.inteligencia_alerta_leituras (alerta_id, usuario_id)
  VALUES (_alerta_id, auth.uid())
  ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.inteligencia_alerta_marcar_todos_lidos()
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n int := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.inteligencia_alerta_leituras (alerta_id, usuario_id)
    SELECT a.id, auth.uid()
    FROM public.inteligencia_alertas a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.inteligencia_alerta_leituras l
      WHERE l.alerta_id = a.id AND l.usuario_id = auth.uid()
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO n FROM ins;
  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.inteligencia_alerta_status(uuid,public.inteligencia_alerta_status,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inteligencia_alerta_atribuir(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inteligencia_alerta_comentar(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inteligencia_alerta_marcar_lido(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inteligencia_alerta_marcar_todos_lidos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inteligencia_alerta_status(uuid,public.inteligencia_alerta_status,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inteligencia_alerta_atribuir(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inteligencia_alerta_comentar(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inteligencia_alerta_marcar_lido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inteligencia_alerta_marcar_todos_lidos() TO authenticated;
