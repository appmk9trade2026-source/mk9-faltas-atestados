CREATE OR REPLACE FUNCTION public.criar_ocorrencia_ponto_ambev(
  _empresa_id UUID,
  _projeto_id UUID,
  _colaborador_id UUID,
  _colaborador_manual BOOLEAN,
  _manual_matricula TEXT,
  _manual_nome TEXT,
  _supervisor_usuario_id UUID,
  _data_ocorrencia DATE,
  _motivo TEXT,
  _justificativa TEXT,
  _arquivo_url TEXT,
  _arquivo_nome TEXT,
  _registrado_por UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ocorrencia_id UUID;
  v_ausencia_id UUID;
  v_protocolo_ocp TEXT;
  v_protocolo_aus TEXT;
  v_result JSON;
BEGIN
  -- 1. Inserir a Ocorrência primeiro para gerar o protocolo OCP
  INSERT INTO public.ocorrencias_ponto (
    empresa_id, projeto_id, colaborador_id, colaborador_manual,
    manual_matricula, manual_nome, supervisor_usuario_id,
    data_ocorrencia, motivo, justificativa, arquivo_url, arquivo_nome,
    registrado_por, status
  ) VALUES (
    _empresa_id, _projeto_id, _colaborador_id, _colaborador_manual,
    _manual_matricula, _manual_nome, _supervisor_usuario_id,
    _data_ocorrencia, _motivo, _justificativa, _arquivo_url, _arquivo_nome,
    _registrado_por, 'PENDENTE'
  )
  RETURNING id, protocolo INTO v_ocorrencia_id, v_protocolo_ocp;

  -- 2. Criar a Ausência correspondente (Invariável P0)
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

  -- 3. Vincular a ausência à ocorrência
  UPDATE public.ocorrencias_ponto
  SET ausencia_id = v_ausencia_id
  WHERE id = v_ocorrencia_id;

  v_result := json_build_object(
    'id', v_ocorrencia_id,
    'protocolo', v_protocolo_ocp,
    'ausencia_id', v_ausencia_id,
    'ausencia_protocolo', v_protocolo_aus
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_ocorrencia_ponto_ambev TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ausencias TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ocorrencias_ponto TO authenticated;
