
-- =====================================================================
-- ENUMS
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE public.oa_periodo_status AS ENUM ('PLANEJADO','ATIVO','PRORROGADO','ENCERRADO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_ambiente AS ENUM ('desenvolvimento','homologacao','preview','producao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_incidente_categoria AS ENUM (
    'AUTENTICACAO','PERMISSAO','IMPORTACAO','COLABORADORES','AUSENCIAS',
    'COMUNICACOES','PAINEL_RH','DASHBOARD','RELATORIOS','AUDITORIA',
    'OPERACOES','DEPLOY','DESEMPENHO','INTERFACE','DADOS','OUTROS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_incidente_tipo AS ENUM ('INCIDENTE','BUG','DUVIDA','SOLICITACAO','CONFIGURACAO','MELHORIA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_severidade AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_prioridade AS ENUM ('P4','P3','P2','P1');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_impacto AS ENUM ('INDIVIDUAL','EQUIPE','DEPARTAMENTO','GERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_incidente_status AS ENUM (
    'NOVO','EM_TRIAGEM','EM_ANALISE','EM_CORRECAO','AGUARDANDO_VALIDACAO',
    'RESOLVIDO','ENCERRADO','CANCELADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_evento_tipo AS ENUM (
    'CRIADO','CLASSIFICADO','RESPONSAVEL_ATRIBUIDO','STATUS_ALTERADO',
    'COMENTARIO_ADICIONADO','EVIDENCIA_ADICIONADA','PRAZO_ALTERADO',
    'SOLUCAO_REGISTRADA','VALIDACAO_SOLICITADA','RESOLVIDO','ENCERRADO','REABERTO','CANCELADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.oa_comentario_tipo AS ENUM ('COMENTARIO','ATUALIZACAO','VALIDACAO','DECISAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 1) PERÍODOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.operacao_assistida_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ambiente public.oa_ambiente NOT NULL DEFAULT 'producao',
  data_inicio date NOT NULL,
  data_fim_prevista date NOT NULL,
  data_fim_real date,
  status public.oa_periodo_status NOT NULL DEFAULT 'PLANEJADO',
  responsavel_principal text,
  descricao text,
  criterios_encerramento text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operacao_assistida_periodos TO authenticated;
GRANT ALL ON public.operacao_assistida_periodos TO service_role;
ALTER TABLE public.operacao_assistida_periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oa_periodos_select"
  ON public.operacao_assistida_periodos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR
    public.has_role(auth.uid(),'compliance') OR
    public.has_role(auth.uid(),'rh')
  );

CREATE POLICY "oa_periodos_write_admin"
  ON public.operacao_assistida_periodos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Trigger para updated_at + validações
CREATE OR REPLACE FUNCTION public.tg_oa_periodos_biu()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.data_fim_prevista < NEW.data_inicio THEN
    RAISE EXCEPTION 'data_fim_prevista não pode ser anterior a data_inicio' USING ERRCODE='check_violation';
  END IF;
  IF NEW.status = 'ENCERRADO' AND NEW.data_fim_real IS NULL THEN
    RAISE EXCEPTION 'Encerramento exige data_fim_real' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_at := now();
  -- Somente um período ATIVO por ambiente
  IF NEW.status='ATIVO' THEN
    IF EXISTS (
      SELECT 1 FROM public.operacao_assistida_periodos
      WHERE ambiente = NEW.ambiente AND status='ATIVO'
        AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'Já existe um período ATIVO para o ambiente %', NEW.ambiente
        USING ERRCODE='unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_oa_periodos_biu ON public.operacao_assistida_periodos;
CREATE TRIGGER tg_oa_periodos_biu BEFORE INSERT OR UPDATE ON public.operacao_assistida_periodos
  FOR EACH ROW EXECUTE FUNCTION public.tg_oa_periodos_biu();

-- =====================================================================
-- 2) INCIDENTES
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS public.oa_incidente_codigo_seq;

CREATE TABLE IF NOT EXISTS public.operacao_incidentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid REFERENCES public.operacao_assistida_periodos(id) ON DELETE SET NULL,
  codigo text UNIQUE,
  titulo text NOT NULL,
  descricao text,
  categoria public.oa_incidente_categoria NOT NULL DEFAULT 'OUTROS',
  tipo public.oa_incidente_tipo NOT NULL DEFAULT 'INCIDENTE',
  origem text,
  ambiente public.oa_ambiente NOT NULL DEFAULT 'producao',
  severidade public.oa_severidade NOT NULL DEFAULT 'MEDIA',
  prioridade public.oa_prioridade NOT NULL DEFAULT 'P3',
  impacto public.oa_impacto NOT NULL DEFAULT 'INDIVIDUAL',
  status public.oa_incidente_status NOT NULL DEFAULT 'NOVO',
  modulo_afetado text,
  rota_afetada text,
  versao_detectada text,
  versao_corrigida text,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text,
  reportado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reportado_por_nome text,
  reportado_em timestamptz NOT NULL DEFAULT now(),
  prazo_resolucao timestamptz,
  primeira_resposta_em timestamptz,
  resolvido_em timestamptz,
  encerrado_em timestamptz,
  causa_raiz text,
  solucao_aplicada text,
  plano_prevencao text,
  plano_contencao text,
  possui_dados_sensiveis boolean NOT NULL DEFAULT false,
  alerta_id uuid,
  backup_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oa_inc_status ON public.operacao_incidentes(status);
CREATE INDEX IF NOT EXISTS idx_oa_inc_periodo ON public.operacao_incidentes(periodo_id);
CREATE INDEX IF NOT EXISTS idx_oa_inc_reportado_por ON public.operacao_incidentes(reportado_por);
CREATE INDEX IF NOT EXISTS idx_oa_inc_prioridade ON public.operacao_incidentes(prioridade);

GRANT SELECT, INSERT, UPDATE ON public.operacao_incidentes TO authenticated;
GRANT ALL ON public.operacao_incidentes TO service_role;
ALTER TABLE public.operacao_incidentes ENABLE ROW LEVEL SECURITY;

-- Super Admin e Compliance leem tudo; RH lê os próprios
CREATE POLICY "oa_inc_select_admin_compliance"
  ON public.operacao_incidentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));

