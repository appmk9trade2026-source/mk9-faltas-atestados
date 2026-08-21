-- 1. Recriar retificar_ausencia com correção de drift
CREATE OR REPLACE FUNCTION public.retificar_ausencia(
    p_ausencia_id uuid,
    p_tipo_ausencia_id uuid,
    p_opcao_periodo_id uuid,
    p_data_inicio date,
    p_motivo_operacional text,
    p_motivo text DEFAULT NULL::text,
    p_cid text DEFAULT NULL::text,
    p_tipo_detalhe text DEFAULT NULL::text,
    p_arquivo jsonb DEFAULT NULL::jsonb,
    p_observacao text DEFAULT NULL::text,
    p_updated_at_check timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_motivo_categoria text DEFAULT NULL::text,
    p_e_erro_supervisor boolean DEFAULT NULL::boolean,
    p_horario_inicio text DEFAULT NULL::text,
    p_horario_fim text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_a public.ausencias%ROWTYPE;
  v_tipo record;
  v_op record;
  v_papel text;
  v_prazo_ok boolean;
  v_data_fim date;
  v_arq_path text;
  v_arq_nome text;
  v_arq_mime text;
  v_arq_tam int;
  v_possui_anexo boolean;
  v_corr uuid := gen_random_uuid();
  v_e_erro_real boolean;
  v_periodo_anterior_nome text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: autenticação obrigatória.' USING ERRCODE='insufficient_privilege';
  END IF;
  
  IF p_motivo_operacional IS NULL OR length(btrim(p_motivo_operacional)) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe a justificativa da retificação (mínimo 10 caracteres).' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_a FROM public.ausencias WHERE id = p_ausencia_id FOR UPDATE;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: ausência não encontrada.' USING ERRCODE='no_data_found';
  END IF;

  IF p_updated_at_check IS NOT NULL AND v_a.updated_at IS DISTINCT FROM p_updated_at_check THEN
    RAISE EXCEPTION 'CONCURRENCY_ERROR: Este lançamento foi alterado por outro usuário. Atualize os dados antes de continuar.' USING ERRCODE='check_violation';
  END IF;

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

  SELECT id, codigo, nome, ativo, exige_documento, permite_cid INTO v_tipo
    FROM public.tipos_ausencia WHERE id = p_tipo_ausencia_id;
  IF v_tipo.id IS NULL OR v_tipo.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: tipo de ausência inválido ou inativo.' USING ERRCODE='check_violation';
  END IF;

  SELECT id, codigo, nome, ativo, quantidade_dias, tipo_periodo INTO v_op
    FROM public.opcoes_periodo_ausencia WHERE id = p_opcao_periodo_id;
  IF v_op.id IS NULL OR v_op.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: opção de período inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  IF v_op.tipo_periodo = 'MEIO_PERIODO' THEN
    IF p_horario_inicio IS NULL OR p_horario_fim IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o horário inicial e final para meio período.' USING ERRCODE='check_violation';
    END IF;
    IF p_horario_inicio::time >= p_horario_fim::time THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: horário inicial deve ser menor que o final.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  v_data_fim := p_data_inicio + (GREATEST(coalesce(v_op.quantidade_dias,1),1) - 1);

  v_arq_path := nullif(btrim(coalesce(p_arquivo->>'path','')),'');
  IF v_arq_path IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'atestados' AND o.name = v_arq_path
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: arquivo não encontrado no repositório oficial.' USING ERRCODE='check_violation';
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

  v_e_erro_real := coalesce(p_e_erro_supervisor, (p_motivo_categoria IN ('DATA_PERIODO_INCORRETO', 'TIPO_INCORRETO', 'DOCUMENTO_INCORRETO', 'ERRO_DIGITACAO_SUPERVISOR')));

  SELECT nome INTO v_periodo_anterior_nome FROM public.opcoes_periodo_ausencia WHERE id = v_a.opcao_periodo_id;

  INSERT INTO public.ausencia_retificacoes (
    ausencia_id, protocolo, empresa_id, projeto_id, colaborador_id,
    tipo_anterior_id, tipo_anterior_nome, tipo_novo_id, tipo_novo_nome,
    periodo_anterior_id, periodo_anterior_nome, periodo_novo_id, periodo_novo_nome,
    data_inicio_anterior, data_inicio_nova, data_fim_anterior, data_fim_nova,
    horario_inicio_anterior, horario_inicio_novo, horario_fim_anterior, horario_fim_novo,
    anexo_anterior, anexo_novo, usuario_id, papel_usuario,
    motivo_operacional, observacao, correlation_id
  ) VALUES (
    v_a.id, v_a.protocolo, v_a.empresa_id, v_a.projeto_id, v_a.colaborador_id,
    v_a.tipo_ausencia_id, (SELECT nome FROM public.tipos_ausencia WHERE id = v_a.tipo_ausencia_id), 
    p_tipo_ausencia_id, v_tipo.nome,
    v_a.opcao_periodo_id, v_periodo_anterior_nome,
    p_opcao_periodo_id, v_op.nome,
    v_a.data_inicio, p_data_inicio, v_a.data_fim, v_data_fim,
    v_a.horario_inicio, 
    CASE WHEN v_op.tipo_periodo = 'MEIO_PERIODO' THEN p_horario_inicio::time ELSE NULL END,
    v_a.horario_fim,
    CASE WHEN v_op.tipo_periodo = 'MEIO_PERIODO' THEN p_horario_fim::time ELSE NULL END,
    v_a.possui_anexo, v_possui_anexo, v_uid, v_papel,
    btrim(p_motivo_operacional), nullif(btrim(coalesce(p_observacao,'')),''), v_corr
  );

  UPDATE public.ausencias SET
    tipo_ausencia_id = p_tipo_ausencia_id,
    opcao_periodo_id = p_opcao_periodo_id,
    data_inicio = p_data_inicio,
    data_fim = v_data_fim,
    motivo = coalesce(p_motivo, motivo),
    cid = CASE WHEN v_tipo.permite_cid IS FALSE THEN NULL
               ELSE coalesce(nullif(upper(btrim(coalesce(p_cid,''))),''), cid) END,
    tipo_detalhe = coalesce(nullif(btrim(coalesce(p_tipo_detalhe,'')),''), v_tipo.nome),
    dias_label = v_op.nome,
    arquivo_url = v_arq_path,
    arquivo_nome = v_arq_nome,
    arquivo_mime = v_arq_mime,
    arquivo_tamanho = v_arq_tam,
    arquivo_criado_por = CASE WHEN v_arq_path IS DISTINCT FROM v_a.arquivo_url THEN v_uid ELSE arquivo_criado_por END,
    arquivo_criado_em = CASE WHEN v_arq_path IS DISTINCT FROM v_a.arquivo_url THEN now() ELSE arquivo_criado_em END,
    retificada = true,
    retificada_em = now(),
    retificada_por = v_uid,
    retificacoes_count = coalesce(retificacoes_count,0) + 1,
    e_erro_supervisor = coalesce(e_erro_supervisor, false) OR v_e_erro_real,
    -- CORREÇÃO: Usando a coluna física motivo_exclusao_categoria em vez de motivo_exclusao_categoria_v2
    motivo_exclusao_categoria = coalesce(motivo_exclusao_categoria, p_motivo_categoria),
    motivo_exclusao_detalhe = coalesce(motivo_exclusao_detalhe, p_motivo_operacional),
    horario_inicio = CASE WHEN v_op.tipo_periodo = 'MEIO_PERIODO' THEN p_horario_inicio::time ELSE NULL END,
    horario_fim = CASE WHEN v_op.tipo_periodo = 'MEIO_PERIODO' THEN p_horario_fim::time ELSE NULL END,
    updated_at = now()
  WHERE id = v_a.id;

  PERFORM public.log_audit_event(
    'ausencias', 'AUSENCIA_RETIFICADA'::audit_action, 'ausencias', v_a.id,
    v_a.empresa_id, v_a.projeto_id,
    jsonb_build_object('tipo_id', v_a.tipo_ausencia_id, 'tipo', (SELECT nome FROM public.tipos_ausencia WHERE id = v_a.tipo_ausencia_id), 'periodo_id', v_a.opcao_periodo_id, 'data_inicio', v_a.data_inicio, 'data_fim', v_a.data_fim),
    jsonb_build_object('tipo_id', v_tipo.id, 'tipo', v_tipo.nome, 'periodo_id', v_op.id, 'data_inicio', p_data_inicio, 'data_fim', v_data_fim, 'horario_inicio', p_horario_inicio, 'horario_fim', p_horario_fim)
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
$function$;

GRANT EXECUTE ON FUNCTION public.retificar_ausencia TO authenticated;

-- 2. Recriar excluir_ausencia_segura (v2) para garantir consistência
CREATE OR REPLACE FUNCTION public.excluir_ausencia_segura(
    p_ausencia_id uuid,
    p_motivo text,
    p_categoria_motivo text,
    p_is_error_manual boolean DEFAULT NULL::boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_nome text;
  v_user_papel text;
  v_ausencia record;
  v_categoria_enum public.ausencia_motivo_exclusao_categoria_v2;
  v_is_error boolean;
BEGIN
  -- 1. Obter usuário logado
  v_user_id := auth.uid();
  
  -- 2. Validar permissão (Super Admin ou RH)
  SELECT 
    p.nome, 
    ur.role::text INTO v_user_nome, v_user_papel
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = v_user_id
    AND ur.role IN ('super_admin', 'rh')
  LIMIT 1;

  IF v_user_id IS NULL OR v_user_papel IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Admin e RH podem excluir lançamentos.' 
      USING ERRCODE = '42501';
  END IF;

  -- 3. Verificar existência da ausência
  SELECT * INTO v_ausencia 
  FROM public.ausencias 
  WHERE id = p_ausencia_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ausência não encontrada (ID: %)', p_ausencia_id;
  END IF;

  -- Converter categoria para enum
  BEGIN
    v_categoria_enum := p_categoria_motivo::public.ausencia_motivo_exclusao_categoria_v2;
  EXCEPTION WHEN OTHERS THEN
    v_categoria_enum := 'OUTRO';
  END;

  -- Determinar se é erro do supervisor
  IF v_categoria_enum = 'OUTRO' AND p_is_error_manual IS NOT NULL THEN
    v_is_error := p_is_error_manual;
  ELSE
    v_is_error := public.check_is_error_supervisor(v_categoria_enum);
  END IF;

  -- 4. Aplicar exclusão lógica
  UPDATE public.ausencias
  SET 
    status_documental = 'EXCLUIDO',
    excluida_em = now(),
    excluida_por_usuario_id = v_user_id,
    excluidora_nome_snapshot = v_user_nome,
    excluidora_papel_snapshot = v_user_papel,
    -- CORREÇÃO: Confirmado o uso da coluna física motivo_exclusao_categoria
    motivo_exclusao_categoria = p_categoria_motivo,
    motivo_exclusao_detalhe = p_motivo,
    status = 'CANCELADO',
    e_erro_supervisor = v_is_error
  WHERE id = p_ausencia_id;

  -- 5. Auditoria
  PERFORM public.log_audit_event(
    _modulo := 'ausencias',
    _acao := 'AUSENCIA_EXCLUIDA'::public.audit_action,
    _entidade := 'Ausência',
    _registro_id := p_ausencia_id,
    _empresa_id := v_ausencia.empresa_id,
    _projeto_id := v_ausencia.projeto_id,
    _antes := row_to_json(v_ausencia)::jsonb,
    _depois := jsonb_build_object(
      'status_documental', 'EXCLUIDO',
      'motivo_exclusao_categoria', p_categoria_motivo,
      'motivo_exclusao_detalhe', p_motivo,
      'e_erro_supervisor', v_is_error
    ),
    _sucesso := true,
    _observacoes := 'Exclusão lógica realizada via interface administrativa.',
    _origem := 'rpc'
  );

  RETURN jsonb_build_object(
    'success', true,
    'ausencia_id', p_ausencia_id,
    'status_documental', 'EXCLUIDO',
    'e_erro_supervisor', v_is_error
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.excluir_ausencia_segura(uuid, text, text, boolean) TO authenticated;
