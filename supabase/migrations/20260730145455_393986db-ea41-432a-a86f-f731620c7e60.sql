-- =====================================================================
-- SIGEC — RETIFICAÇÃO DE AUSÊNCIAS (idempotente, não destrutivo)
-- =====================================================================

-- 1) Novo evento de auditoria -----------------------------------------
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'AUSENCIA_RETIFICADA';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'AUSENCIA_DUPLICIDADE_BLOQUEADA';

-- 2) Marcação de retificação na própria ausência ----------------------
ALTER TABLE public.ausencias
  ADD COLUMN IF NOT EXISTS retificada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retificada_em timestamptz,
  ADD COLUMN IF NOT EXISTS retificada_por uuid,
  ADD COLUMN IF NOT EXISTS retificacoes_count integer NOT NULL DEFAULT 0;

-- 3) Histórico imutável de retificações -------------------------------
CREATE TABLE IF NOT EXISTS public.ausencia_retificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ausencia_id uuid NOT NULL REFERENCES public.ausencias(id) ON DELETE CASCADE,
  protocolo text,
  empresa_id uuid NOT NULL,
  projeto_id uuid NOT NULL,
  colaborador_id uuid,
  tipo_anterior_id uuid,
  tipo_anterior_nome text,
  tipo_novo_id uuid,
  tipo_novo_nome text,
  periodo_anterior_id uuid,
  periodo_anterior_nome text,
  periodo_novo_id uuid,
  periodo_novo_nome text,
  data_inicio_anterior date,
  data_inicio_nova date,
  data_fim_anterior date,
  data_fim_nova date,
  anexo_anterior boolean,
  anexo_novo boolean,
  usuario_id uuid NOT NULL,
  papel_usuario text NOT NULL,
  retificado_em timestamptz NOT NULL DEFAULT now(),
  motivo_operacional text NOT NULL,
  observacao text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ausencia_retificacoes_ausencia_idx
  ON public.ausencia_retificacoes(ausencia_id, retificado_em DESC);

-- Somente leitura para authenticated; escrita apenas via RPC SECURITY DEFINER.
REVOKE ALL ON public.ausencia_retificacoes FROM authenticated, anon;
GRANT SELECT ON public.ausencia_retificacoes TO authenticated;
GRANT ALL ON public.ausencia_retificacoes TO service_role;
ALTER TABLE public.ausencia_retificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ausencia_retificacoes_select_escopo ON public.ausencia_retificacoes;
CREATE POLICY ausencia_retificacoes_select_escopo
  ON public.ausencia_retificacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'rh'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR usuario_id = auth.uid()
    OR public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id)
  );

-- 4) Campos imutáveis (defesa em profundidade no banco) ----------------
CREATE OR REPLACE FUNCTION public.tg_ausencias_campos_imutaveis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.protocolo IS DISTINCT FROM OLD.protocolo
     OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id
     OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     OR NEW.projeto_id IS DISTINCT FROM OLD.projeto_id
     OR NEW.origem_registro IS DISTINCT FROM OLD.origem_registro
     OR NEW.registrado_por IS DISTINCT FROM OLD.registrado_por
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos imutáveis da ausência não podem ser alterados.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ausencias_campos_imutaveis ON public.ausencias;
CREATE TRIGGER trg_ausencias_campos_imutaveis
  BEFORE UPDATE ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_ausencias_campos_imutaveis();

-- 5) Snapshot tipo/período passa a acompanhar a retificação ------------
CREATE OR REPLACE FUNCTION public.tg_ausencias_valida_tipo_periodo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo_cod text; v_tipo_nome text; v_tipo_ativo boolean;
  v_op_cod text; v_op_nome text; v_op_ativo boolean; v_op_qtd int;
  v_vinculo_ativo boolean;
  v_mudou boolean := false;
