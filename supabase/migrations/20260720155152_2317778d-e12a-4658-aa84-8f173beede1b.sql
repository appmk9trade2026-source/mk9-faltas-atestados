
-- ============================================================================
-- 1) whatsapp_test_recipients: allow-list gerenciada apenas por Super Admin
-- ============================================================================
CREATE TABLE public.whatsapp_test_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  telefone_e164 text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  CONSTRAINT wa_test_recipients_e164_chk CHECK (telefone_e164 ~ '^\+?[1-9][0-9]{7,14}$'),
  CONSTRAINT wa_test_recipients_nome_chk CHECK (length(btrim(nome)) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX wa_test_recipients_tel_uidx
  ON public.whatsapp_test_recipients (telefone_e164);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_test_recipients TO authenticated;
GRANT ALL ON public.whatsapp_test_recipients TO service_role;

ALTER TABLE public.whatsapp_test_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_test_recipients_super_admin_all"
  ON public.whatsapp_test_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- updated_at
CREATE OR REPLACE FUNCTION public.tg_wa_test_recipients_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_wa_test_recipients_touch
BEFORE UPDATE ON public.whatsapp_test_recipients
FOR EACH ROW EXECUTE FUNCTION public.tg_wa_test_recipients_touch();

-- auditoria (CRIADO / ALTERADO / REMOVIDO)
CREATE OR REPLACE FUNCTION public.tg_wa_test_recipients_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_obs text; v_id uuid; v_depois jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_obs := 'WHATSAPP_TEST_RECIPIENT_CRIADO'; v_id := NEW.id;
    v_depois := jsonb_build_object('nome', NEW.nome,
      'telefone_mascarado', regexp_replace(NEW.telefone_e164, '.(?=.{4})', '*', 'g'),
      'ativo', NEW.ativo);
    INSERT INTO public.audit_logs (usuario_id, modulo, entidade, registro_id, acao, sucesso, observacoes, depois)
    VALUES (auth.uid(), 'WHATSAPP_TESTE', 'whatsapp_test_recipients', v_id,
            'CREATE'::audit_action, true, v_obs, v_depois);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_obs := 'WHATSAPP_TEST_RECIPIENT_ALTERADO'; v_id := NEW.id;
    v_depois := jsonb_build_object('nome', NEW.nome,
      'telefone_mascarado', regexp_replace(NEW.telefone_e164, '.(?=.{4})', '*', 'g'),
      'ativo', NEW.ativo);
    INSERT INTO public.audit_logs (usuario_id, modulo, entidade, registro_id, acao, sucesso, observacoes, depois)
    VALUES (auth.uid(), 'WHATSAPP_TESTE', 'whatsapp_test_recipients', v_id,
            'UPDATE'::audit_action, true, v_obs, v_depois);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_obs := 'WHATSAPP_TEST_RECIPIENT_REMOVIDO'; v_id := OLD.id;
    v_depois := jsonb_build_object('nome', OLD.nome,
      'telefone_mascarado', regexp_replace(OLD.telefone_e164, '.(?=.{4})', '*', 'g'));
    INSERT INTO public.audit_logs (usuario_id, modulo, entidade, registro_id, acao, sucesso, observacoes, depois)
    VALUES (auth.uid(), 'WHATSAPP_TESTE', 'whatsapp_test_recipients', v_id,
            'DELETE_LOGICO'::audit_action, true, v_obs, v_depois);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_wa_test_recipients_audit_ins
AFTER INSERT ON public.whatsapp_test_recipients
FOR EACH ROW EXECUTE FUNCTION public.tg_wa_test_recipients_audit();

CREATE TRIGGER trg_wa_test_recipients_audit_upd
AFTER UPDATE ON public.whatsapp_test_recipients
FOR EACH ROW EXECUTE FUNCTION public.tg_wa_test_recipients_audit();

CREATE TRIGGER trg_wa_test_recipients_audit_del
AFTER DELETE ON public.whatsapp_test_recipients
FOR EACH ROW EXECUTE FUNCTION public.tg_wa_test_recipients_audit();

-- ============================================================================
-- 2) Pré-visualização (renderiza texto, não enfileira)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.whatsapp_preview_template_teste(
  p_tipo_lancamento text,   -- 'FALTA' | 'ATESTADO'
  p_projeto_id uuid,
  p_colaborador_nome text,
  p_data_inicio date,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tpl record; v_projeto_nome text; v_codigo text;
  v_periodo text; v_aviso text; v_di date; v_df date;
  v_proto text; v_texto text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_tipo_lancamento NOT IN ('FALTA','ATESTADO') THEN
    RAISE EXCEPTION 'TIPO_LANCAMENTO_INVALIDO';
  END IF;

  SELECT nome, codigo_protocolo INTO v_projeto_nome, v_codigo
    FROM public.projetos WHERE id = p_projeto_id;
  IF v_projeto_nome IS NULL THEN RAISE EXCEPTION 'PROJETO_INEXISTENTE'; END IF;

  v_di := COALESCE(p_data_inicio, current_date);
  v_df := COALESCE(p_data_fim, v_di);
  IF v_di = v_df THEN
    v_periodo := 'referente ao dia ' || to_char(v_di, 'DD/MM/YYYY');
  ELSE
    v_periodo := 'referente ao período de ' || to_char(v_di, 'DD/MM/YYYY')
              || ' a ' || to_char(v_df, 'DD/MM/YYYY');
  END IF;

  IF p_tipo_lancamento = 'ATESTADO' THEN
    v_aviso := 'Por privacidade, esta mensagem não contém informações clínicas.' || E'\n\n';
  ELSE v_aviso := ''; END IF;

  v_proto := COALESCE(v_codigo,'TESTE') || '-' || to_char(v_di,'YYYYMMDD') || '-TESTE0';

  SELECT * INTO v_tpl FROM public.whatsapp_templates
   WHERE codigo='AUSENCIA_LANCADA_COLABORADOR_V1' AND ativo=true
   ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;

  v_texto := v_tpl.conteudo;
  v_texto := replace(v_texto, '{{colaborador_nome}}',  COALESCE(NULLIF(btrim(p_colaborador_nome),''), 'Colaborador de Teste'));
  v_texto := replace(v_texto, '{{tipo_lancamento}}',   p_tipo_lancamento);
  v_texto := replace(v_texto, '{{periodo_texto}}',     v_periodo);
  v_texto := replace(v_texto, '{{projeto_nome}}',      COALESCE(v_projeto_nome,''));
  v_texto := replace(v_texto, '{{protocolo}}',         v_proto);
  v_texto := replace(v_texto, '{{aviso_privacidade}}', v_aviso);

  RETURN jsonb_build_object(
    'template_codigo', v_tpl.codigo,
    'template_versao', v_tpl.versao,
    'protocolo_simulado', v_proto,
    'tipo_lancamento', p_tipo_lancamento,
    'periodo_texto', v_periodo,
    'projeto_nome', v_projeto_nome,
    'aviso_privacidade', v_aviso,
    'texto_renderizado', v_texto
  );
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_preview_template_teste(text,uuid,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_preview_template_teste(text,uuid,text,date,date) TO authenticated;

-- ============================================================================
-- 3) Enfileirar teste: usa allow-list, cria linha isolada na outbox
-- ============================================================================
CREATE OR REPLACE FUNCTION public.whatsapp_enfileirar_template_teste(
  p_recipient_id uuid,
  p_tipo_lancamento text,
  p_projeto_id uuid,
  p_colaborador_nome text,
  p_data_inicio date,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient public.whatsapp_test_recipients%ROWTYPE;
  v_tpl record; v_projeto_nome text; v_codigo text;
  v_periodo text; v_aviso text; v_di date; v_df date;
  v_proto text; v_norm record;
  v_outbox_id uuid; v_idem text; v_payload jsonb; v_texto text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    INSERT INTO public.audit_logs (usuario_id, modulo, entidade, acao, sucesso, observacoes)
    VALUES (auth.uid(), 'WHATSAPP_TESTE', 'whatsapp_outbox',
            'ACESSO_NEGADO'::audit_action, false, 'WHATSAPP_TEMPLATE_TESTE_ACESSO_NEGADO');
    RAISE EXCEPTION 'ACESSO_NEGADO' USING ERRCODE='insufficient_privilege';
  END IF;

  IF p_tipo_lancamento NOT IN ('FALTA','ATESTADO') THEN
    RAISE EXCEPTION 'TIPO_LANCAMENTO_INVALIDO';
  END IF;

  SELECT * INTO v_recipient FROM public.whatsapp_test_recipients
   WHERE id = p_recipient_id AND ativo = true;
  IF NOT FOUND THEN
    INSERT INTO public.audit_logs (usuario_id, modulo, entidade, acao, sucesso, observacoes)
    VALUES (auth.uid(), 'WHATSAPP_TESTE', 'whatsapp_outbox',
            'ACESSO_NEGADO'::audit_action, false, 'DESTINATARIO_FORA_ALLOWLIST');
    RAISE EXCEPTION 'DESTINATARIO_NAO_AUTORIZADO';
  END IF;

  SELECT nome, codigo_protocolo INTO v_projeto_nome, v_codigo
    FROM public.projetos WHERE id = p_projeto_id;
  IF v_projeto_nome IS NULL THEN RAISE EXCEPTION 'PROJETO_INEXISTENTE'; END IF;

  v_di := COALESCE(p_data_inicio, current_date);
  v_df := COALESCE(p_data_fim, v_di);
  IF v_di > v_df THEN RAISE EXCEPTION 'INTERVALO_INVALIDO'; END IF;

  IF v_di = v_df THEN
    v_periodo := 'referente ao dia ' || to_char(v_di, 'DD/MM/YYYY');
  ELSE
    v_periodo := 'referente ao período de ' || to_char(v_di, 'DD/MM/YYYY')
              || ' a ' || to_char(v_df, 'DD/MM/YYYY');
  END IF;

  IF p_tipo_lancamento = 'ATESTADO' THEN
    v_aviso := 'Por privacidade, esta mensagem não contém informações clínicas.' || E'\n\n';
  ELSE v_aviso := ''; END IF;

  v_proto := COALESCE(v_codigo,'TESTE') || '-' || to_char(v_di,'YYYYMMDD') || '-TESTE0';

  SELECT * INTO v_tpl FROM public.whatsapp_templates
   WHERE codigo='AUSENCIA_LANCADA_COLABORADOR_V1' AND ativo=true
   ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_INEXISTENTE'; END IF;
  PERFORM public.validar_template_colaborador_whatsapp(v_tpl.conteudo, v_tpl.variaveis_permitidas);

  SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(v_recipient.telefone_e164);
  IF NOT v_norm.valido THEN RAISE EXCEPTION 'TELEFONE_INVALIDO'; END IF;

  v_payload := jsonb_build_object(
    'colaborador_nome',  COALESCE(NULLIF(btrim(p_colaborador_nome),''), 'Colaborador de Teste'),
    'tipo_lancamento',   p_tipo_lancamento,
    'periodo_texto',     v_periodo,
    'projeto_nome',      COALESCE(v_projeto_nome, ''),
    'protocolo',         v_proto,
    'aviso_privacidade', v_aviso,
    'primeiro_nome',     split_part(COALESCE(NULLIF(btrim(p_colaborador_nome),''),'Colaborador de Teste'),' ',1),
    'data_referencia',   to_char(v_di,'DD/MM/YYYY'),
    'data_registro',     to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY'),
    'empresa',           '(teste)',
    'telefone_e164',     v_norm.telefone_normalizado,
    'origem_teste',      true
  );

  v_idem := 'template-teste:' || v_tpl.codigo || ':v' || v_tpl.versao || ':' || gen_random_uuid()::text;

  INSERT INTO public.whatsapp_outbox
    (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
     telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
     payload, provider, idempotency_key, proxima_tentativa_em)
  VALUES
    ('TEMPLATE_TESTE', v_idem, NULL, 'COLABORADOR'::whatsapp_publico, NULL,
     v_norm.telefone_hash, v_norm.telefone_mascarado,
     v_tpl.id, v_tpl.codigo, v_tpl.versao,
     v_payload, 'EVOLUTION_API'::whatsapp_provider,
     v_idem, now())
  RETURNING id INTO v_outbox_id;

  v_texto := v_tpl.conteudo;
  v_texto := replace(v_texto, '{{colaborador_nome}}',  COALESCE(NULLIF(btrim(p_colaborador_nome),''), 'Colaborador de Teste'));
  v_texto := replace(v_texto, '{{tipo_lancamento}}',   p_tipo_lancamento);
  v_texto := replace(v_texto, '{{periodo_texto}}',     v_periodo);
  v_texto := replace(v_texto, '{{projeto_nome}}',      COALESCE(v_projeto_nome,''));
  v_texto := replace(v_texto, '{{protocolo}}',         v_proto);
  v_texto := replace(v_texto, '{{aviso_privacidade}}', v_aviso);

  INSERT INTO public.audit_logs
    (usuario_id, modulo, entidade, registro_id, projeto_id,
     acao, sucesso, observacoes, depois)
  VALUES
    (auth.uid(), 'WHATSAPP_TESTE', 'whatsapp_outbox', v_outbox_id, p_projeto_id,
     'SIMULACAO'::audit_action, true, 'WHATSAPP_TEMPLATE_TESTE_ENFILEIRADO',
     jsonb_build_object(
       'template_codigo', v_tpl.codigo,
       'template_versao', v_tpl.versao,
       'tipo_lancamento', p_tipo_lancamento,
       'projeto_id', p_projeto_id,
       'destinatario_mascarado', v_norm.telefone_mascarado,
       'outbox_id', v_outbox_id
     ));

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_id', v_outbox_id,
    'template_codigo', v_tpl.codigo,
    'template_versao', v_tpl.versao,
    'protocolo_simulado', v_proto,
    'destinatario_mascarado', v_norm.telefone_mascarado,
    'texto_renderizado', v_texto
  );
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_enfileirar_template_teste(uuid,text,uuid,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_enfileirar_template_teste(uuid,text,uuid,text,date,date) TO authenticated;
