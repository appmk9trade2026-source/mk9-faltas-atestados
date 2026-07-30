-- 1) INSERT policies escopadas para supervisor e coordenador em colaboradores.
--    Antes existiam apenas colaboradores_rh_insert e colaboradores_super_admin_insert,
--    portanto o INSERT do fluxo manual era negado por default-deny do RLS.

CREATE POLICY colaboradores_supervisor_manual_insert
ON public.colaboradores
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND origem = 'MANUAL'
  AND ativo = true
  AND supervisor_usuario_id = auth.uid()
  AND projeto_id IS NOT NULL
  AND public.user_has_projeto(auth.uid(), projeto_id)
  AND EXISTS (
    SELECT 1 FROM public.projetos p
    WHERE p.id = colaboradores.projeto_id
      AND p.empresa_id = colaboradores.empresa_id
  )
);

CREATE POLICY colaboradores_coordenador_manual_insert
ON public.colaboradores
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'coordenador'::app_role)
  AND origem = 'MANUAL'
  AND ativo = true
  AND supervisor_usuario_id IS NOT NULL
  AND projeto_id IS NOT NULL
  AND public.user_has_projeto(auth.uid(), projeto_id)
  AND (
    supervisor_usuario_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles pf
      WHERE pf.id = colaboradores.supervisor_usuario_id
        AND pf.coordenador_usuario_id = auth.uid()
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.projetos p
    WHERE p.id = colaboradores.projeto_id
      AND p.empresa_id = colaboradores.empresa_id
  )
);

-- 2) A RPC continua SECURITY INVOKER (RLS deve avaliar o escopo real do chamador).
--    Ajuste mínimo: quando o chamador é supervisor e nenhum supervisor foi resolvido,
--    o colaborador é vinculado ao próprio supervisor autenticado; e a empresa passa a
--    ser validada contra o projeto informado.
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
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
  v_is_coordenador boolean;
  v_is_priv boolean;
  v_projeto_empresa uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_empresa IS NULL OR v_projeto IS NULL OR coalesce(v_matricula,'') = '' OR v_nome IS NULL THEN
    RAISE EXCEPTION 'dados obrigatórios ausentes para o colaborador manual';
  END IF;

  v_is_supervisor := public.has_role(v_uid, 'supervisor'::app_role);
  v_is_coordenador := public.has_role(v_uid, 'coordenador'::app_role);
  v_is_priv := public.has_role(v_uid, 'super_admin'::app_role)
            OR public.has_role(v_uid, 'rh'::app_role);

  -- Empresa deve ser coerente com o projeto informado (evita cross-tenant).
  SELECT p.empresa_id INTO v_projeto_empresa FROM public.projetos p WHERE p.id = v_projeto;
  IF v_projeto_empresa IS NULL OR v_projeto_empresa <> v_empresa THEN
    RAISE EXCEPTION 'Projeto não pertence à empresa informada.' USING ERRCODE = '42501';
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

  -- Supervisor não privilegiado só pode criar colaborador vinculado a si mesmo.
  IF v_is_supervisor AND NOT v_is_priv AND NOT v_is_coordenador THEN
    v_sup_usuario := v_uid;
  ELSIF v_colab_id IS NULL AND v_sup_usuario IS NULL AND v_is_coordenador AND NOT v_is_priv THEN
    v_sup_usuario := v_uid;
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
    manual_registrado_por, manual_registrado_em, registrado_por,
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
    v_uid, now(), v_uid,
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