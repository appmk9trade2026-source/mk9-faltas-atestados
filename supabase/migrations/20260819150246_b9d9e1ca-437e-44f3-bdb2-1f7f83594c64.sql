CREATE OR REPLACE FUNCTION public.criar_ocorrencia_ponto_ambev(
  _empresa_id uuid,
  _projeto_id uuid,
  _colaborador_id uuid,
  _colaborador_manual boolean,
  _manual_matricula text,
  _manual_nome text,
  _supervisor_usuario_id uuid,
  _data_ocorrencia date,
  _motivo text,
  _justificativa text,
  _arquivo_url text,
  _arquivo_nome text,
  _registrado_por uuid,
  _correlation_id text DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ocorrencia_id UUID;
  v_ausencia_id UUID;
  v_protocolo_ocp TEXT;
  v_protocolo_aus TEXT;
  v_result JSON;
  v_existing_id UUID;
  v_existing_protocolo TEXT;
  v_existing_ausencia_id UUID;
  v_existing_ausencia_protocolo TEXT;
BEGIN
  -- 1. Verificar idempotência se correlation_id for fornecido
  IF _correlation_id IS NOT NULL THEN
    SELECT id, protocolo, ausencia_id 
    INTO v_existing_id, v_existing_protocolo, v_existing_ausencia_id
    FROM public.ocorrencias_ponto 
    WHERE correlation_id = _correlation_id;

    IF v_existing_id IS NOT NULL THEN
      -- Buscar protocolo da ausência vinculada
      SELECT protocolo INTO v_existing_ausencia_protocolo
      FROM public.ausencias
      WHERE id = v_existing_ausencia_id;

      RETURN json_build_object(
        'id', v_existing_id,
        'protocolo', v_existing_protocolo,
        'ausencia_id', v_existing_ausencia_id,
        'ausencia_protocolo', v_existing_ausencia_protocolo,
        'idempotency_replay', true
      );
    END IF;
  END IF;

  -- 2. Inserir a Ocorrência
  INSERT INTO public.ocorrencias_ponto (
    empresa_id, projeto_id, colaborador_id, colaborador_manual,
    manual_matricula, manual_nome, supervisor_usuario_id,
    data_ocorrencia, motivo, justificativa, arquivo_url, arquivo_nome,
    registrado_por, status, correlation_id
  ) VALUES (
    _empresa_id, _projeto_id, _colaborador_id, _colaborador_manual,
    _manual_matricula, _manual_nome, _supervisor_usuario_id,
    _data_ocorrencia, _motivo, _justificativa, _arquivo_url, _arquivo_nome,
    _registrado_por, 'PENDENTE', _correlation_id
  )
  RETURNING id, protocolo INTO v_ocorrencia_id, v_protocolo_ocp;

  -- 3. Criar a Ausência correspondente
  INSERT INTO public.ausencias (
    empresa_id, projeto_id, colaborador_id,
    manual_nome, manual_matricula, 
    data_inicio, data_fim,
    tipo, status_documental, status_rh, status_processamento,
    origem_registro, registrado_por, motivo,
    arquivo_url, arquivo_nome,
    possui_anexo
  ) VALUES (
    _empresa_id, _projeto_id, _colaborador_id,
    _manual_nome, _manual_matricula,
    _data_ocorrencia, _data_ocorrencia,
    'FALTA', 'ATIVO', 'PENDENTE', 'AGUARDANDO',
    'OCORRENCIA_PONTO_AMBEV', _registrado_por, 
    'Gerado via Ocorrência de Ponto: ' || v_protocolo_ocp || ' - ' || _motivo,
    _arquivo_url, _arquivo_nome,
    (_arquivo_url IS NOT NULL)
  )
  RETURNING id, protocolo INTO v_ausencia_id, v_protocolo_aus;

  -- 4. Vincular a ausência à ocorrência
  UPDATE public.ocorrencias_ponto
  SET ausencia_id = v_ausencia_id
  WHERE id = v_ocorrencia_id;

  v_result := json_build_object(
    'id', v_ocorrencia_id,
    'protocolo', v_protocolo_ocp,
    'ausencia_id', v_ausencia_id,
    'ausencia_protocolo', v_protocolo_aus,
    'idempotency_replay', false
  );

  RETURN v_result;
END;
$function$;