BEGIN
  IF NEW.tipo_ausencia_id IS NULL OR NEW.opcao_periodo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_mudou := (NEW.tipo_ausencia_id IS DISTINCT FROM OLD.tipo_ausencia_id)
            OR (NEW.opcao_periodo_id IS DISTINCT FROM OLD.opcao_periodo_id);
  END IF;

  SELECT codigo, nome, ativo INTO v_tipo_cod, v_tipo_nome, v_tipo_ativo
    FROM public.tipos_ausencia WHERE id = NEW.tipo_ausencia_id;
  IF v_tipo_cod IS NULL THEN
    RAISE EXCEPTION 'Tipo de ausência não encontrado.' USING ERRCODE='foreign_key_violation';
  END IF;

  SELECT codigo, nome, ativo, quantidade_dias INTO v_op_cod, v_op_nome, v_op_ativo, v_op_qtd
    FROM public.opcoes_periodo_ausencia WHERE id = NEW.opcao_periodo_id;
  IF v_op_cod IS NULL THEN
    RAISE EXCEPTION 'Opção de período não encontrada.' USING ERRCODE='foreign_key_violation';
  END IF;

  SELECT ativo INTO v_vinculo_ativo
    FROM public.tipo_ausencia_opcoes_periodo
   WHERE tipo_ausencia_id = NEW.tipo_ausencia_id
     AND opcao_periodo_id = NEW.opcao_periodo_id;

  IF TG_OP = 'INSERT' OR v_mudou THEN
    IF NOT v_tipo_ativo THEN
      RAISE EXCEPTION 'Tipo de ausência inativo.' USING ERRCODE='check_violation';
    END IF;
    IF NOT v_op_ativo THEN
      RAISE EXCEPTION 'Opção de período inativa.' USING ERRCODE='check_violation';
    END IF;
    IF v_vinculo_ativo IS NULL OR v_vinculo_ativo = false THEN
      RAISE EXCEPTION 'Combinação tipo/período não autorizada.' USING ERRCODE='check_violation';
    END IF;
    NEW.tipo_ausencia_codigo := v_tipo_cod;
    NEW.tipo_ausencia_nome := v_tipo_nome;
    NEW.opcao_periodo_codigo := v_op_cod;
    NEW.opcao_periodo_nome := v_op_nome;
    NEW.quantidade_dias_calculada := v_op_qtd;
  ELSE
    NEW.tipo_ausencia_codigo := OLD.tipo_ausencia_codigo;
    NEW.tipo_ausencia_nome := OLD.tipo_ausencia_nome;
    NEW.opcao_periodo_codigo := OLD.opcao_periodo_codigo;
    NEW.opcao_periodo_nome := OLD.opcao_periodo_nome;
    NEW.quantidade_dias_calculada := OLD.quantidade_dias_calculada;
  END IF;

  RETURN NEW;
END $$;

-- 6) Policy de UPDATE para retificação por supervisor/coordenador ------
DROP POLICY IF EXISTS ausencias_supervisor_retificacao_update ON public.ausencias;
CREATE POLICY ausencias_supervisor_retificacao_update
  ON public.ausencias FOR UPDATE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'supervisor'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
    )
    AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id)
    AND now() <= created_at + interval '24 hours'
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'supervisor'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
    )
    AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id)
    AND EXISTS (
      SELECT 1 FROM public.projetos p
       WHERE p.id = projeto_id AND p.empresa_id = ausencias.empresa_id
    )
    AND now() <= created_at + interval '24 hours'
  );