CREATE POLICY "oa_inc_select_rh_self"
  ON public.operacao_incidentes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'rh') AND reportado_por = auth.uid());

-- RH pode criar; reportado_por deve ser auth.uid()
CREATE POLICY "oa_inc_insert_rh"
  ON public.operacao_incidentes FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'rh') AND reportado_por = auth.uid())
    OR public.has_role(auth.uid(),'super_admin')
  );

-- Super Admin edita tudo
CREATE POLICY "oa_inc_update_admin"
  ON public.operacao_incidentes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Trigger de geração de código + validações + updated_at
CREATE OR REPLACE FUNCTION public.tg_oa_incidentes_biu()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  v_year int;
  v_seq bigint;
  v_status_old public.oa_incidente_status;
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.reportado_por := COALESCE(NEW.reportado_por, auth.uid());
    IF NEW.reportado_por_nome IS NULL THEN
      SELECT nome INTO NEW.reportado_por_nome FROM public.profiles WHERE id=NEW.reportado_por;
    END IF;
    IF NEW.codigo IS NULL THEN
      v_year := EXTRACT(YEAR FROM now())::int;
      v_seq := nextval('public.oa_incidente_codigo_seq');
      NEW.codigo := 'INC-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    END IF;
    IF NEW.prioridade='P1' AND NEW.responsavel_id IS NULL THEN
      -- permitido criar sem responsável apenas se rascunho, mas aqui exigimos
      NULL;
    END IF;
  ELSE
    v_status_old := OLD.status;
    -- Não voltar de ENCERRADO
    IF OLD.status='ENCERRADO' AND NEW.status <> 'ENCERRADO' AND NEW.status <> 'REABERTO'::text::public.oa_incidente_status THEN
      -- REABERTO não é status; reabertura ocorre via RPC criando evento e voltando para EM_ANALISE
      IF NEW.status NOT IN ('EM_ANALISE') THEN
        RAISE EXCEPTION 'Não é permitido alterar incidente ENCERRADO diretamente' USING ERRCODE='check_violation';
      END IF;
    END IF;
    -- CANCELADO não retorna
    IF OLD.status='CANCELADO' AND NEW.status <> 'CANCELADO' THEN
      RAISE EXCEPTION 'Incidente cancelado não pode ser reaberto por edição direta' USING ERRCODE='check_violation';
    END IF;
    -- RESOLVIDO exige solução
    IF NEW.status='RESOLVIDO' AND COALESCE(btrim(NEW.solucao_aplicada),'')='' THEN
      RAISE EXCEPTION 'RESOLVIDO exige solução aplicada' USING ERRCODE='check_violation';
    END IF;
    -- ENCERRADO exige causa raiz quando CRÍTICA
    IF NEW.status='ENCERRADO' AND NEW.severidade='CRITICA' AND COALESCE(btrim(NEW.causa_raiz),'')='' THEN
      RAISE EXCEPTION 'Incidente CRÍTICO exige causa raiz para encerramento' USING ERRCODE='check_violation';
    END IF;
    IF NEW.status='ENCERRADO' AND NEW.encerrado_em IS NULL THEN
      NEW.encerrado_em := now();
    END IF;
    IF NEW.status='RESOLVIDO' AND NEW.resolvido_em IS NULL THEN
      NEW.resolvido_em := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_oa_incidentes_biu ON public.operacao_incidentes;
