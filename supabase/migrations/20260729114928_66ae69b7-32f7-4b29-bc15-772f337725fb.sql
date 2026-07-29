-- 1) Anti-duplicidade normalizada (preserva zeros à esquerda; compara sem espaços e em caixa alta)
CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_empresa_matricula_norm_uidx
  ON public.colaboradores (empresa_id, public.normalize_matricula(matricula));

-- 2) RPC de lançamento manual — endurecida e retrocompatível (mesma assinatura)
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
  v_criado boolean := false;
  v_a public.ausencias%ROWTYPE;
  v_new_id uuid;
  v_protocolo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_empresa IS NULL OR v_projeto IS NULL OR coalesce(v_matricula,'') = '' OR v_nome IS NULL THEN
    RAISE EXCEPTION 'dados obrigatórios ausentes para o colaborador manual';
  END IF;

  -- Chave canônica de identidade: (empresa_id, matricula normalizada). Nunca o nome.
  SELECT id INTO v_colab_id
  FROM public.colaboradores
  WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
  LIMIT 1;

  -- Resolve o supervisor pela chave oficial (e-mail -> profiles) quando não informado.
  IF v_colab_id IS NULL AND v_sup_usuario IS NULL AND v_sup_email IS NOT NULL THEN
    BEGIN
      v_sup_usuario := public.resolve_supervisor_usuario_id(v_sup_email);
    EXCEPTION WHEN OTHERS THEN
      v_sup_usuario := NULL;
    END;
  END IF;

  IF v_colab_id IS NULL THEN
    BEGIN
      INSERT INTO public.colaboradores (
        empresa_id, projeto_id, matricula, nome_completo, telefone, whatsapp, email,
        supervisor_nome, supervisor_telefone, supervisor_email, supervisor_usuario_id, ativo, origem
      ) VALUES (
        v_empresa, v_projeto, v_matricula, v_nome,
        nullif(_colaborador->>'telefone',''),
        nullif(_colaborador->>'whatsapp',''),
        nullif(_colaborador->>'email',''),
        nullif(_colaborador->>'supervisor_nome',''),
        nullif(_colaborador->>'supervisor_telefone',''),
        v_sup_email,
        v_sup_usuario,
        true, 'MANUAL'
      )
      RETURNING id INTO v_colab_id;
      v_criado := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_colab_id
      FROM public.colaboradores
      WHERE empresa_id = v_empresa AND normalize_matricula(matricula) = v_matricula
      LIMIT 1;
      v_criado := false;
    END;
  END IF;

  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível criar ou localizar o colaborador';
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
$function$;

REVOKE ALL ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) TO authenticated;

