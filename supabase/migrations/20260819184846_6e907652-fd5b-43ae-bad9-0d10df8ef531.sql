-- FASE 2: MIGRATION DE ESQUEMA E RPC (RODADA 3 — INCIDENTE RETIFICAÇÃO)
-- Adiciona colunas de histórico e ajusta a RPC para persistência forense de horários.

ALTER TABLE public.ausencia_retificacoes 
ADD COLUMN IF NOT EXISTS horario_inicio_anterior time without time zone,
ADD COLUMN IF NOT EXISTS horario_inicio_novo time without time zone,
ADD COLUMN IF NOT EXISTS horario_fim_anterior time without time zone,
ADD COLUMN IF NOT EXISTS horario_fim_novo time without time zone;

GRANT SELECT, INSERT ON public.ausencia_retificacoes TO authenticated;
GRANT ALL ON public.ausencia_retificacoes TO service_role;

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

  v_data_fim := p_data_inicio + (v_op.quantidade_dias - 1);
  
  SELECT nome INTO v_periodo_anterior_nome FROM public.opcoes_periodo_ausencia WHERE id = v_a.opcao_periodo_id;

  INSERT INTO public.ausencia_retificacoes (
    ausencia_id, protocolo, empresa_id, projeto_id, colaborador_id,
    tipo_anterior_id, tipo_anterior_nome, tipo_novo_id, tipo_novo_nome,
    periodo_anterior_id, periodo_anterior_nome, periodo_novo_id, periodo_novo_nome,
    data_inicio_anterior, data_inicio_nova, data_fim_anterior, data_fim_nova,
    horario_inicio_anterior, horario_inicio_novo, horario_fim_anterior, horario_fim_novo,
    usuario_id, papel_usuario, motivo_operacional, observacao, correlation_id
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
    v_uid, v_papel, p_motivo_operacional, p_observacao, v_corr
  );

  UPDATE public.ausencias SET
    tipo_ausencia_id = p_tipo_ausencia_id,
    opcao_periodo_id = p_opcao_periodo_id,
    data_inicio = p_data_inicio,
    data_fim = v_data_fim,
    motivo = p_motivo,
    cid = p_cid,
    tipo_detalhe = p_tipo_detalhe,
    observacao = p_observacao,
    updated_at = now(),
    updated_by = v_uid,
    motivo_categoria = p_motivo_categoria,
    e_erro_supervisor = p_e_erro_supervisor,
    horario_inicio = CASE WHEN v_op.tipo_periodo = 'MEIO_PERIODO' THEN p_horario_inicio::time ELSE NULL END,
    horario_fim = CASE WHEN v_op.tipo_periodo = 'MEIO_PERIODO' THEN p_horario_fim::time ELSE NULL END
  WHERE id = v_a.id;

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
