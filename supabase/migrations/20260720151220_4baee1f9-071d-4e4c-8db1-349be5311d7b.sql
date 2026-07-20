-- 1) materializar_whatsapp_ausencia: fila sempre recuperável (sem 'infinity')
CREATE OR REPLACE FUNCTION public.materializar_whatsapp_ausencia(p_ausencia_id uuid, p_supervisor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ausencia public.ausencias%ROWTYPE;
  v_colab    public.colaboradores%ROWTYPE;
  v_empresa_nome text;
  v_modo whatsapp_modo;
  v_prox_tent timestamptz;
  v_tpl record; v_norm record;
  v_idem text; v_outbox_id uuid;
  v_categoria text; v_cat_cod text;
  v_criados int := 0; v_ja int := 0; v_erros int := 0; v_supr int := 0;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_ausencia FROM public.ausencias WHERE id = p_ausencia_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AUSENCIA_INEXISTENTE');
  END IF;

  IF v_ausencia.status::text <> 'LANCADO' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'STATUS_NAO_LANCADO');
  END IF;

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
  IF v_categoria IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CATEGORIA_NAO_APLICAVEL');
  END IF;

  SELECT * INTO v_colab FROM public.colaboradores WHERE id = v_ausencia.colaborador_id;
  SELECT nome INTO v_empresa_nome FROM public.empresas WHERE id = v_ausencia.empresa_id;

  -- Fila sempre recuperável: worker decide se envia com base em provider_config.
  v_prox_tent := now();

  BEGIN
    SELECT * INTO v_tpl FROM public.whatsapp_templates
      WHERE codigo = 'AUSENCIA_LANCADA_COLABORADOR_V1' AND ativo = true
      ORDER BY versao DESC
      LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;

    v_payload := jsonb_build_object(
      'primeiro_nome', split_part(coalesce(v_colab.nome_completo, ''), ' ', 1),
      'data_registro', to_char(
        coalesce(v_ausencia.registrado_em, now()) AT TIME ZONE 'America/Sao_Paulo',
        'DD/MM/YYYY'
      ),
      'empresa', coalesce(v_empresa_nome, '')
    );
    PERFORM public.validar_template_colaborador_whatsapp(
      v_tpl.conteudo, v_tpl.variaveis_permitidas
    );

    IF v_colab.whatsapp IS NULL OR length(btrim(v_colab.whatsapp)) = 0 THEN
      v_supr := v_supr + 1;
      PERFORM public.whatsapp_registrar_evento_seguro(
        NULL, 'SEM_TELEFONE', 'COLAB_SEM_WHATSAPP', NULL,
        jsonb_build_object('publico', 'COLABORADOR', 'ausencia_id', p_ausencia_id)
      );
    ELSE
      SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(v_colab.whatsapp);
      IF NOT v_norm.valido THEN
        v_supr := v_supr + 1;
        PERFORM public.whatsapp_registrar_evento_seguro(
          NULL, 'TELEFONE_INVALIDO', 'COLAB_TELEFONE_INVALIDO', NULL,
          jsonb_build_object('publico', 'COLABORADOR', 'ausencia_id', p_ausencia_id)
        );
      ELSE
        v_idem := public.whatsapp_idem_key_ausencia(
          p_ausencia_id, 'COLABORADOR'::whatsapp_publico, v_colab.id
        );
        INSERT INTO public.whatsapp_outbox
          (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
           telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
           payload, idempotency_key, status, proxima_tentativa_em)
        VALUES
          ('AUSENCIA_LANCADA', p_ausencia_id::text, p_ausencia_id,
           'COLABORADOR', NULL, v_norm.telefone_hash, v_norm.telefone_mascarado,
           v_tpl.id, v_tpl.codigo, v_tpl.versao, v_payload, v_idem,
           'PENDENTE'::whatsapp_status, v_prox_tent)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_outbox_id;

        IF v_outbox_id IS NULL THEN
          v_ja := v_ja + 1;
        ELSE
          v_criados := v_criados + 1;
          PERFORM public.whatsapp_registrar_evento_seguro(
            v_outbox_id, 'DESTINATARIO_RESOLVIDO', NULL, NULL,
            jsonb_build_object('publico', 'COLABORADOR')
          );
          PERFORM public.whatsapp_registrar_evento_seguro(
            v_outbox_id, 'MATERIALIZADO', NULL, NULL, '{}'::jsonb
          );
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_erros := v_erros + 1;
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'ERRO_MATERIALIZACAO', SQLSTATE, SQLERRM,
      jsonb_build_object('publico', 'COLABORADOR', 'ausencia_id', p_ausencia_id)
    );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'criados', v_criados,
    'ja_existentes', v_ja,
    'erros', v_erros,
    'suprimidos', v_supr
  );
END
$function$;

-- 2) RPC de sincronização do provider (super_admin only)
CREATE OR REPLACE FUNCTION public.whatsapp_provider_sync(
  p_instance_name text,
  p_enabled boolean,
  p_modo whatsapp_modo,
  p_webhook_enabled boolean DEFAULT NULL,
  p_base_url_public_label text DEFAULT NULL
)
RETURNS public.whatsapp_provider_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.whatsapp_provider_config;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;

  UPDATE public.whatsapp_provider_config
     SET instance_name         = COALESCE(NULLIF(btrim(p_instance_name), ''), instance_name),
         enabled               = p_enabled,
         modo                  = p_modo,
         webhook_enabled       = COALESCE(p_webhook_enabled, webhook_enabled),
         base_url_public_label = COALESCE(p_base_url_public_label, base_url_public_label),
         updated_at            = now()
   WHERE singleton = true
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public.whatsapp_provider_config
      (provider, instance_name, enabled, modo, webhook_enabled, base_url_public_label, singleton)
    VALUES
      ('EVOLUTION_API'::whatsapp_provider,
       NULLIF(btrim(p_instance_name), ''),
       p_enabled, p_modo,
       COALESCE(p_webhook_enabled, false),
       p_base_url_public_label,
       true)
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.whatsapp_provider_sync(text, boolean, whatsapp_modo, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_provider_sync(text, boolean, whatsapp_modo, boolean, text) TO authenticated;