CREATE TRIGGER tg_oa_incidentes_biu BEFORE INSERT OR UPDATE ON public.operacao_incidentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_oa_incidentes_biu();

-- Auditoria genérica
DROP TRIGGER IF EXISTS tg_audit_oa_incidentes ON public.operacao_incidentes;
CREATE TRIGGER tg_audit_oa_incidentes
  AFTER INSERT OR UPDATE ON public.operacao_incidentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('operacao_assistida','operacao_incidentes');

-- =====================================================================
-- 3) EVENTOS APPEND-ONLY
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.operacao_incidente_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id uuid NOT NULL REFERENCES public.operacao_incidentes(id) ON DELETE CASCADE,
  evento public.oa_evento_tipo NOT NULL,
  status_anterior public.oa_incidente_status,
  status_novo public.oa_incidente_status,
  mensagem text,
  metadata jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oa_inc_ev_inc ON public.operacao_incidente_eventos(incidente_id, created_at DESC);

GRANT SELECT, INSERT ON public.operacao_incidente_eventos TO authenticated;
GRANT ALL ON public.operacao_incidente_eventos TO service_role;
ALTER TABLE public.operacao_incidente_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oa_ev_select"
  ON public.operacao_incidente_eventos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
    OR EXISTS (
      SELECT 1 FROM public.operacao_incidentes i
      WHERE i.id = incidente_id AND public.has_role(auth.uid(),'rh') AND i.reportado_por = auth.uid()
    )
  );

CREATE POLICY "oa_ev_insert"
  ON public.operacao_incidente_eventos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
    OR EXISTS (
      SELECT 1 FROM public.operacao_incidentes i
      WHERE i.id = incidente_id AND public.has_role(auth.uid(),'rh') AND i.reportado_por = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.tg_oa_eventos_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'operacao_incidente_eventos é append-only. Operação % bloqueada.', TG_OP
    USING ERRCODE='insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS tg_oa_eventos_no_upd ON public.operacao_incidente_eventos;
CREATE TRIGGER tg_oa_eventos_no_upd BEFORE UPDATE ON public.operacao_incidente_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_oa_eventos_immutable();
DROP TRIGGER IF EXISTS tg_oa_eventos_no_del ON public.operacao_incidente_eventos;
CREATE TRIGGER tg_oa_eventos_no_del BEFORE DELETE ON public.operacao_incidente_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_oa_eventos_immutable();

-- =====================================================================
-- 4) COMENTÁRIOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.operacao_incidente_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id uuid NOT NULL REFERENCES public.operacao_incidentes(id) ON DELETE CASCADE,
  conteudo text NOT NULL,
  tipo public.oa_comentario_tipo NOT NULL DEFAULT 'COMENTARIO',
  interno boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oa_com_inc ON public.operacao_incidente_comentarios(incidente_id, created_at DESC);
