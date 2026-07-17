
-- =========================================
-- ENUM AÇÃO
-- =========================================
DO $$ BEGIN
  CREATE TYPE public.audit_action AS ENUM (
    'CREATE','UPDATE','DELETE_LOGICO','LOGIN','LOGOUT',
    'IMPORTACAO','EXPORTACAO','DOWNLOAD','VISUALIZACAO',
    'ENVIO_COMUNICACAO','LANCAMENTO','ACESSO_NEGADO','MUDANCA_STATUS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================
-- TABELA
-- =========================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  usuario_id    uuid,
  usuario_nome  text,
  perfil        text,
  empresa_id    uuid,
  projeto_id    uuid,
  modulo        text NOT NULL,
  registro_id   uuid,
  acao          public.audit_action NOT NULL,
  entidade      text,
  antes         jsonb,
  depois        jsonb,
  ip            text,
  user_agent    text,
  origem        text,
  sucesso       boolean NOT NULL DEFAULT true,
  observacoes   text
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario   ON public.audit_logs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_acao      ON public.audit_logs (acao);
CREATE INDEX IF NOT EXISTS idx_audit_modulo    ON public.audit_logs (modulo);
CREATE INDEX IF NOT EXISTS idx_audit_empresa   ON public.audit_logs (empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_projeto   ON public.audit_logs (projeto_id);
CREATE INDEX IF NOT EXISTS idx_audit_registro  ON public.audit_logs (registro_id);

-- =========================================
-- IMUTABILIDADE (bloqueia UPDATE e DELETE)
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_audit_logs_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são imutáveis.' USING ERRCODE='check_violation';
END $$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_logs_immutable();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_logs_immutable();

-- =========================================
-- RLS
-- Módulos considerados "operacionais" (RH pode ver):
--   ausencias, comunicacoes, colaboradores, importacoes,
--   exportacoes, downloads, lancamentos, painel_rh
-- =========================================
DROP POLICY IF EXISTS "audit_select_admin_compliance" ON public.audit_logs;
CREATE POLICY "audit_select_admin_compliance"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')
);

DROP POLICY IF EXISTS "audit_select_rh_operacional" ON public.audit_logs;
CREATE POLICY "audit_select_rh_operacional"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'rh')
  AND modulo IN ('ausencias','comunicacoes','colaboradores','importacoes','exportacoes','downloads','lancamentos','painel_rh','auth')
);

-- Todos os autenticados podem inserir seus próprios eventos (login, exportação, acesso negado etc.)
DROP POLICY IF EXISTS "audit_insert_self" ON public.audit_logs;
CREATE POLICY "audit_insert_self"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK ( usuario_id IS NULL OR usuario_id = auth.uid() );

-- =========================================
-- HELPER: log_audit_event
-- =========================================
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _modulo text,
  _acao public.audit_action,
  _entidade text DEFAULT NULL,
  _registro_id uuid DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _antes jsonb DEFAULT NULL,
  _depois jsonb DEFAULT NULL,
  _sucesso boolean DEFAULT true,
  _observacoes text DEFAULT NULL,
  _origem text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_perfil text;
  v_id uuid;
