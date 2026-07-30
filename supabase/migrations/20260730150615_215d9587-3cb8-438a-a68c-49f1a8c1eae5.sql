-- 1) Defeito: v_tipo não continha permite_cid, causando erro em toda retificação.
CREATE OR REPLACE FUNCTION public.retificar_ausencia(p_ausencia_id uuid, p_tipo_ausencia_id uuid, p_opcao_periodo_id uuid, p_data_inicio date, p_motivo_operacional text, p_motivo text DEFAULT NULL::text, p_cid text DEFAULT NULL::text, p_tipo_detalhe text DEFAULT NULL::text, p_arquivo jsonb DEFAULT NULL::jsonb, p_observacao text DEFAULT NULL::text)
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
$function$;

-- 2) Defeito: faltava GRANT básico na tabela de histórico (RLS já restringe o escopo).
GRANT SELECT ON public.ausencia_retificacoes TO authenticated;
GRANT ALL ON public.ausencia_retificacoes TO service_role;
