-- CRM MK9 — HARDENING DE VÍNCULO DO COLABORADOR
-- Objetivo: Garantir que cada colaborador esteja vinculado a exatamente um projeto e um supervisor.
-- Impede trocas silenciosas de projeto ou supervisor durante o lançamento manual de ausências.

CREATE OR REPLACE FUNCTION public.registrar_ausencia_com_colaborador_manual(_colaborador jsonb, _ausencia jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa uuid := (_colaborador->>'empresa_id')::uuid;
  v_projeto uuid := (_colaborador->>'projeto_id')::uuid;
  v_matricula text := normalize_matricula(_colaborador->>'matricula');
  v_nome text := nullif(btrim(_colaborador->>'nome_completo'), '');
  v_sup_usuario uuid := nullif(_colaborador->>'supervisor_usuario_id','')::uuid;
  v_sup_email text := lower(nullif(btrim(_colaborador->>'supervisor_email'), ''));
  v_colab_id uuid;
  v_colab_projeto_id uuid;
  v_colab_sup_id uuid;
  v_criado boolean := false;
  v_new_id uuid;
  v_protocolo text;
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
  v_is_coordenador boolean;
  v_is_priv boolean;
  v_tipo public.tipo_ausencia;
  -- Novos campos de horário
  v_horario_inicio time without time zone := nullif(_ausencia->>'horario_inicio', '')::time without time zone;
  v_horario_fim time without time zone := nullif(_ausencia->>'horario_fim', '')::time without time zone;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  
  IF v_empresa IS NULL OR v_projeto IS NULL OR coalesce(v_matricula,'') = '' OR v_nome IS NULL THEN
    RAISE EXCEPTION 'dados obrigatórios ausentes para o colaborador manual';
  END IF;

  v_tipo := (_ausencia->>'tipo')::public.tipo_ausencia;

  v_is_supervisor := public.has_role(v_uid, 'supervisor'::app_role);
  v_is_coordenador := public.has_role(v_uid, 'coordenador'::app_role);
  v_is_priv := public.has_role(v_uid, 'super_admin'::app_role) 
            OR public.has_role(v_uid, 'rh'::app_role)
            OR public.has_role(v_uid, 'compliance'::app_role);

  IF NOT public.check_projeto_empresa_match(v_projeto, v_empresa) THEN
    RAISE EXCEPTION 'Projeto não pertence à empresa informada.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_priv AND NOT public.user_pode_projeto_escopo_manual(v_uid, v_projeto) THEN
     RAISE EXCEPTION 'PROJETO_FORA_DO_ESCOPO: O projeto selecionado não pertence ao seu escopo.' USING ERRCODE = '42501';
  END IF;

  -- 1. Verificar se a matrícula já existe na empresa (Mestre de Colaboradores)
  SELECT id, projeto_id, supervisor_usuario_id INTO v_colab_id, v_colab_projeto_id, v_colab_sup_id
  FROM public.colaboradores
  WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
  LIMIT 1;

  -- 2. Resolver o supervisor do lançamento
  IF v_sup_usuario IS NULL AND v_sup_email IS NOT NULL THEN
    v_sup_usuario := public.resolve_supervisor_usuario_id(v_sup_email);
  END IF;

  IF v_is_supervisor AND NOT v_is_priv AND NOT v_is_coordenador THEN
    v_sup_usuario := v_uid;
  END IF;

  -- Se não informado, tenta herdar do cadastro existente (se houver)
  IF v_sup_usuario IS NULL AND v_colab_id IS NOT NULL THEN
    v_sup_usuario := v_colab_sup_id;
  END IF;

  IF v_sup_usuario IS NULL AND v_is_coordenador AND NOT v_is_priv THEN
    v_sup_usuario := v_uid;
  END IF;

  -- 3. Aplicar Regras de Hardening de Vínculo
  IF v_colab_id IS NOT NULL THEN
    -- CENÁRIO C: Matrícula existe em outro projeto
    IF v_colab_projeto_id IS NOT NULL AND v_colab_projeto_id <> v_projeto THEN
      RAISE EXCEPTION 'Esta matrícula já está vinculada a outro projeto. Regularize o vínculo antes de continuar.' USING ERRCODE = 'P0001';
    END IF;

    -- CENÁRIO D: Matrícula existe com outro supervisor
    IF v_colab_sup_id IS NOT NULL AND v_sup_usuario IS NOT NULL AND v_colab_sup_id <> v_sup_usuario THEN
      RAISE EXCEPTION 'Esta matrícula já está vinculada a outro supervisor. Regularize o vínculo antes de continuar.' USING ERRCODE = 'P0001';
    END IF;

    -- Reutiliza colaborador_id (CENÁRIO B)
    -- Atualiza apenas campos não críticos (CENÁRIO E: Nome diferente não duplica, mantém o mestre)
    UPDATE public.colaboradores SET
      -- Não alteramos nome_completo, projeto_id ou supervisor_usuario_id silenciosamente se já existirem
      telefone = COALESCE(nullif(btrim(_colaborador->>'telefone'), ''), telefone),
      whatsapp = COALESCE(nullif(btrim(_colaborador->>'whatsapp'), ''), whatsapp),
      email = COALESCE(lower(nullif(btrim(_colaborador->>'email'), '')), email),
      supervisor_nome = COALESCE(_colaborador->>'supervisor_nome', supervisor_nome),
      supervisor_telefone = COALESCE(_colaborador->>'supervisor_telefone', supervisor_telefone),
      ativo = true
    WHERE id = v_colab_id;
    
  ELSE
    -- CENÁRIO A: Matrícula nova (Criação)
    INSERT INTO public.colaboradores (
      empresa_id, projeto_id, matricula, nome_completo, 
      telefone, whatsapp, email, 
      supervisor_nome, supervisor_telefone, supervisor_usuario_id,
      origem, ativo
    ) VALUES (
      v_empresa, v_projeto, v_matricula, v_nome,
      nullif(btrim(_colaborador->>'telefone'), ''), 
      nullif(btrim(_colaborador->>'whatsapp'), ''),
      lower(nullif(btrim(_colaborador->>'email'), '')),
      _colaborador->>'supervisor_nome',
      _colaborador->>'supervisor_telefone',
      v_sup_usuario,
      'MANUAL', true
    ) RETURNING id INTO v_colab_id;
    v_criado := true;
  END IF;

  v_new_id := gen_random_uuid();
  
  -- 4. Registrar a Ausência (Snapshot preserva os dados do lançamento)
  INSERT INTO public.ausencias (
    id, colaborador_id, empresa_id, projeto_id, 
    tipo, tipo_detalhe, dias_label, 
    tipo_ausencia_id, opcao_periodo_id, 
    motivo, data_inicio, data_fim, 
    localidade, loja_codigo_nome, cid,
    acidente_trabalho_trajeto, acidente_hora,
    manual_nome, manual_matricula, manual_motivo,
    origem_registro, operacao_origem,
    horario_inicio, horario_fim
  ) VALUES (
    v_new_id, v_colab_id, v_empresa, v_projeto,
    v_tipo, _ausencia->>'tipo_detalhe', _ausencia->>'dias_label',
    (_ausencia->>'tipo_ausencia_id')::uuid, (_ausencia->>'opcao_periodo_id')::uuid,
    _ausencia->>'motivo', (_ausencia->>'data_inicio')::date, (_ausencia->>'data_fim')::date,
    _ausencia->>'localidade', _ausencia->>'loja_codigo_nome', _ausencia->>'cid',
    (_ausencia->>'acidente_trabalho_trajeto')::boolean, nullif(_ausencia->>'acidente_hora', '')::time,
    v_nome, v_matricula, _ausencia->>'motivo',
    'MANUAL', 'WEB',
    v_horario_inicio, v_horario_fim
  ) RETURNING protocolo INTO v_protocolo;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'protocolo', v_protocolo,
    'colaborador_id', v_colab_id,
    'colaborador_criado', v_criado
  );
END;
$function$;
