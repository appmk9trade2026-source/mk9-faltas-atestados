
-- =============================================================================
-- Etapa: WhatsApp automático ao concluir lançamento
-- - Somente o colaborador é destinatário (remove blocos RH/Supervisor).
-- - Gatilho: status LANCADO (INSERT já LANCADO ou UPDATE PENDENTE→LANCADO).
-- - Sem restrição de papel do autor (qualquer autenticado dispara).
-- =============================================================================

-- 1) Materialização enxuta: só colaborador
CREATE OR REPLACE FUNCTION public.materializar_whatsapp_ausencia(
  p_ausencia_id uuid,
  p_supervisor_id uuid
) RETURNS jsonb
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

  -- Só materializa quando concluído (LANCADO).
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

  SELECT coalesce(modo, 'DESATIVADO'::whatsapp_modo) INTO v_modo
    FROM public.whatsapp_provider_config
    ORDER BY created_at ASC
    LIMIT 1;
  IF v_modo IS NULL THEN v_modo := 'DESATIVADO'::whatsapp_modo; END IF;
  v_prox_tent := CASE WHEN v_modo = 'DESATIVADO'
                      THEN 'infinity'::timestamptz
                      ELSE now()
                 END;

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

-- 2) Trigger: dispara em INSERT (já LANCADO) ou UPDATE (PENDENTE→LANCADO)
CREATE OR REPLACE FUNCTION public.tg_ausencia_whatsapp_materializar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := coalesce(auth.uid(), NEW.registrado_por);
  v_categoria text; v_cat_cod text;
  v_transicionou boolean;
BEGIN
  -- Só reage quando o registro está LANCADO
  IF NEW.status::text <> 'LANCADO' THEN RETURN NULL; END IF;

  -- Em UPDATE, exigir transição real para LANCADO (evita reenvio em edições)
  IF TG_OP = 'UPDATE' THEN
    v_transicionou := OLD.status IS DISTINCT FROM NEW.status;
    IF NOT v_transicionou THEN RETURN NULL; END IF;
  END IF;

  -- Categoria elegível: FALTA / ATESTADO
  IF NEW.tipo::text IN ('FALTA', 'ATESTADO') THEN
    v_categoria := NEW.tipo::text;
  ELSE
    SELECT ca.codigo INTO v_cat_cod
      FROM public.tipos_ausencia ta
      JOIN public.categorias_ausencia ca ON ca.id = ta.categoria_ausencia_id
      WHERE ta.id = NEW.tipo_ausencia_id;
    IF v_cat_cod IN ('FALTAS', 'ATESTADOS') THEN v_categoria := v_cat_cod; END IF;
  END IF;
  IF v_categoria IS NULL THEN RETURN NULL; END IF;

  BEGIN
    PERFORM public.materializar_whatsapp_ausencia(NEW.id, v_uid);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'ERRO_MATERIALIZACAO', SQLSTATE, SQLERRM,
      jsonb_build_object('ausencia_id', NEW.id, 'origem', 'trigger')
    );
  END;
  RETURN NULL;
END
$function$;

-- 3) Recria o trigger cobrindo INSERT e UPDATE OF status
DROP TRIGGER IF EXISTS tg_ausencia_whatsapp_materializar ON public.ausencias;
CREATE TRIGGER tg_ausencia_whatsapp_materializar
  AFTER INSERT OR UPDATE OF status ON public.ausencias
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_ausencia_whatsapp_materializar();
