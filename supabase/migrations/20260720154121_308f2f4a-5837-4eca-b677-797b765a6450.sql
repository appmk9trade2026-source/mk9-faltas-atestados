
ALTER TABLE public.ausencias
  DROP CONSTRAINT IF EXISTS ausencias_protocolo_formato_chk;
ALTER TABLE public.ausencias
  ADD CONSTRAINT ausencias_protocolo_formato_chk
  CHECK (protocolo IS NULL OR protocolo ~ '^[A-Z0-9]{2,10}-[0-9]{8}-[0-9]{6}$');

CREATE OR REPLACE FUNCTION public.gerar_protocolo_ausencia(p_projeto_id uuid, p_data date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_codigo text; v_ano int; v_seq int; v_proto text;
BEGIN
  IF p_projeto_id IS NULL THEN RAISE EXCEPTION 'PROJETO_OBRIGATORIO' USING ERRCODE='check_violation'; END IF;
  SELECT codigo_protocolo INTO v_codigo FROM public.projetos WHERE id = p_projeto_id;
  IF v_codigo IS NULL OR v_codigo = '' THEN
    BEGIN
      INSERT INTO public.audit_logs (usuario_id, modulo, entidade, projeto_id, acao, sucesso, observacoes, depois)
      VALUES (auth.uid(), 'PROTOCOLO', 'ausencias', p_projeto_id, 'ACESSO_NEGADO'::audit_action, false,
              'PROJETO_SEM_CODIGO_PROTOCOLO', jsonb_build_object('projeto_id', p_projeto_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RAISE EXCEPTION 'PROJETO_SEM_CODIGO_PROTOCOLO' USING ERRCODE='check_violation',
      HINT='Configure o código de protocolo do projeto antes de lançar.';
  END IF;
  v_ano := EXTRACT(YEAR FROM COALESCE(p_data, current_date))::int;
  INSERT INTO public.projeto_protocolo_sequencias (projeto_id, ano, ultimo_numero, updated_at)
  VALUES (p_projeto_id, v_ano, 1, now())
  ON CONFLICT (projeto_id, ano) DO UPDATE
    SET ultimo_numero = public.projeto_protocolo_sequencias.ultimo_numero + 1, updated_at = now()
  RETURNING ultimo_numero INTO v_seq;
  v_proto := v_codigo || '-' || to_char(COALESCE(p_data, current_date), 'YYYYMMDD')
                     || '-' || lpad(v_seq::text, 6, '0');
  BEGIN
    INSERT INTO public.audit_logs (usuario_id, modulo, entidade, projeto_id, acao, sucesso, observacoes, depois)
    VALUES (auth.uid(), 'PROTOCOLO', 'ausencias', p_projeto_id, 'CREATE'::audit_action, true,
            'PROTOCOLO_GERADO',
            jsonb_build_object('projeto_id', p_projeto_id, 'codigo_projeto', v_codigo,
                               'ano', v_ano, 'sequencial', v_seq, 'protocolo', v_proto));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN v_proto;
END; $$;

UPDATE public.whatsapp_templates SET ativo = false
 WHERE codigo = 'AUSENCIA_LANCADA_COLABORADOR_V1';

INSERT INTO public.whatsapp_templates
  (codigo, nome, versao, publico, conteudo, variaveis_permitidas, ativo)
VALUES (
  'AUSENCIA_LANCADA_COLABORADOR_V1',
  'Lançamento de ausência — mensagem ao colaborador (v3)',
  3, 'COLABORADOR',
  'Olá, {{colaborador_nome}}!

Informamos que foi registrado um lançamento de {{tipo_lancamento}} {{periodo_texto}}.

Projeto: {{projeto_nome}}
Protocolo: {{protocolo}}

{{aviso_privacidade}}Caso identifique alguma divergência, procure sua liderança ou o RH pelos canais oficiais da empresa.

Esta é uma mensagem automática. Não responda este WhatsApp.',
  ARRAY['colaborador_nome','tipo_lancamento','periodo_texto','projeto_nome','protocolo','aviso_privacidade'],
  true
)
ON CONFLICT (codigo, versao) DO UPDATE
  SET conteudo = EXCLUDED.conteudo,
      variaveis_permitidas = EXCLUDED.variaveis_permitidas,
      ativo = EXCLUDED.ativo,
      nome = EXCLUDED.nome;

CREATE OR REPLACE FUNCTION public.materializar_whatsapp_ausencia(p_ausencia_id uuid, p_supervisor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ausencia public.ausencias%ROWTYPE;
  v_colab    public.colaboradores%ROWTYPE;
  v_empresa_nome text; v_projeto_nome text; v_tipo_lancamento text;
  v_tpl record; v_norm record;
  v_idem text; v_categoria text; v_cat_cod text;
  v_criados int := 0; v_ja int := 0; v_erros int := 0; v_supr int := 0;
  v_payload jsonb; v_periodo text; v_aviso text; v_di date; v_df date;
BEGIN
  SELECT * INTO v_ausencia FROM public.ausencias WHERE id = p_ausencia_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'AUSENCIA_INEXISTENTE'); END IF;
  IF v_ausencia.status::text <> 'LANCADO' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'STATUS_NAO_LANCADO'); END IF;

  IF v_ausencia.tipo::text IN ('FALTA', 'ATESTADO') THEN
    v_categoria := v_ausencia.tipo::text;
  ELSE
    SELECT ca.codigo INTO v_cat_cod
      FROM public.tipos_ausencia ta
      JOIN public.categorias_ausencia ca ON ca.id = ta.categoria_ausencia_id
     WHERE ta.id = v_ausencia.tipo_ausencia_id;
    IF v_cat_cod = 'FALTAS'    THEN v_categoria := 'FALTA';    END IF;
    IF v_cat_cod = 'ATESTADOS' THEN v_categoria := 'ATESTADO'; END IF;
  END IF;
  IF v_categoria IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'CATEGORIA_NAO_APLICAVEL'); END IF;
  v_tipo_lancamento := v_categoria;

  SELECT * INTO v_colab FROM public.colaboradores WHERE id = v_ausencia.colaborador_id;
  SELECT nome INTO v_empresa_nome FROM public.empresas WHERE id = v_ausencia.empresa_id;
  SELECT nome INTO v_projeto_nome FROM public.projetos WHERE id = v_ausencia.projeto_id;

  v_di := COALESCE(v_ausencia.data_inicio, v_ausencia.registrado_em::date, current_date);
  v_df := COALESCE(v_ausencia.data_fim, v_di);
  IF v_di = v_df THEN
    v_periodo := 'referente ao dia ' || to_char(v_di, 'DD/MM/YYYY');
  ELSE
    v_periodo := 'referente ao período de ' || to_char(v_di, 'DD/MM/YYYY')
              || ' a ' || to_char(v_df, 'DD/MM/YYYY');
  END IF;

  IF v_categoria = 'ATESTADO' THEN
    v_aviso := 'Por privacidade, esta mensagem não contém informações clínicas.' || E'\n\n';
  ELSE
    v_aviso := '';
  END IF;

  BEGIN
    SELECT * INTO v_tpl FROM public.whatsapp_templates
     WHERE codigo = 'AUSENCIA_LANCADA_COLABORADOR_V1' AND ativo = true
     ORDER BY versao DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;

    PERFORM public.validar_template_colaborador_whatsapp(v_tpl.conteudo, v_tpl.variaveis_permitidas);

    IF v_colab.whatsapp IS NULL OR length(btrim(v_colab.whatsapp)) = 0 THEN
      v_supr := v_supr + 1;
      PERFORM public.whatsapp_registrar_evento_seguro(
        NULL, 'SEM_TELEFONE', 'COLAB_SEM_WHATSAPP', NULL,
        jsonb_build_object('publico','COLABORADOR','ausencia_id',p_ausencia_id));
    ELSE
      SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(v_colab.whatsapp);
      IF NOT v_norm.valido THEN
        v_supr := v_supr + 1;
        PERFORM public.whatsapp_registrar_evento_seguro(
          NULL, 'TELEFONE_INVALIDO', 'COLAB_TELEFONE_INVALIDO', NULL,
          jsonb_build_object('publico','COLABORADOR','ausencia_id',p_ausencia_id));
      ELSE
        v_payload := jsonb_build_object(
          'colaborador_nome',  COALESCE(v_colab.nome_completo, ''),
          'tipo_lancamento',   v_tipo_lancamento,
          'periodo_texto',     v_periodo,
          'projeto_nome',      COALESCE(v_projeto_nome, ''),
          'protocolo',         COALESCE(v_ausencia.protocolo, ''),
          'aviso_privacidade', v_aviso,
          'primeiro_nome',     split_part(COALESCE(v_colab.nome_completo, ''), ' ', 1),
          'data_referencia',   to_char(v_di, 'DD/MM/YYYY'),
          'data_registro',     to_char(COALESCE(v_ausencia.registrado_em, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'empresa',           COALESCE(v_empresa_nome, ''),
          'telefone_e164',     v_norm.telefone_normalizado
        );
        v_idem := public.whatsapp_idem_key_ausencia(p_ausencia_id, 'COLABORADOR'::whatsapp_publico, v_colab.id);
        INSERT INTO public.whatsapp_outbox
          (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
           telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
           payload, provider, idempotency_key, proxima_tentativa_em)
        VALUES
          ('AUSENCIA_LANCADA', p_ausencia_id, p_ausencia_id, 'COLABORADOR'::whatsapp_publico, NULL,
           v_norm.telefone_hash, v_norm.telefone_mascarado,
           v_tpl.id, v_tpl.codigo, v_tpl.versao,
           v_payload, 'EVOLUTION',
           v_idem, now())
        ON CONFLICT (idempotency_key) DO NOTHING;
        IF FOUND THEN v_criados := v_criados + 1; ELSE v_ja := v_ja + 1; END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_erros := v_erros + 1;
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'ERRO_MATERIALIZACAO', SQLSTATE, SQLERRM,
      jsonb_build_object('ausencia_id', p_ausencia_id, 'publico','COLABORADOR'));
  END;

  RETURN jsonb_build_object('ok', true, 'criados', v_criados, 'duplicados', v_ja,
                            'erros', v_erros, 'suprimidos', v_supr);
END; $$;

CREATE OR REPLACE FUNCTION public.backfill_protocolos_pendentes(p_limite int DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_proto text;
  v_ok int := 0; v_skip int := 0; v_err int := 0; v_msg text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO' USING ERRCODE='insufficient_privilege';
  END IF;
  FOR r IN
    SELECT a.id, a.projeto_id, a.data_inicio, a.created_at, p.codigo_protocolo
      FROM public.ausencias a LEFT JOIN public.projetos p ON p.id = a.projeto_id
     WHERE a.protocolo IS NULL
     ORDER BY a.created_at, a.id
     LIMIT GREATEST(1, p_limite)
  LOOP
    IF r.codigo_protocolo IS NULL OR r.codigo_protocolo = '' THEN
      v_skip := v_skip + 1;
      INSERT INTO public.audit_logs (usuario_id, modulo, entidade, registro_id, projeto_id,
                                     acao, sucesso, observacoes, depois)
      VALUES (auth.uid(), 'PROTOCOLO', 'ausencias', r.id, r.projeto_id,
              'ACESSO_NEGADO'::audit_action, false, 'PROJETO_SEM_CODIGO_PROTOCOLO',
              jsonb_build_object('ausencia_id', r.id, 'projeto_id', r.projeto_id));
      CONTINUE;
    END IF;
    BEGIN
      v_proto := public.gerar_protocolo_ausencia(r.projeto_id, COALESCE(r.data_inicio, r.created_at::date));
      UPDATE public.ausencias SET protocolo = v_proto WHERE id = r.id;
      INSERT INTO public.audit_logs (usuario_id, modulo, entidade, registro_id, projeto_id,
                                     acao, sucesso, observacoes, depois)
      VALUES (auth.uid(), 'PROTOCOLO', 'ausencias', r.id, r.projeto_id,
              'CREATE'::audit_action, true, 'PROTOCOLO_BACKFILL_GERADO',
              jsonb_build_object('ausencia_id', r.id, 'projeto_id', r.projeto_id, 'protocolo', v_proto));
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1; v_msg := SQLERRM;
      INSERT INTO public.audit_logs (usuario_id, modulo, entidade, registro_id, projeto_id,
                                     acao, sucesso, observacoes, depois)
      VALUES (auth.uid(), 'PROTOCOLO', 'ausencias', r.id, r.projeto_id,
              'ACESSO_NEGADO'::audit_action, false, 'PROTOCOLO_GERACAO_FALHOU',
              jsonb_build_object('ausencia_id', r.id, 'erro', v_msg));
    END;
  END LOOP;
  RETURN jsonb_build_object('gerados', v_ok, 'ignorados', v_skip, 'erros', v_err);
END; $$;
REVOKE ALL ON FUNCTION public.backfill_protocolos_pendentes(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_protocolos_pendentes(int) TO authenticated;
