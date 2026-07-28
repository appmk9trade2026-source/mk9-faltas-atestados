-- 1) Permite que ausência MANUAL fique vinculada a um colaborador (criado automaticamente).
ALTER TABLE public.ausencias DROP CONSTRAINT IF EXISTS ausencias_origem_coerencia_chk;
ALTER TABLE public.ausencias ADD CONSTRAINT ausencias_origem_coerencia_chk CHECK (
  ((origem_registro = 'AUTOMATICO' AND colaborador_id IS NOT NULL)
   OR (origem_registro = 'MANUAL' AND manual_nome IS NOT NULL AND manual_matricula IS NOT NULL AND manual_motivo IS NOT NULL))
);

-- 2) Origem do cadastro do colaborador
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'CADASTRO';

-- 3) RPC transacional: localiza ou cria o colaborador e registra a ausência vinculada.
--    SECURITY INVOKER → RLS/escopo do usuário continuam valendo integralmente.
CREATE OR REPLACE FUNCTION public.registrar_ausencia_com_colaborador_manual(
  _colaborador jsonb,
  _ausencia jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid := (_colaborador->>'empresa_id')::uuid;
  v_projeto uuid := (_colaborador->>'projeto_id')::uuid;
  v_matricula text := normalize_matricula(_colaborador->>'matricula');
  v_colab_id uuid;
  v_criado boolean := false;
  v_a public.ausencias%ROWTYPE;
  v_new_id uuid;
  v_protocolo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_empresa IS NULL OR v_projeto IS NULL OR coalesce(v_matricula,'') = '' THEN
    RAISE EXCEPTION 'dados obrigatórios ausentes para o colaborador manual';
  END IF;

  -- Unicidade real do banco: (empresa_id, matricula)
  SELECT id INTO v_colab_id
  FROM public.colaboradores
  WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
  LIMIT 1;

  IF v_colab_id IS NULL THEN
    BEGIN
      INSERT INTO public.colaboradores (
        empresa_id, projeto_id, matricula, nome_completo, telefone, whatsapp, email,
        supervisor_nome, supervisor_telefone, supervisor_usuario_id, ativo, origem
      ) VALUES (
        v_empresa, v_projeto, v_matricula,
        _colaborador->>'nome_completo',
        nullif(_colaborador->>'telefone',''),
        nullif(_colaborador->>'whatsapp',''),
        nullif(_colaborador->>'email',''),
        nullif(_colaborador->>'supervisor_nome',''),
        nullif(_colaborador->>'supervisor_telefone',''),
        nullif(_colaborador->>'supervisor_usuario_id','')::uuid,
        true, 'MANUAL'
      )
      RETURNING id INTO v_colab_id;
      v_criado := true;
    EXCEPTION WHEN unique_violation THEN
      -- corrida entre consulta e inserção → reaproveita o registro existente
      SELECT id INTO v_colab_id
      FROM public.colaboradores
      WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
      LIMIT 1;
      v_criado := false;
    END;
  END IF;

  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'não foi possível salvar o colaborador';
  END IF;

  v_a := jsonb_populate_record(NULL::public.ausencias, _ausencia);

  INSERT INTO public.ausencias (
    empresa_id, projeto_id, colaborador_id, origem_registro,
    manual_motivo, manual_motivo_detalhe, manual_nome, manual_matricula,
    manual_telefone, manual_whatsapp, manual_email,
    manual_supervisor_nome, manual_supervisor_telefone,
    manual_registrado_por, manual_registrado_em,
    tipo, tipo_detalhe, dias_label, tipo_ausencia_id, opcao_periodo_id,
    motivo, data_inicio, data_fim, localidade, loja_codigo_nome, cid,
    acidente_trabalho_trajeto, arquivo_url, arquivo_nome, arquivo_mime,
    arquivo_tamanho, arquivo_criado_por, arquivo_criado_em,
    acidente_data, acidente_hora, acidente_local, acidente_descricao,
    acidente_atendimento_medico, acidente_houve_afastamento,
    acidente_dias_afastamento_inicial, acidente_cat_emitida, acidente_observacoes
  ) VALUES (
    v_empresa, v_projeto, v_colab_id, 'MANUAL',
    v_a.manual_motivo, v_a.manual_motivo_detalhe, v_a.manual_nome, v_a.manual_matricula,
    v_a.manual_telefone, v_a.manual_whatsapp, v_a.manual_email,
    v_a.manual_supervisor_nome, v_a.manual_supervisor_telefone,
    auth.uid(), now(),
    v_a.tipo, v_a.tipo_detalhe, v_a.dias_label, v_a.tipo_ausencia_id, v_a.opcao_periodo_id,
    v_a.motivo, v_a.data_inicio, v_a.data_fim, v_a.localidade, v_a.loja_codigo_nome, v_a.cid,
    coalesce(v_a.acidente_trabalho_trajeto,false), v_a.arquivo_url, v_a.arquivo_nome, v_a.arquivo_mime,
    v_a.arquivo_tamanho, v_a.arquivo_criado_por, v_a.arquivo_criado_em,
    v_a.acidente_data, v_a.acidente_hora, v_a.acidente_local, v_a.acidente_descricao,
    v_a.acidente_atendimento_medico, v_a.acidente_houve_afastamento,
    v_a.acidente_dias_afastamento_inicial, v_a.acidente_cat_emitida, v_a.acidente_observacoes
  )
  RETURNING id, protocolo INTO v_new_id, v_protocolo;

  RETURN jsonb_build_object(
    'colaborador_id', v_colab_id,
    'colaborador_criado', v_criado,
    'ausencia_id', v_new_id,
    'protocolo', v_protocolo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) TO authenticated;