GRANT SELECT, INSERT ON public.operacao_incidente_comentarios TO authenticated;
GRANT ALL ON public.operacao_incidente_comentarios TO service_role;
ALTER TABLE public.operacao_incidente_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oa_com_select"
  ON public.operacao_incidente_comentarios FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
    OR EXISTS (
      SELECT 1 FROM public.operacao_incidentes i
      WHERE i.id=incidente_id AND public.has_role(auth.uid(),'rh') AND i.reportado_por=auth.uid()
    )
  );

CREATE POLICY "oa_com_insert"
  ON public.operacao_incidente_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
      OR EXISTS (
        SELECT 1 FROM public.operacao_incidentes i
        WHERE i.id=incidente_id AND public.has_role(auth.uid(),'rh') AND i.reportado_por=auth.uid()
      )
    )
  );

-- =====================================================================
-- 5) EVIDÊNCIAS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.operacao_incidente_evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incidente_id uuid NOT NULL REFERENCES public.operacao_incidentes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text,
  url text NOT NULL,
  descricao text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oa_ev_att_inc ON public.operacao_incidente_evidencias(incidente_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.operacao_incidente_evidencias TO authenticated;
GRANT ALL ON public.operacao_incidente_evidencias TO service_role;
ALTER TABLE public.operacao_incidente_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oa_evid_select"
  ON public.operacao_incidente_evidencias FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
    OR EXISTS (
      SELECT 1 FROM public.operacao_incidentes i
      WHERE i.id=incidente_id AND public.has_role(auth.uid(),'rh') AND i.reportado_por=auth.uid()
    )
  );

CREATE POLICY "oa_evid_insert"
  ON public.operacao_incidente_evidencias FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
      OR EXISTS (
        SELECT 1 FROM public.operacao_incidentes i
        WHERE i.id=incidente_id AND public.has_role(auth.uid(),'rh') AND i.reportado_por=auth.uid()
      )
    )
  );

CREATE POLICY "oa_evid_delete_admin"
  ON public.operacao_incidente_evidencias FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- =====================================================================
-- RPCs
-- =====================================================================