-- 7) Detecção de duplicidade ------------------------------------------
CREATE OR REPLACE FUNCTION public.ausencia_duplicada_existente(
  _colaborador_id uuid,
  _projeto_id uuid,
  _data_inicio date,
  _data_fim date,
  _opcao_periodo_id uuid,
  _ignorar_id uuid DEFAULT NULL,
  _manual_matricula text DEFAULT NULL
)
RETURNS TABLE (id uuid, protocolo text, tipo_ausencia_nome text, data_inicio date, data_fim date, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.id, a.protocolo, a.tipo_ausencia_nome, a.data_inicio, a.data_fim, a.created_at
    FROM public.ausencias a
   WHERE a.projeto_id = _projeto_id
     AND (_ignorar_id IS NULL OR a.id <> _ignorar_id)
     AND (
       (_colaborador_id IS NOT NULL AND a.colaborador_id = _colaborador_id)
       OR (_colaborador_id IS NULL AND _manual_matricula IS NOT NULL
           AND btrim(a.manual_matricula) = btrim(_manual_matricula))
     )
     AND a.data_inicio <= _data_fim
     AND a.data_fim >= _data_inicio
     AND (_opcao_periodo_id IS NULL OR a.opcao_periodo_id = _opcao_periodo_id)
   ORDER BY a.created_at DESC
   LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.ausencia_duplicada_existente(uuid,uuid,date,date,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ausencia_duplicada_existente(uuid,uuid,date,date,uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_ausencias_bloqueia_duplicidade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_protocolo text;
BEGIN
  SELECT d.id, d.protocolo INTO v_id, v_protocolo
    FROM public.ausencia_duplicada_existente(
      NEW.colaborador_id, NEW.projeto_id, NEW.data_inicio, NEW.data_fim,
      NEW.opcao_periodo_id, NEW.id, NEW.manual_matricula) d
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICIDADE_AUSENCIA: Já existe uma ausência registrada para este colaborador neste período (protocolo %). Retifique o lançamento existente.', coalesce(v_protocolo,'—')
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ausencias_bloqueia_duplicidade ON public.ausencias;
CREATE TRIGGER trg_ausencias_bloqueia_duplicidade
  BEFORE INSERT ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_ausencias_bloqueia_duplicidade();

-- 8) RPC transacional de retificação ----------------------------------
CREATE OR REPLACE FUNCTION public.retificar_ausencia(
  p_ausencia_id uuid,
  p_tipo_ausencia_id uuid,
  p_opcao_periodo_id uuid,
  p_data_inicio date,
  p_motivo_operacional text,
  p_motivo text DEFAULT NULL,
  p_cid text DEFAULT NULL,
  p_tipo_detalhe text DEFAULT NULL,
  p_arquivo jsonb DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a public.ausencias%ROWTYPE;
  v_tipo record;
  v_op record;
  v_papel text;
  v_prazo_ok boolean;
  v_data_fim date;
  v_tipo_base text;
  v_arq_path text;
  v_arq_nome text;
  v_arq_mime text;
  v_arq_tam int;
  v_possui_anexo boolean;
  v_corr uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: autenticação obrigatória.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_motivo_operacional IS NULL OR length(btrim(p_motivo_operacional)) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe o motivo da retificação (mínimo 10 caracteres).' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_a FROM public.ausencias WHERE id = p_ausencia_id FOR UPDATE;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: ausência não encontrada.' USING ERRCODE='no_data_found';
  END IF;

  -- Papel efetivo no banco (nunca vindo do cliente)
  IF public.has_role(v_uid,'super_admin'::app_role) THEN v_papel := 'super_admin';
  ELSIF public.has_role(v_uid,'rh'::app_role) THEN v_papel := 'rh';
  ELSIF public.has_role(v_uid,'coordenador'::app_role) THEN v_papel := 'coordenador';
  ELSIF public.has_role(v_uid,'supervisor'::app_role) THEN v_papel := 'supervisor';
  ELSE
    RAISE EXCEPTION 'PERMISSION_DENIED: perfil sem permissão para retificar.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF v_papel IN ('supervisor','coordenador') THEN
    IF NOT public.user_pode_projeto_escopo_manual(v_uid, v_a.projeto_id) THEN
      RAISE EXCEPTION 'PROJECT_SCOPE_DENIED: ausência fora do seu escopo.' USING ERRCODE='insufficient_privilege';
    END IF;
    v_prazo_ok := now() <= v_a.created_at + interval '24 hours';
    IF NOT v_prazo_ok THEN
      RAISE EXCEPTION 'PRAZO_EXPIRADO: a janela de 24 horas expirou. Solicite a correção ao RH ou Super Admin.' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;

  SELECT id, codigo, nome, ativo, exige_documento INTO v_tipo
    FROM public.tipos_ausencia WHERE id = p_tipo_ausencia_id;
  IF v_tipo.id IS NULL OR v_tipo.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: tipo de ausência inválido ou inativo.' USING ERRCODE='check_violation';
  END IF;

  SELECT id, codigo, nome, ativo, quantidade_dias INTO v_op
    FROM public.opcoes_periodo_ausencia WHERE id = p_opcao_periodo_id;
  IF v_op.id IS NULL OR v_op.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: opção de período inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tipo_ausencia_opcoes_periodo
     WHERE tipo_ausencia_id = p_tipo_ausencia_id
       AND opcao_periodo_id = p_opcao_periodo_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: combinação tipo/período não autorizada.' USING ERRCODE='check_violation';
  END IF;

  v_data_fim := p_data_inicio + (GREATEST(coalesce(v_op.quantidade_dias,1),1) - 1);

  -- Anexo: caminho conferido no servidor, sempre no bucket oficial
  v_arq_path := nullif(btrim(coalesce(p_arquivo->>'path','')),'');
  IF v_arq_path IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'atestados' AND o.name = v_arq_path
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: arquivo não encontrado no repositório oficial.' USING ERRCODE='check_violation';
    END IF;
    IF NOT public.atestado_path_visivel_para(v_arq_path, v_uid) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: arquivo fora do seu escopo.' USING ERRCODE='insufficient_privilege';
    END IF;
    IF v_a.colaborador_id IS NOT NULL
       AND split_part(v_arq_path,'/',2) <> v_a.colaborador_id::text THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: arquivo não pertence a este colaborador.' USING ERRCODE='check_violation';
    END IF;
    v_arq_nome := nullif(btrim(coalesce(p_arquivo->>'nome','')),'');
    v_arq_mime := nullif(btrim(coalesce(p_arquivo->>'mime','')),'');
    v_arq_tam  := nullif(p_arquivo->>'tamanho','')::int;
  ELSE
    v_arq_path := v_a.arquivo_url;
    v_arq_nome := v_a.arquivo_nome;
    v_arq_mime := v_a.arquivo_mime;
    v_arq_tam  := v_a.arquivo_tamanho;
  END IF;
  v_possui_anexo := v_arq_path IS NOT NULL;

  IF v_tipo.exige_documento IS TRUE AND NOT v_possui_anexo THEN
    RAISE EXCEPTION 'DOCUMENTO_OBRIGATORIO: o tipo selecionado exige documento anexado.' USING ERRCODE='check_violation';
  END IF;

  v_tipo_base := CASE
    WHEN v_tipo.codigo LIKE 'ATESTADO%' THEN 'ATESTADO'
    WHEN v_tipo.codigo LIKE 'DECLARACAO%' THEN 'DECLARACAO'
    WHEN v_tipo.codigo LIKE 'FALTA%' THEN 'FALTA'
    WHEN v_tipo.codigo LIKE 'SUSPENSAO%' THEN 'SUSPENSAO'
    ELSE 'OUTROS' END;

  -- Histórico ANTES do update (mesma transação)
  INSERT INTO public.ausencia_retificacoes (
    ausencia_id, protocolo, empresa_id, projeto_id, colaborador_id,
    tipo_anterior_id, tipo_anterior_nome, tipo_novo_id, tipo_novo_nome,
    periodo_anterior_id, periodo_anterior_nome, periodo_novo_id, periodo_novo_nome,
    data_inicio_anterior, data_inicio_nova, data_fim_anterior, data_fim_nova,
    anexo_anterior, anexo_novo, usuario_id, papel_usuario,
    motivo_operacional, observacao, correlation_id
  ) VALUES (
    v_a.id, v_a.protocolo, v_a.empresa_id, v_a.projeto_id, v_a.colaborador_id,
    v_a.tipo_ausencia_id, v_a.tipo_ausencia_nome, v_tipo.id, v_tipo.nome,
    v_a.opcao_periodo_id, v_a.opcao_periodo_nome, v_op.id, v_op.nome,
    v_a.data_inicio, p_data_inicio, v_a.data_fim, v_data_fim,
    v_a.possui_anexo, v_possui_anexo, v_uid, v_papel,
    btrim(p_motivo_operacional), nullif(btrim(coalesce(p_observacao,'')),''), v_corr
  );

  UPDATE public.ausencias SET
    tipo = v_tipo_base::tipo_ausencia,
    tipo_ausencia_id = v_tipo.id,
    opcao_periodo_id = v_op.id,
    tipo_detalhe = coalesce(nullif(btrim(coalesce(p_tipo_detalhe,'')),''), v_tipo.nome),
    dias_label = v_op.nome,
    data_inicio = p_data_inicio,
    data_fim = v_data_fim,
    motivo = coalesce(nullif(btrim(coalesce(p_motivo,'')),''), motivo),
    cid = CASE WHEN v_tipo.permite_cid IS FALSE THEN NULL
               ELSE coalesce(nullif(upper(btrim(coalesce(p_cid,''))),''), cid) END,
    arquivo_url = v_arq_path,
    arquivo_nome = v_arq_nome,
    arquivo_mime = v_arq_mime,
    arquivo_tamanho = v_arq_tam,
    arquivo_criado_por = CASE WHEN v_arq_path IS DISTINCT FROM v_a.arquivo_url THEN v_uid ELSE arquivo_criado_por END,
    arquivo_criado_em = CASE WHEN v_arq_path IS DISTINCT FROM v_a.arquivo_url THEN now() ELSE arquivo_criado_em END,
    retificada = true,
    retificada_em = now(),
    retificada_por = v_uid,
    retificacoes_count = coalesce(retificacoes_count,0) + 1
  WHERE id = v_a.id;

  -- Auditoria sem dados clínicos
  PERFORM public.log_audit_event(
    'ausencias', 'AUSENCIA_RETIFICADA'::audit_action, 'ausencias', v_a.id,
    v_a.empresa_id, v_a.projeto_id,
    jsonb_build_object('tipo_id', v_a.tipo_ausencia_id, 'tipo', v_a.tipo_ausencia_nome,
                       'periodo_id', v_a.opcao_periodo_id, 'data_inicio', v_a.data_inicio, 'data_fim', v_a.data_fim),
    jsonb_build_object('tipo_id', v_tipo.id, 'tipo', v_tipo.nome,
                       'periodo_id', v_op.id, 'data_inicio', p_data_inicio, 'data_fim', v_data_fim,
                       'protocolo', v_a.protocolo, 'correlation_id', v_corr, 'papel', v_papel),
    true, 'retificação de ausência', 'rpc.retificar_ausencia', NULL, NULL
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ausencia_id', v_a.id,
    'protocolo', v_a.protocolo,
    'tipo_novo', v_tipo.nome,
    'data_inicio', p_data_inicio,
    'data_fim', v_data_fim,
    'correlation_id', v_corr
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retificar_ausencia(uuid,uuid,uuid,date,text,text,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retificar_ausencia(uuid,uuid,uuid,date,text,text,text,text,jsonb,text) TO authenticated;

-- 9) Leitura do histórico por ausência ---------------------------------
CREATE OR REPLACE FUNCTION public.listar_retificacoes_ausencia(_ausencia_id uuid)
RETURNS SETOF public.ausencia_retificacoes
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.ausencia_retificacoes
   WHERE ausencia_id = _ausencia_id
   ORDER BY retificado_em DESC;
$$;

REVOKE ALL ON FUNCTION public.listar_retificacoes_ausencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_retificacoes_ausencia(uuid) TO authenticated;