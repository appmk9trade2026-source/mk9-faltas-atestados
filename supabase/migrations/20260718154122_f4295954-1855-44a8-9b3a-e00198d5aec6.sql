
INSERT INTO public.notificacao_tipos_config
  (tipo, nome_exibicao, descricao, categoria, obrigatoria, silenciavel,
   severidade_padrao, papeis_aplicaveis, ordem, ativo)
VALUES
  ('WHATSAPP_AUSENCIA_COLABORADOR','WhatsApp · Ausência (Colaborador)',
   'Confirmação neutra ao colaborador sobre registro de ausência.',
   'OPERACOES', true, false, 'INFO',
   ARRAY['super_admin','compliance']::app_role[], 900, true),
  ('WHATSAPP_AUSENCIA_RH','WhatsApp · Ausência (RH)',
   'Notificação operacional ao RH sobre ausência registrada por Supervisor.',
   'OPERACOES', true, false, 'ATENCAO',
   ARRAY['super_admin','rh','compliance']::app_role[], 901, true),
  ('WHATSAPP_AUSENCIA_SUPERVISOR','WhatsApp · Ausência (Supervisor)',
   'Confirmação ao Supervisor autor do lançamento.',
   'OPERACOES', true, false, 'INFO',
   ARRAY['super_admin','supervisor','compliance']::app_role[], 902, true)