-- 3) Rotina administrativa: SOMENTE PRÉVIA (nenhum backfill automático)
CREATE OR REPLACE FUNCTION public.ausencias_manuais_orfas_sugestoes()
 RETURNS TABLE (
   matricula_normalizada text,
   empresa_id uuid,
   empresa_nome text,
   projeto_ids uuid[],
   projeto_nome text,
   nomes text[],
   supervisores text[],
   ausencia_ids uuid[],
   protocolos text[],
   total integer,
   colaborador_existente_id uuid,
   colaborador_existente_nome text,
   consistente boolean
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH permitido AS (
    SELECT (auth.uid() IS NOT NULL
            AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh'))) AS ok
  ),
  base AS (
    SELECT
      public.normalize_matricula(a.manual_matricula) AS mat,
      a.empresa_id,
      a.projeto_id,
      btrim(a.manual_nome) AS nome,
      btrim(coalesce(a.manual_supervisor_nome,'')) AS supervisor,
      a.id,
      a.protocolo
    FROM public.ausencias a, permitido p
    WHERE p.ok
      AND a.origem_registro = 'MANUAL'
      AND a.colaborador_id IS NULL
      AND coalesce(btrim(a.manual_matricula),'') <> ''
      AND coalesce(btrim(a.manual_nome),'') <> ''
  ),
  agrupado AS (
    SELECT
      b.mat,
      b.empresa_id,
      array_agg(DISTINCT b.projeto_id) AS projeto_ids,
      array_agg(DISTINCT b.nome) AS nomes,
      array_agg(DISTINCT b.supervisor) FILTER (WHERE b.supervisor <> '') AS supervisores,
      array_agg(b.id) AS ausencia_ids,
      array_agg(b.protocolo) AS protocolos,
      count(*)::int AS total
    FROM base b
    GROUP BY b.mat, b.empresa_id
  )
  SELECT
    g.mat,
    g.empresa_id,
    e.nome,
    g.projeto_ids,
    (SELECT pr.nome FROM public.projetos pr WHERE pr.id = g.projeto_ids[1]),
    g.nomes,
    coalesce(g.supervisores, ARRAY[]::text[]),
    g.ausencia_ids,
    g.protocolos,
    g.total,
    c.id,
    c.nome_completo,
    (array_length(g.projeto_ids,1) = 1
      AND array_length(g.nomes,1) = 1
      AND coalesce(array_length(g.supervisores,1),1) = 1) AS consistente
  FROM agrupado g
  JOIN public.empresas e ON e.id = g.empresa_id
  LEFT JOIN public.colaboradores c
    ON c.empresa_id = g.empresa_id
   AND public.normalize_matricula(c.matricula) = g.mat
  ORDER BY g.total DESC, g.mat;
$function$;

REVOKE ALL ON FUNCTION public.ausencias_manuais_orfas_sugestoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ausencias_manuais_orfas_sugestoes() TO authenticated;

-- 4) Rotina administrativa: vínculo histórico SOB CONFIRMAÇÃO explícita
CREATE OR REPLACE FUNCTION public.vincular_ausencias_manuais_historico(
  _matricula text,
  _empresa_id uuid,
  _ausencia_ids uuid[],
  _confirmar boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mat text := normalize_matricula(_matricula);
  v_colab_id uuid;
  v_criado boolean := false;
  v_ref record;
  v_afetadas int := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _confirmar IS NOT TRUE THEN
    RAISE EXCEPTION 'confirmação administrativa obrigatória';
  END IF;
  IF coalesce(v_mat,'') = '' OR _empresa_id IS NULL OR coalesce(array_length(_ausencia_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'dados obrigatórios ausentes';
  END IF;

  -- Referência: apenas ausências manuais SEM vínculo, da matrícula/empresa informadas.
  SELECT a.projeto_id, btrim(a.manual_nome) AS nome, a.manual_telefone, a.manual_whatsapp,
         a.manual_email, a.manual_supervisor_nome, a.manual_supervisor_telefone
    INTO v_ref
  FROM public.ausencias a
  WHERE a.id = ANY(_ausencia_ids)
    AND a.origem_registro = 'MANUAL'
    AND a.colaborador_id IS NULL
    AND a.empresa_id = _empresa_id
    AND public.normalize_matricula(a.manual_matricula) = v_mat
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'nenhuma ausência elegível para vínculo';
  END IF;

  SELECT id INTO v_colab_id
  FROM public.colaboradores
  WHERE empresa_id = _empresa_id AND normalize_matricula(matricula) = v_mat
  LIMIT 1;

  IF v_colab_id IS NULL THEN
    INSERT INTO public.colaboradores (
      empresa_id, projeto_id, matricula, nome_completo, telefone, whatsapp, email,
      supervisor_nome, supervisor_telefone, ativo, origem
    ) VALUES (
      _empresa_id, v_ref.projeto_id, v_mat, v_ref.nome,
      v_ref.manual_telefone, v_ref.manual_whatsapp, v_ref.manual_email,
      v_ref.manual_supervisor_nome, v_ref.manual_supervisor_telefone,
      true, 'MANUAL'
    )
    RETURNING id INTO v_colab_id;
    v_criado := true;
  END IF;

  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível criar ou localizar o colaborador';
  END IF;

  -- Nunca sobrescreve vínculo existente; snapshot manual_* é preservado.
  UPDATE public.ausencias a
     SET colaborador_id = v_colab_id, updated_at = now()
   WHERE a.id = ANY(_ausencia_ids)
     AND a.origem_registro = 'MANUAL'
     AND a.colaborador_id IS NULL
     AND a.empresa_id = _empresa_id
     AND public.normalize_matricula(a.manual_matricula) = v_mat;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;

  PERFORM public.log_audit_event(
    'ausencias', 'AUSENCIA_EDITADA'::audit_action, 'Ausencia', NULL,
    _empresa_id, v_ref.projeto_id,
    jsonb_build_object('colaborador_id', NULL, 'matricula', v_mat),
    jsonb_build_object(
      'colaborador_id', v_colab_id,
      'colaborador_criado', v_criado,
      'ausencias_vinculadas', v_afetadas,
      'ausencia_ids', to_jsonb(_ausencia_ids)
    ),
    true,
    'vínculo histórico de ausências manuais confirmado por administrador',
    'rpc'
  );

  RETURN jsonb_build_object(
    'colaborador_id', v_colab_id,
    'colaborador_criado', v_criado,
    'ausencias_vinculadas', v_afetadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.vincular_ausencias_manuais_historico(text, uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vincular_ausencias_manuais_historico(text, uuid, uuid[], boolean) TO authenticated;