BEGIN
  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
  SELECT role::text INTO v_perfil FROM public.user_roles WHERE user_id = v_uid
    ORDER BY CASE role::text
      WHEN 'super_admin' THEN 1
      WHEN 'compliance' THEN 2
      WHEN 'rh' THEN 3
      WHEN 'supervisor' THEN 4
      ELSE 9 END LIMIT 1;

  INSERT INTO public.audit_logs (
    usuario_id, usuario_nome, perfil, empresa_id, projeto_id,
    modulo, registro_id, acao, entidade, antes, depois,
    ip, user_agent, origem, sucesso, observacoes
  ) VALUES (
    v_uid, v_nome, v_perfil, _empresa_id, _projeto_id,
    _modulo, _registro_id, _acao, _entidade, _antes, _depois,
    _ip, _user_agent, _origem, _sucesso, _observacoes
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.log_audit_event(text,public.audit_action,text,uuid,uuid,uuid,jsonb,jsonb,boolean,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,public.audit_action,text,uuid,uuid,uuid,jsonb,jsonb,boolean,text,text,text,text) TO authenticated;

-- =========================================
-- TRIGGER GENÉRICO DE AUDITORIA
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_mod text := TG_ARGV[0];
  v_ent text := TG_ARGV[1];
  v_acao public.audit_action;
  v_before jsonb;
  v_after jsonb;
  v_rec_id uuid;
  v_emp uuid;
  v_proj uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'CREATE';
    v_after := to_jsonb(NEW);
    v_rec_id := (NEW).id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_rec_id := (NEW).id;
    -- detecta soft-delete e mudança de status
    IF (v_before ? 'ativo') AND (v_after ? 'ativo')
       AND (v_before->>'ativo')::boolean = true AND (v_after->>'ativo')::boolean = false THEN
      v_acao := 'DELETE_LOGICO';
    ELSIF (v_before ? 'status') AND (v_after ? 'status')
       AND (v_before->>'status') IS DISTINCT FROM (v_after->>'status') THEN
      v_acao := 'MUDANCA_STATUS';
    ELSE
      v_acao := 'UPDATE';
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  BEGIN v_emp := (COALESCE(v_after,v_before)->>'empresa_id')::uuid; EXCEPTION WHEN OTHERS THEN v_emp := NULL; END;
  BEGIN v_proj := (COALESCE(v_after,v_before)->>'projeto_id')::uuid; EXCEPTION WHEN OTHERS THEN v_proj := NULL; END;

  PERFORM public.log_audit_event(
    v_mod, v_acao, v_ent, v_rec_id, v_emp, v_proj, v_before, v_after, true, NULL, 'trigger', NULL, NULL
  );
  RETURN NULL;
END $$;

-- Vincula em cada tabela sensível
DROP TRIGGER IF EXISTS audit_empresas ON public.empresas;
CREATE TRIGGER audit_empresas AFTER INSERT OR UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('empresas','Empresa');

DROP TRIGGER IF EXISTS audit_projetos ON public.projetos;
CREATE TRIGGER audit_projetos AFTER INSERT OR UPDATE ON public.projetos
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('projetos','Projeto');

DROP TRIGGER IF EXISTS audit_colaboradores ON public.colaboradores;
CREATE TRIGGER audit_colaboradores AFTER INSERT OR UPDATE ON public.colaboradores
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('colaboradores','Colaborador');

DROP TRIGGER IF EXISTS audit_ausencias ON public.ausencias;
CREATE TRIGGER audit_ausencias AFTER INSERT OR UPDATE ON public.ausencias
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('ausencias','Ausência');

DROP TRIGGER IF EXISTS audit_comunicacoes ON public.comunicacoes;
CREATE TRIGGER audit_comunicacoes AFTER INSERT OR UPDATE ON public.comunicacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('comunicacoes','Comunicação');

DROP TRIGGER IF EXISTS audit_importacoes ON public.importacoes;
CREATE TRIGGER audit_importacoes AFTER INSERT OR UPDATE ON public.importacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('importacoes','Importação');

-- =========================================
-- BUSCA PAGINADA
-- =========================================
CREATE OR REPLACE FUNCTION public.search_audit_logs(
  _inicio timestamptz DEFAULT NULL,
  _fim timestamptz DEFAULT NULL,
  _usuario_id uuid DEFAULT NULL,
  _perfil text DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _modulo text DEFAULT NULL,
  _acao public.audit_action DEFAULT NULL,
  _entidade text DEFAULT NULL,
  _sucesso boolean DEFAULT NULL,
  _busca text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE (
  total bigint,
  id uuid,
  created_at timestamptz,
  usuario_id uuid,
  usuario_nome text,
  perfil text,
  empresa_id uuid,
  empresa_nome text,
  projeto_id uuid,
  projeto_nome text,
  modulo text,
  registro_id uuid,
  acao public.audit_action,
  entidade text,
  sucesso boolean,
  ip text,
  origem text
)
LANGUAGE sql STABLE SET search_path=public AS $$
  WITH base AS (
    SELECT a.*
    FROM public.audit_logs a
    WHERE (_inicio IS NULL OR a.created_at >= _inicio)
      AND (_fim IS NULL OR a.created_at <= _fim)
      AND (_usuario_id IS NULL OR a.usuario_id = _usuario_id)
      AND (_perfil IS NULL OR a.perfil = _perfil)
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      AND (_modulo IS NULL OR a.modulo = _modulo)
      AND (_acao IS NULL OR a.acao = _acao)
      AND (_entidade IS NULL OR a.entidade = _entidade)
      AND (_sucesso IS NULL OR a.sucesso = _sucesso)
      AND (
        _busca IS NULL OR _busca = '' OR
        a.usuario_nome ILIKE '%'||_busca||'%' OR
        a.observacoes ILIKE '%'||_busca||'%' OR
        a.registro_id::text = _busca OR
        a.depois::text ILIKE '%'||_busca||'%' OR
        a.antes::text  ILIKE '%'||_busca||'%'
      )
  ), cnt AS ( SELECT count(*) AS c FROM base )
  SELECT
    (SELECT c FROM cnt) AS total,
    b.id, b.created_at, b.usuario_id, b.usuario_nome, b.perfil,
    b.empresa_id, e.nome AS empresa_nome,
    b.projeto_id, p.nome AS projeto_nome,
    b.modulo, b.registro_id, b.acao, b.entidade, b.sucesso, b.ip, b.origem
  FROM base b
  LEFT JOIN public.empresas e ON e.id = b.empresa_id
  LEFT JOIN public.projetos p ON p.id = b.projeto_id
  ORDER BY b.created_at DESC
  LIMIT _limit OFFSET _offset
$$;

GRANT EXECUTE ON FUNCTION public.search_audit_logs(timestamptz,timestamptz,uuid,text,uuid,uuid,text,public.audit_action,text,boolean,text,int,int) TO authenticated;

-- KPIs
CREATE OR REPLACE FUNCTION public.audit_kpis(_inicio timestamptz DEFAULT (now() - interval '1 day'))
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT jsonb_build_object(
    'logins',    (SELECT count(*) FROM public.audit_logs WHERE created_at>=_inicio AND acao='LOGIN'),
    'logouts',   (SELECT count(*) FROM public.audit_logs WHERE created_at>=_inicio AND acao='LOGOUT'),
    'exportacoes',(SELECT count(*) FROM public.audit_logs WHERE created_at>=_inicio AND acao='EXPORTACAO'),
    'downloads', (SELECT count(*) FROM public.audit_logs WHERE created_at>=_inicio AND acao='DOWNLOAD'),
    'negados',   (SELECT count(*) FROM public.audit_logs WHERE created_at>=_inicio AND acao='ACESSO_NEGADO'),
    'falhas',    (SELECT count(*) FROM public.audit_logs WHERE created_at>=_inicio AND sucesso=false)
  )
$$;

GRANT EXECUTE ON FUNCTION public.audit_kpis(timestamptz) TO authenticated;