ON CONFLICT (tipo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.whatsapp_idem_key_ausencia(
  p_ausencia_id uuid, p_publico whatsapp_publico, p_alvo_id uuid
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_publico
    WHEN 'COLABORADOR' THEN 'ausencia:'||p_ausencia_id::text||':whatsapp:colaborador:v1'
    WHEN 'RH'          THEN 'ausencia:'||p_ausencia_id::text||':whatsapp:rh:'||coalesce(p_alvo_id::text,'nil')||':v1'
    WHEN 'SUPERVISOR'  THEN 'ausencia:'||p_ausencia_id::text||':whatsapp:supervisor:'||coalesce(p_alvo_id::text,'nil')||':v1'
  END
$$;
REVOKE ALL ON FUNCTION public.whatsapp_idem_key_ausencia(uuid,whatsapp_publico,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_idem_key_ausencia(uuid,whatsapp_publico,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_registrar_evento_seguro(
  p_outbox_id uuid, p_evento text, p_codigo text DEFAULT NULL,
  p_mensagem text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_outbox_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.whatsapp_outbox_eventos
    (outbox_id, evento, codigo, mensagem_resumida, metadata_segura)
  VALUES (p_outbox_id, p_evento, p_codigo, left(coalesce(p_mensagem,''),240), coalesce(p_metadata,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_registrar_evento_seguro(uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_registrar_evento_seguro(uuid,text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.resolver_destinatarios_rh_ausencia(p_ausencia_id uuid)
RETURNS TABLE (usuario_id uuid, telefone_bruto text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT ON (p.telefone_whatsapp) p.id, p.telefone_whatsapp
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'rh'::app_role
  WHERE p.ativo = true
    AND p.telefone_whatsapp IS NOT NULL
    AND length(btrim(p.telefone_whatsapp)) > 0
  ORDER BY p.telefone_whatsapp, p.created_at ASC
$$;
REVOKE ALL ON FUNCTION public.resolver_destinatarios_rh_ausencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_destinatarios_rh_ausencia(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.materializar_whatsapp_ausencia(
  p_ausencia_id uuid, p_supervisor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ausencia public.ausencias%ROWTYPE;
  v_colab    public.colaboradores%ROWTYPE;
  v_empresa_nome text; v_projeto_nome text; v_supervisor_nome text;
  v_modo whatsapp_modo; v_prox_tent timestamptz;
  v_tpl record; v_norm record; v_idem text; v_outbox_id uuid;
  v_categoria text; v_cat_cod text;
  v_criados int:=0; v_ja int:=0; v_erros int:=0; v_supr int:=0;
  r record; v_payload jsonb; v_sup_tel text;
BEGIN
  SELECT * INTO v_ausencia FROM public.ausencias WHERE id=p_ausencia_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','AUSENCIA_INEXISTENTE'); END IF;

  IF v_ausencia.tipo::text IN ('FALTA','ATESTADO') THEN
    v_categoria := v_ausencia.tipo::text;
  ELSE
    SELECT ca.codigo INTO v_cat_cod
      FROM public.tipos_ausencia ta
      JOIN public.categorias_ausencia ca ON ca.id=ta.categoria_ausencia_id
      WHERE ta.id = v_ausencia.tipo_ausencia_id;
    IF v_cat_cod='FALTAS'    THEN v_categoria:='FALTA';    END IF;
    IF v_cat_cod='ATESTADOS' THEN v_categoria:='ATESTADO'; END IF;
  END IF;
  IF v_categoria IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','CATEGORIA_NAO_APLICAVEL'); END IF;

  SELECT * INTO v_colab FROM public.colaboradores WHERE id=v_ausencia.colaborador_id;
  SELECT nome INTO v_empresa_nome FROM public.empresas WHERE id=v_ausencia.empresa_id;
  SELECT nome INTO v_projeto_nome FROM public.projetos WHERE id=v_ausencia.projeto_id;
  SELECT nome INTO v_supervisor_nome FROM public.profiles WHERE id=p_supervisor_id;

  SELECT coalesce(modo,'DESATIVADO'::whatsapp_modo) INTO v_modo
    FROM public.whatsapp_provider_config ORDER BY created_at ASC LIMIT 1;
  IF v_modo IS NULL THEN v_modo:='DESATIVADO'::whatsapp_modo; END IF;
  v_prox_tent := CASE WHEN v_modo='DESATIVADO' THEN 'infinity'::timestamptz ELSE now() END;

  BEGIN
    SELECT * INTO v_tpl FROM public.whatsapp_templates
      WHERE codigo='AUSENCIA_LANCADA_COLABORADOR_V1' AND ativo=true
      ORDER BY versao DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;
    v_payload := jsonb_build_object(
      'primeiro_nome', split_part(coalesce(v_colab.nome_completo,''),' ',1),
      'data_registro', to_char(coalesce(v_ausencia.registrado_em, now()) AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY'),
      'empresa',       coalesce(v_empresa_nome,'')
    );
    PERFORM public.validar_template_colaborador_whatsapp(v_tpl.conteudo, v_tpl.variaveis_permitidas);
    IF v_colab.whatsapp IS NULL OR length(btrim(v_colab.whatsapp))=0 THEN
      v_supr:=v_supr+1;
      PERFORM public.whatsapp_registrar_evento_seguro(NULL,'SEM_TELEFONE','COLAB_SEM_WHATSAPP',NULL,
        jsonb_build_object('publico','COLABORADOR','ausencia_id',p_ausencia_id));
    ELSE
      SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(v_colab.whatsapp);
      IF NOT v_norm.valido THEN v_supr:=v_supr+1;
      ELSE
        v_idem := public.whatsapp_idem_key_ausencia(p_ausencia_id,'COLABORADOR'::whatsapp_publico, v_colab.id);
        INSERT INTO public.whatsapp_outbox
          (evento_tipo, evento_id, ausencia_id, publico, destinatario_colaborador_id,
           telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
           payload, idempotency_key, status, proxima_tentativa_em)
        VALUES
          ('AUSENCIA_REGISTRADA_SUPERVISOR', p_ausencia_id::text, p_ausencia_id,
           'COLABORADOR', v_colab.id, v_norm.telefone_hash, v_norm.telefone_mascarado,
           v_tpl.id, v_tpl.codigo, v_tpl.versao, v_payload, v_idem,
           'PENDENTE'::whatsapp_status, v_prox_tent)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_outbox_id;
        IF v_outbox_id IS NULL THEN v_ja:=v_ja+1;
        ELSE
          v_criados:=v_criados+1;
          PERFORM public.whatsapp_registrar_evento_seguro(v_outbox_id,'CRIADO',NULL,NULL,jsonb_build_object('publico','COLABORADOR','modo',v_modo::text));
          PERFORM public.whatsapp_registrar_evento_seguro(v_outbox_id,'MATERIALIZADO',NULL,NULL,'{}'::jsonb);
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_erros:=v_erros+1;
    PERFORM public.whatsapp_registrar_evento_seguro(NULL,'ERRO_MATERIALIZACAO',SQLSTATE,SQLERRM,
      jsonb_build_object('publico','COLABORADOR','ausencia_id',p_ausencia_id));
  END;

  BEGIN
    SELECT * INTO v_tpl FROM public.whatsapp_templates
      WHERE codigo='AUSENCIA_LANCADA_RH_V1' AND ativo=true
      ORDER BY versao DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;
    v_payload := jsonb_build_object(
      'colaborador', coalesce(v_colab.nome_completo,''),
      'matricula',   coalesce(v_colab.matricula,''),
      'empresa',     coalesce(v_empresa_nome,''),
      'projeto',     coalesce(v_projeto_nome,''),
      'categoria',   v_categoria,
      'periodo', jsonb_build_object(
        'inicio', to_char(v_ausencia.data_inicio,'DD/MM/YYYY'),
        'fim',    to_char(v_ausencia.data_fim,'DD/MM/YYYY'),
        'dias',   v_ausencia.dias),
      'supervisor', coalesce(v_supervisor_nome,''),
      'status',     v_ausencia.status::text,
      'protocolo',  p_ausencia_id::text
    );
    IF NOT EXISTS (SELECT 1 FROM public.resolver_destinatarios_rh_ausencia(p_ausencia_id)) THEN
      PERFORM public.whatsapp_registrar_evento_seguro(NULL,'SEM_RH',NULL,NULL,jsonb_build_object('ausencia_id',p_ausencia_id));
    END IF;
    FOR r IN SELECT * FROM public.resolver_destinatarios_rh_ausencia(p_ausencia_id) LOOP
      BEGIN
        SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(r.telefone_bruto);
        IF NOT v_norm.valido THEN v_supr:=v_supr+1; CONTINUE; END IF;
        v_idem := public.whatsapp_idem_key_ausencia(p_ausencia_id,'RH'::whatsapp_publico, r.usuario_id);
        INSERT INTO public.whatsapp_outbox
          (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
           telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
           payload, idempotency_key, status, proxima_tentativa_em)
        VALUES
          ('AUSENCIA_REGISTRADA_SUPERVISOR', p_ausencia_id::text, p_ausencia_id,
           'RH', r.usuario_id, v_norm.telefone_hash, v_norm.telefone_mascarado,
           v_tpl.id, v_tpl.codigo, v_tpl.versao, v_payload, v_idem,
           'PENDENTE'::whatsapp_status, v_prox_tent)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_outbox_id;
        IF v_outbox_id IS NULL THEN v_ja:=v_ja+1;
        ELSE
          v_criados:=v_criados+1;
          PERFORM public.whatsapp_registrar_evento_seguro(v_outbox_id,'DESTINATARIO_RESOLVIDO',NULL,NULL,jsonb_build_object('publico','RH'));
          PERFORM public.whatsapp_registrar_evento_seguro(v_outbox_id,'MATERIALIZADO',NULL,NULL,'{}'::jsonb);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_erros:=v_erros+1;
        PERFORM public.whatsapp_registrar_evento_seguro(NULL,'ERRO_MATERIALIZACAO',SQLSTATE,SQLERRM,
          jsonb_build_object('publico','RH','usuario_id',r.usuario_id));
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    v_erros:=v_erros+1;
    PERFORM public.whatsapp_registrar_evento_seguro(NULL,'ERRO_MATERIALIZACAO',SQLSTATE,SQLERRM,
      jsonb_build_object('publico','RH','ausencia_id',p_ausencia_id));
  END;

  BEGIN
    SELECT * INTO v_tpl FROM public.whatsapp_templates
      WHERE codigo='AUSENCIA_LANCADA_SUPERVISOR_V1' AND ativo=true
      ORDER BY versao DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;
    v_payload := jsonb_build_object(
      'colaborador', coalesce(v_colab.nome_completo,''),
      'categoria',   v_categoria,
      'periodo', jsonb_build_object(
        'inicio', to_char(v_ausencia.data_inicio,'DD/MM/YYYY'),
        'fim',    to_char(v_ausencia.data_fim,'DD/MM/YYYY'),
        'dias',   v_ausencia.dias),
      'status',    v_ausencia.status::text,
      'protocolo', p_ausencia_id::text
    );
    SELECT telefone_whatsapp INTO v_sup_tel FROM public.profiles WHERE id=p_supervisor_id AND ativo=true;
    IF v_sup_tel IS NULL OR length(btrim(v_sup_tel))=0 THEN
      PERFORM public.whatsapp_registrar_evento_seguro(NULL,'SEM_TELEFONE','SUPERVISOR_SEM_WHATSAPP',NULL,
        jsonb_build_object('publico','SUPERVISOR','usuario_id',p_supervisor_id));
    ELSE
      SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(v_sup_tel);
      IF NOT v_norm.valido THEN v_supr:=v_supr+1;
      ELSE
        v_idem := public.whatsapp_idem_key_ausencia(p_ausencia_id,'SUPERVISOR'::whatsapp_publico, p_supervisor_id);
        INSERT INTO public.whatsapp_outbox
          (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
           telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
           payload, idempotency_key, status, proxima_tentativa_em)
        VALUES
          ('AUSENCIA_REGISTRADA_SUPERVISOR', p_ausencia_id::text, p_ausencia_id,
           'SUPERVISOR', p_supervisor_id, v_norm.telefone_hash, v_norm.telefone_mascarado,
           v_tpl.id, v_tpl.codigo, v_tpl.versao, v_payload, v_idem,
           'PENDENTE'::whatsapp_status, v_prox_tent)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id INTO v_outbox_id;
        IF v_outbox_id IS NULL THEN v_ja:=v_ja+1;
        ELSE
          v_criados:=v_criados+1;
          PERFORM public.whatsapp_registrar_evento_seguro(v_outbox_id,'MATERIALIZADO',NULL,NULL,'{}'::jsonb);
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_erros:=v_erros+1;
    PERFORM public.whatsapp_registrar_evento_seguro(NULL,'ERRO_MATERIALIZACAO',SQLSTATE,SQLERRM,
      jsonb_build_object('publico','SUPERVISOR','ausencia_id',p_ausencia_id));
  END;

  RETURN jsonb_build_object('ok',true,'criados',v_criados,'ja_existentes',v_ja,
                            'suprimidos',v_supr,'erros',v_erros,'provider_modo',v_modo::text);
END $$;
REVOKE ALL ON FUNCTION public.materializar_whatsapp_ausencia(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materializar_whatsapp_ausencia(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_ausencia_whatsapp_materializar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sup boolean; v_priv boolean;
  v_categoria text; v_cat_cod text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_is_sup := public.has_role(v_uid,'supervisor'::app_role);
  v_priv   := public.has_role(v_uid,'rh'::app_role)
           OR public.has_role(v_uid,'super_admin'::app_role)
           OR public.has_role(v_uid,'compliance'::app_role);
  IF NOT v_is_sup OR v_priv THEN RETURN NULL; END IF;

  IF NEW.tipo::text IN ('FALTA','ATESTADO') THEN
    v_categoria := NEW.tipo::text;
  ELSE
    SELECT ca.codigo INTO v_cat_cod
      FROM public.tipos_ausencia ta
      JOIN public.categorias_ausencia ca ON ca.id=ta.categoria_ausencia_id
      WHERE ta.id = NEW.tipo_ausencia_id;
    IF v_cat_cod IN ('FALTAS','ATESTADOS') THEN v_categoria:=v_cat_cod; END IF;
  END IF;
  IF v_categoria IS NULL THEN RETURN NULL; END IF;

  BEGIN
    PERFORM public.materializar_whatsapp_ausencia(NEW.id, v_uid);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.whatsapp_registrar_evento_seguro(NULL,'ERRO_MATERIALIZACAO',SQLSTATE,SQLERRM,
      jsonb_build_object('ausencia_id',NEW.id,'origem','trigger'));
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tg_ausencia_whatsapp_materializar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_ausencia_whatsapp_materializar() TO service_role;

DROP TRIGGER IF EXISTS tg_ausencia_whatsapp_materializar ON public.ausencias;
CREATE TRIGGER tg_ausencia_whatsapp_materializar
AFTER INSERT ON public.ausencias
FOR EACH ROW EXECUTE FUNCTION public.tg_ausencia_whatsapp_materializar();
