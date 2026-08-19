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
  v_tipo_base text;
  v_arq_path text;
  v_arq_nome text;
  v_arq_mime text;
  v_arq_tam int;
  v_possui_anexo boolean;
  v_corr uuid := gen_random_uuid();
  v_e_erro_real boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: autenticação obrigatória.' USING ERRCODE='insufficient_privilege';
  END IF;
  
  -- Etapa 5 e 6 — Motivo estruturado e justificativa (mínimo 10 chars)
  IF p_motivo_operacional IS NULL OR length(btrim(p_motivo_operacional)) < 10 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: informe a justificativa da retificação (mínimo 10 caracteres).' USING ERRCODE='check_violation';
  END IF;

  -- Etapa 9 — Concorrência (Lock e check de updated_at)
  SELECT * INTO v_a FROM public.ausencias WHERE id = p_ausencia_id FOR UPDATE;
  IF v_a.id IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: ausência não encontrada.' USING ERRCODE='no_data_found';
  END IF;

  IF p_updated_at_check IS NOT NULL AND v_a.updated_at IS DISTINCT FROM p_updated_at_check THEN
    RAISE EXCEPTION 'CONCURRENCY_ERROR: Este lançamento foi alterado por outro usuário. Atualize os dados antes de continuar.' USING ERRCODE='check_violation';
  END IF;

  -- RBAC
  IF public.has_role(v_uid,'super_admin'::app_role) THEN v_papel := 'super_admin';
  ELSIF public.has_role(v_uid,'rh'::app_role) THEN v_papel := 'rh';
  ELSIF public.has_role(v_uid,'coordenador'::app_role) THEN v_papel := 'coordenador';
  ELSIF public.has_role(v_uid,'supervisor'::app_role) THEN v_papel := 'supervisor';
  ELSE
    RAISE EXCEPTION 'PERMISSION_DENIED: perfil sem permissão para retificar.' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Escopo e Prazo (Etapa 2 e Etapa 9)
  IF v_papel IN ('supervisor','coordenador') THEN
    IF NOT public.user_pode_projeto_escopo_manual(v_uid, v_a.projeto_id) THEN
      RAISE EXCEPTION 'PROJECT_SCOPE_DENIED: ausência fora do seu escopo.' USING ERRCODE='insufficient_privilege';
    END IF;
    
    v_prazo_ok := now() <= v_a.created_at + interval '24 hours';
    IF NOT v_prazo_ok THEN
      RAISE EXCEPTION 'PRAZO_EXPIRADO: a janela de 24 horas expirou. Solicite a correção ao RH ou Super Admin.' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;

  -- Validação de Tipo e Período (Etapa 4)
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

  IF NOT EXISTS (
    SELECT 1 FROM public.tipo_ausencia_opcoes_periodo
     WHERE tipo_ausencia_id = p_tipo_ausencia_id
       AND opcao_periodo_id = p_opcao_periodo_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: combinação tipo/período não autorizada.' USING ERRCODE='check_violation';
  END IF;

  -- Validação de Meio Período (Horas)
  IF v_op.tipo_periodo = 'MEIO_PERIODO' THEN
    IF p_horario_inicio IS NULL OR p_horario_fim IS NULL THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: informe o horário inicial e final para meio período.' USING ERRCODE='check_violation';
    END IF;
    IF p_horario_inicio >= p_horario_fim THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: o horário inicial deve ser menor que o horário final.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  v_data_fim := p_data_inicio + (GREATEST(coalesce(v_op.quantidade_dias,1),1) - 1);

  -- Documentos
  v_arq_path := nullif(btrim(coalesce(p_arquivo->>'path','')),'');
  IF v_arq_path IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'atestados' AND o.name = v_arq_path
    ) THEN
      RAISE EXCEPTION 'INVALID_PAYLOAD: arquivo não encontrado no repositório oficial.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  v_possui_anexo := (v_arq_path IS NOT NULL OR v_a.arquivo_url IS NOT NULL);
  IF v_tipo.exige_documento AND NOT v_possui_anexo THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: este tipo de ausência exige anexo de documento.' USING ERRCODE='check_violation';
  END IF;

  v_tipo_base := CASE 
    WHEN v_tipo.codigo LIKE 'ATESTADO%' THEN 'ATESTADO'
    WHEN v_tipo.codigo LIKE 'DECLARACAO%' THEN 'DECLARACAO'
    WHEN v_tipo.codigo LIKE 'FALTA%' THEN 'FALTA'
    WHEN v_tipo.codigo LIKE 'SUSPENSAO%' THEN 'SUSPENSAO'
    ELSE 'OUTROS'
  END;

  v_e_erro_real := coalesce(p_e_erro_supervisor, v_a.e_erro_supervisor, false);

  -- Persistência Transacional (Etapa 10)
  UPDATE public.ausencias
     SET tipo_ausencia_id = p_tipo_ausencia_id,
         opcao_periodo_id = p_opcao_periodo_id,
         data_inicio = p_data_inicio,
         data_fim = v_data_fim,
         motivo = p_motivo,
         cid = CASE WHEN v_tipo.permite_cid THEN p_cid ELSE NULL END,
         tipo_detalhe = p_tipo_detalhe,
         tipo_base = v_tipo_base,
         arquivo_url = coalesce(v_arq_path, arquivo_url),
         arquivo_nome = coalesce(p_arquivo->>'nome', arquivo_nome),
         arquivo_mime = coalesce(p_arquivo->>'mime', arquivo_mime),
         arquivo_tamanho = (coalesce(p_arquivo->>'tamanho', '0'))::bigint,
         horario_inicio = p_horario_inicio,
         horario_fim = p_horario_fim,
         e_erro_supervisor = v_e_erro_real,
         updated_at = now(),
         retificado_em = now(),
         retificado_por_usuario_id = v_uid
   WHERE id = p_ausencia_id;

  -- Histórico (Etapa 11)
  INSERT INTO public.ausencia_retificacoes (
    ausencia_id,
    protocolo,
    usuario_id,
    papel_usuario,
    tipo_anterior_id,
    tipo_novo_id,
    periodo_anterior_id,
    periodo_novo_id,
    data_inicio_anterior,
    data_inicio_nova,
    data_fim_anterior,
    data_fim_nova,
    motivo_operacional,
    motivo_categoria,
    observacao,
    correlation_id
  ) VALUES (
    p_ausencia_id,
    v_a.protocolo,
    v_uid,
    v_papel,
    v_a.tipo_ausencia_id,
    p_tipo_ausencia_id,
    v_a.opcao_periodo_id,
    p_opcao_periodo_id,
    v_a.data_inicio,
    p_data_inicio,
    v_a.data_fim,
    v_data_fim,
    p_motivo_operacional,
    p_motivo_categoria,
    p_observacao,
    v_corr
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ausencia_id', p_ausencia_id,
    'protocolo', v_a.protocolo,
    'tipo_novo', v_tipo.nome,
    'data_inicio', p_data_inicio,
    'data_fim', v_data_fim,
    'correlation_id', v_corr
  );
END;
$function$;