-- Registrar transição de status com validação e evento append-only
CREATE OR REPLACE FUNCTION public.oa_incidente_transicionar(
  _incidente_id uuid,
  _novo_status public.oa_incidente_status,
  _mensagem text DEFAULT NULL,
  _causa_raiz text DEFAULT NULL,
  _solucao text DEFAULT NULL,
  _plano_prevencao text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_inc public.operacao_incidentes;
  v_uid uuid := auth.uid();
  v_nome text;
  v_ev_id uuid;
  v_valid boolean := false;
BEGIN
  IF NOT (public.has_role(v_uid,'super_admin')) THEN
    RAISE EXCEPTION 'Somente Super Admin pode transicionar incidentes.' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT * INTO v_inc FROM public.operacao_incidentes WHERE id=_incidente_id FOR UPDATE;
  IF v_inc.id IS NULL THEN
    RAISE EXCEPTION 'Incidente não encontrado' USING ERRCODE='no_data_found';
  END IF;

  -- Validação de transições
  v_valid := CASE
    WHEN v_inc.status='NOVO' AND _novo_status IN ('EM_TRIAGEM','CANCELADO') THEN true
    WHEN v_inc.status='EM_TRIAGEM' AND _novo_status IN ('EM_ANALISE','CANCELADO') THEN true
    WHEN v_inc.status='EM_ANALISE' AND _novo_status IN ('EM_CORRECAO','AGUARDANDO_VALIDACAO','CANCELADO') THEN true
    WHEN v_inc.status='EM_CORRECAO' AND _novo_status IN ('AGUARDANDO_VALIDACAO','EM_ANALISE','CANCELADO') THEN true
    WHEN v_inc.status='AGUARDANDO_VALIDACAO' AND _novo_status IN ('RESOLVIDO','EM_ANALISE','CANCELADO') THEN true
    WHEN v_inc.status='RESOLVIDO' AND _novo_status IN ('ENCERRADO','EM_ANALISE') THEN true
    WHEN v_inc.status='ENCERRADO' AND _novo_status='EM_ANALISE' THEN true  -- reabertura
    ELSE false
  END;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'Transição inválida: % -> %', v_inc.status, _novo_status USING ERRCODE='check_violation';
  END IF;

  UPDATE public.operacao_incidentes SET
    status = _novo_status,
    causa_raiz = COALESCE(_causa_raiz, causa_raiz),
    solucao_aplicada = COALESCE(_solucao, solucao_aplicada),
    plano_prevencao = COALESCE(_plano_prevencao, plano_prevencao),
    primeira_resposta_em = CASE
      WHEN primeira_resposta_em IS NULL AND _novo_status <> 'NOVO' THEN now()
      ELSE primeira_resposta_em END
  WHERE id=_incidente_id;

  SELECT nome INTO v_nome FROM public.profiles WHERE id=v_uid;

  INSERT INTO public.operacao_incidente_eventos(
    incidente_id, evento, status_anterior, status_novo, mensagem, metadata, created_by, created_by_nome
  ) VALUES (
    _incidente_id,
    CASE
      WHEN _novo_status='RESOLVIDO' THEN 'RESOLVIDO'::public.oa_evento_tipo
      WHEN _novo_status='ENCERRADO' THEN 'ENCERRADO'::public.oa_evento_tipo
      WHEN _novo_status='CANCELADO' THEN 'CANCELADO'::public.oa_evento_tipo
      WHEN v_inc.status='ENCERRADO' AND _novo_status='EM_ANALISE' THEN 'REABERTO'::public.oa_evento_tipo
      ELSE 'STATUS_ALTERADO'::public.oa_evento_tipo
    END,
    v_inc.status, _novo_status, _mensagem, NULL, v_uid, v_nome
  ) RETURNING id INTO v_ev_id;

  RETURN v_ev_id;
END $$;

-- Dashboard/KPIs
CREATE OR REPLACE FUNCTION public.oa_dashboard(_periodo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb; v_periodo public.operacao_assistida_periodos;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _periodo_id IS NULL THEN
    SELECT * INTO v_periodo FROM public.operacao_assistida_periodos
    WHERE status='ATIVO' ORDER BY data_inicio DESC LIMIT 1;
  ELSE
    SELECT * INTO v_periodo FROM public.operacao_assistida_periodos WHERE id=_periodo_id;
  END IF;

  WITH base AS (
    SELECT * FROM public.operacao_incidentes
    WHERE v_periodo.id IS NULL OR periodo_id = v_periodo.id
  )
  SELECT jsonb_build_object(
    'periodo', CASE WHEN v_periodo.id IS NULL THEN NULL ELSE to_jsonb(v_periodo) END,
    'dias_restantes', CASE WHEN v_periodo.id IS NULL THEN NULL ELSE GREATEST(0, v_periodo.data_fim_prevista - CURRENT_DATE) END,
    'kpis', jsonb_build_object(
      'total', (SELECT count(*) FROM base),
      'abertos', (SELECT count(*) FROM base WHERE status NOT IN ('ENCERRADO','CANCELADO')),
      'criticos', (SELECT count(*) FROM base WHERE severidade='CRITICA' AND status NOT IN ('ENCERRADO','CANCELADO')),
      'p1_abertos', (SELECT count(*) FROM base WHERE prioridade='P1' AND status NOT IN ('ENCERRADO','CANCELADO')),
      'resolvidos', (SELECT count(*) FROM base WHERE status='RESOLVIDO'),
      'encerrados', (SELECT count(*) FROM base WHERE status='ENCERRADO'),
      'reabertos', (SELECT count(*) FROM public.operacao_incidente_eventos e
                    JOIN base b ON b.id=e.incidente_id WHERE e.evento='REABERTO'),
      'tempo_medio_resolucao_h',
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (resolvido_em - reportado_em))/3600.0),0)
         FROM base WHERE resolvido_em IS NOT NULL),
      'tempo_medio_primeira_resposta_h',
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (primeira_resposta_em - reportado_em))/3600.0),0)
         FROM base WHERE primeira_resposta_em IS NOT NULL),
      'vencidos', (SELECT count(*) FROM base WHERE prazo_resolucao IS NOT NULL AND prazo_resolucao < now() AND status NOT IN ('RESOLVIDO','ENCERRADO','CANCELADO'))
    ),
    'por_dia', (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia),'[]'::jsonb) FROM (
      SELECT reportado_em::date AS dia, count(*) AS total FROM base GROUP BY reportado_em::date
    ) t),
    'por_categoria', (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC),'[]'::jsonb) FROM (
      SELECT categoria::text AS nome, count(*) AS total FROM base GROUP BY categoria
    ) t),
    'por_severidade', (SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
      SELECT severidade::text AS nome, count(*) AS total FROM base GROUP BY severidade
    ) t),
    'por_prioridade', (SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
      SELECT prioridade::text AS nome, count(*) AS total FROM base GROUP BY prioridade
    ) t),
    'por_status', (SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
      SELECT status::text AS nome, count(*) AS total FROM base GROUP BY status
    ) t),
    'por_modulo', (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC),'[]'::jsonb) FROM (
      SELECT COALESCE(modulo_afetado,'(sem módulo)') AS nome, count(*) AS total FROM base GROUP BY modulo_afetado
    ) t)
  ) INTO v;
  RETURN v;
END $$;

-- Encerrar período
CREATE OR REPLACE FUNCTION public.oa_periodo_encerrar(_periodo_id uuid, _observacoes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_abertos int;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Somente Super Admin pode encerrar o período' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT count(*) INTO v_abertos FROM public.operacao_incidentes
  WHERE periodo_id=_periodo_id AND severidade='CRITICA' AND status NOT IN ('ENCERRADO','CANCELADO');
  IF v_abertos > 0 THEN
    RAISE EXCEPTION 'Existem % incidente(s) crítico(s) abertos', v_abertos USING ERRCODE='check_violation';
  END IF;
  SELECT count(*) INTO v_abertos FROM public.operacao_incidentes
  WHERE periodo_id=_periodo_id AND prioridade='P1' AND status NOT IN ('ENCERRADO','CANCELADO');
  IF v_abertos > 0 THEN
    RAISE EXCEPTION 'Existem % incidente(s) P1 abertos', v_abertos USING ERRCODE='check_violation';
  END IF;
  UPDATE public.operacao_assistida_periodos
    SET status='ENCERRADO', data_fim_real = CURRENT_DATE,
        descricao = COALESCE(descricao,'') || CASE WHEN _observacoes IS NOT NULL THEN E'\n[encerramento] ' || _observacoes ELSE '' END
  WHERE id=_periodo_id;
END $$;

-- Prorrogar período
CREATE OR REPLACE FUNCTION public.oa_periodo_prorrogar(_periodo_id uuid, _nova_data date, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Somente Super Admin' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _nova_data IS NULL OR btrim(COALESCE(_motivo,''))='' THEN
    RAISE EXCEPTION 'Prorrogação exige nova data e motivo' USING ERRCODE='check_violation';
  END IF;
  UPDATE public.operacao_assistida_periodos
  SET status='PRORROGADO', data_fim_prevista=_nova_data,
      descricao = COALESCE(descricao,'') || E'\n[prorrogação ' || _nova_data::text || '] ' || _motivo
  WHERE id=_periodo_id;
END $$;
