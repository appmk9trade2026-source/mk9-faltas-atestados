
-- 1) Novo público 'TST' (não usado nesta tx)
ALTER TYPE public.whatsapp_publico ADD VALUE IF NOT EXISTS 'TST';

-- 2) Categoria + tipo de ausência
INSERT INTO public.categorias_ausencia (codigo, nome, ativo, ordem)
VALUES ('ACIDENTES', 'Acidentes de Trabalho', true, 60)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, ativo = true;

INSERT INTO public.tipos_ausencia
  (codigo, nome, descricao, ordem, ativo, exige_documento, permite_cid, permite_acidente, categoria_ausencia_id)
SELECT 'ACIDENTE_TRABALHO', 'ACIDENTE DE TRABALHO',
       'Registro de acidente de trabalho — dispara notificação ao TST', 100,
       true, false, false, true,
       (SELECT id FROM public.categorias_ausencia WHERE codigo = 'ACIDENTES')
ON CONFLICT (codigo) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      permite_acidente = true,
      ativo = true,
      categoria_ausencia_id = EXCLUDED.categoria_ausencia_id;

-- 3) Campos de acidente
ALTER TABLE public.ausencias
  ADD COLUMN IF NOT EXISTS acidente_data date,
  ADD COLUMN IF NOT EXISTS acidente_hora time,
  ADD COLUMN IF NOT EXISTS acidente_local text,
  ADD COLUMN IF NOT EXISTS acidente_descricao text,
  ADD COLUMN IF NOT EXISTS acidente_atendimento_medico boolean,
  ADD COLUMN IF NOT EXISTS acidente_houve_afastamento boolean,
  ADD COLUMN IF NOT EXISTS acidente_dias_afastamento_inicial integer,
  ADD COLUMN IF NOT EXISTS acidente_cat_emitida boolean,
  ADD COLUMN IF NOT EXISTS acidente_observacoes text;

-- 4) Tabela TST destinatários
CREATE TABLE IF NOT EXISTS public.whatsapp_tst_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT 'Técnico de Segurança do Trabalho',
  cargo text NOT NULL DEFAULT 'Técnico de Segurança do Trabalho',
  telefone_original text NOT NULL,
  telefone_normalizado text NOT NULL,
  telefone_e164 text NOT NULL,
  telefone_hash text NOT NULL,
  telefone_mascarado text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  destinatario_principal_acidente boolean NOT NULL DEFAULT false,
  confirmado boolean NOT NULL DEFAULT false,
  confirmado_por uuid REFERENCES auth.users(id),
  confirmado_em timestamptz,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_tst_e164_chk CHECK (telefone_e164 ~ '^\+?[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_tst_e164_uidx
  ON public.whatsapp_tst_destinatarios(telefone_e164);

CREATE UNIQUE INDEX IF NOT EXISTS wa_tst_um_principal_ativo_uidx
  ON public.whatsapp_tst_destinatarios((true))
  WHERE destinatario_principal_acidente = true AND ativo = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_tst_destinatarios TO authenticated;
GRANT ALL ON public.whatsapp_tst_destinatarios TO service_role;

ALTER TABLE public.whatsapp_tst_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_tst_select_admins_rh_compliance"
  ON public.whatsapp_tst_destinatarios
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'rh'::app_role) OR
    public.has_role(auth.uid(), 'compliance'::app_role)
  );

CREATE POLICY "wa_tst_write_super_admin_rh"
  ON public.whatsapp_tst_destinatarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'rh'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'rh'::app_role));

CREATE TRIGGER trg_wa_tst_updated_at
  BEFORE UPDATE ON public.whatsapp_tst_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_whatsapp();

-- Auditoria (usa audit_action enum existente)
CREATE OR REPLACE FUNCTION public.tg_wa_tst_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao audit_action;
  v_depois jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN v_acao := 'CREATE';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.confirmado = false AND NEW.confirmado = true THEN v_acao := 'MUDANCA_STATUS';
    ELSIF OLD.ativo = true AND NEW.ativo = false THEN v_acao := 'MUDANCA_STATUS';
    ELSE v_acao := 'UPDATE';
    END IF;
  ELSE v_acao := 'DELETE_LOGICO';
  END IF;

  v_depois := to_jsonb(COALESCE(NEW, OLD));
  v_depois := v_depois - 'telefone_original' - 'telefone_normalizado' - 'telefone_e164' - 'telefone_hash';

  INSERT INTO public.audit_logs
    (modulo, entidade, registro_id, acao, usuario_id, depois)
  VALUES
    ('WHATSAPP', 'TST_DESTINATARIO', COALESCE(NEW.id, OLD.id), v_acao, auth.uid(), v_depois);

  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_wa_tst_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_tst_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_tst_audit();

-- 5) Template ACIDENTE_TRABALHO_TST_V1 (publico != COLABORADOR — sem restrição de termos)
INSERT INTO public.whatsapp_templates
  (codigo, versao, publico, nome, conteudo, variaveis_permitidas, ativo)
VALUES (
  'ACIDENTE_TRABALHO_TST_V1', 1, 'SUPERVISOR'::whatsapp_publico,
  'Acidente de Trabalho — TST',
$TPL$🚨 ACIDENTE DE TRABALHO

Empresa: {{empresa}}
Projeto: {{projeto}}
Colaborador: {{colaborador}}
Matrícula: {{matricula}}
Cargo: {{cargo}}
Data do acidente: {{data_ocorrencia}}
Hora: {{hora_ocorrencia}}
Local: {{local_ocorrencia}}
Descrição: {{descricao}}
Registrado por: {{usuario}}
Data e hora do registro: {{created_at}}

Ocorrência:
{{url_interna}}$TPL$,
  ARRAY['empresa','projeto','colaborador','matricula','cargo',
        'data_ocorrencia','hora_ocorrencia','local_ocorrencia',
        'descricao','usuario','created_at','url_interna'],
  true
)
ON CONFLICT (codigo, versao) DO UPDATE
  SET conteudo = EXCLUDED.conteudo,
      variaveis_permitidas = EXCLUDED.variaveis_permitidas,
      ativo = true;

-- 6) Idempotência de acidente
CREATE OR REPLACE FUNCTION public.whatsapp_idem_key_acidente(
  p_ausencia_id uuid, p_tst_destinatario_id uuid
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT 'acidente_trabalho:'||p_ausencia_id::text||':tst:'||p_tst_destinatario_id::text
$$;

-- 7) Materialização de acidente
CREATE OR REPLACE FUNCTION public.materializar_whatsapp_acidente(p_ausencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ausencia public.ausencias%ROWTYPE;
  v_colab    public.colaboradores%ROWTYPE;
  v_empresa_nome text; v_projeto_nome text;
  v_tst record; v_tpl record;
  v_registrador text; v_url text;
  v_idem text; v_payload jsonb;
  v_criados int := 0; v_ja int := 0;
BEGIN
  SELECT * INTO v_ausencia FROM public.ausencias WHERE id = p_ausencia_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'AUSENCIA_INEXISTENTE'); END IF;
  IF v_ausencia.status::text <> 'LANCADO' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'STATUS_NAO_LANCADO');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tipos_ausencia ta
    JOIN public.categorias_ausencia ca ON ca.id = ta.categoria_ausencia_id
    WHERE ta.id = v_ausencia.tipo_ausencia_id AND ca.codigo = 'ACIDENTES'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'NAO_E_ACIDENTE');
  END IF;

  SELECT * INTO v_colab FROM public.colaboradores WHERE id = v_ausencia.colaborador_id;
  SELECT nome INTO v_empresa_nome FROM public.empresas WHERE id = v_ausencia.empresa_id;
  SELECT nome INTO v_projeto_nome FROM public.projetos WHERE id = v_ausencia.projeto_id;

  SELECT * INTO v_tst
    FROM public.whatsapp_tst_destinatarios
   WHERE ativo = true AND confirmado = true AND destinatario_principal_acidente = true
   ORDER BY updated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'SEM_DESTINATARIO', 'TST_NAO_CONFIGURADO', NULL,
      jsonb_build_object('ausencia_id', p_ausencia_id, 'publico','TST'));
    BEGIN
      INSERT INTO public.alertas (
        titulo, descricao, categoria, regra_codigo, severidade, status,
        chave_idempotencia, empresa_id, projeto_id, colaborador_id, ausencia_id, detectado_em
      ) VALUES (
        'Acidente sem destinatário TST',
        'Acidente registrado, mas não há Técnico de Segurança confirmado e ativo. Cadastre/confirme o TST para enviar a notificação.',
        'WHATSAPP', 'ACIDENTE_SEM_TST', 'ALTA', 'NOVO',
        'acidente_sem_tst:'||p_ausencia_id::text,
        v_ausencia.empresa_id, v_ausencia.projeto_id, v_ausencia.colaborador_id, p_ausencia_id, now()
      ) ON CONFLICT (chave_idempotencia) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('ok', true, 'motivo', 'SEM_DESTINATARIO', 'criados', 0);
  END IF;

  SELECT * INTO v_tpl FROM public.whatsapp_templates
   WHERE codigo = 'ACIDENTE_TRABALHO_TST_V1' AND ativo = true
   ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'TEMPLATE_INEXISTENTE');
  END IF;

  SELECT COALESCE(nome_completo, email, id::text) INTO v_registrador
    FROM public.profiles WHERE id = COALESCE(v_ausencia.lancado_por, v_ausencia.registrado_por);

  v_url := '/ausencias?id=' || p_ausencia_id::text;

  v_payload := jsonb_build_object(
    'empresa',          COALESCE(v_empresa_nome, ''),
    'projeto',          COALESCE(v_projeto_nome, ''),
    'colaborador',      COALESCE(v_colab.nome_completo, ''),
    'matricula',        COALESCE(v_colab.matricula, ''),
    'cargo',            COALESCE(v_colab.cargo, ''),
    'data_ocorrencia',  to_char(COALESCE(v_ausencia.acidente_data, v_ausencia.data_inicio), 'DD/MM/YYYY'),
    'hora_ocorrencia',  COALESCE(to_char(v_ausencia.acidente_hora, 'HH24:MI'), '--:--'),
    'local_ocorrencia', COALESCE(v_ausencia.acidente_local, ''),
    'descricao',        COALESCE(v_ausencia.acidente_descricao, ''),
    'usuario',          COALESCE(v_registrador, 'Sistema'),
    'created_at',       to_char(COALESCE(v_ausencia.lancado_em, v_ausencia.registrado_em, now())
                                AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    'url_interna',      v_url,
    'telefone_e164',    v_tst.telefone_normalizado
  );

  v_idem := public.whatsapp_idem_key_acidente(p_ausencia_id, v_tst.id);

  INSERT INTO public.whatsapp_outbox
    (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
     telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
     payload, provider, idempotency_key, proxima_tentativa_em)
  VALUES
    ('ACIDENTE_TRABALHO_REGISTRADO', p_ausencia_id::text, p_ausencia_id,
     'TST'::whatsapp_publico, NULL,
     v_tst.telefone_hash, v_tst.telefone_mascarado,
     v_tpl.id, v_tpl.codigo, v_tpl.versao,
     v_payload, 'EVOLUTION_API'::whatsapp_provider,
     v_idem, now())
  ON CONFLICT (idempotency_key) DO NOTHING;

  IF FOUND THEN v_criados := 1; ELSE v_ja := 1; END IF;

  INSERT INTO public.audit_logs
    (modulo, entidade, registro_id, acao, usuario_id, depois)
  VALUES
    ('WHATSAPP', 'ACIDENTE_TRABALHO', p_ausencia_id, 'ENVIO_COMUNICACAO', auth.uid(),
     jsonb_build_object(
       'ausencia_id', p_ausencia_id,
       'colaborador_id', v_ausencia.colaborador_id,
       'empresa_id', v_ausencia.empresa_id,
       'projeto_id', v_ausencia.projeto_id,
       'destinatario_id', v_tst.id,
       'telefone_mascarado', v_tst.telefone_mascarado,
       'evento', 'ACIDENTE_TRABALHO_REGISTRADO',
       'idempotency_key', v_idem,
       'ja_materializado', v_ja = 1
     ));

  RETURN jsonb_build_object('ok', true, 'criados', v_criados, 'duplicados', v_ja,
                            'destinatario_id', v_tst.id);
END; $$;

-- 8) Trigger estendida
CREATE OR REPLACE FUNCTION public.tg_ausencia_whatsapp_materializar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := coalesce(auth.uid(), NEW.registrado_por);
  v_categoria text; v_cat_cod text;
  v_transicionou boolean;
BEGIN
  IF NEW.status::text <> 'LANCADO' THEN RETURN NULL; END IF;

  IF TG_OP = 'UPDATE' THEN
    v_transicionou := OLD.status IS DISTINCT FROM NEW.status;
    IF NOT v_transicionou THEN RETURN NULL; END IF;
  END IF;

  IF NEW.tipo::text IN ('FALTA', 'ATESTADO') THEN
    v_categoria := NEW.tipo::text;
  ELSE
    SELECT ca.codigo INTO v_cat_cod
      FROM public.tipos_ausencia ta
      JOIN public.categorias_ausencia ca ON ca.id = ta.categoria_ausencia_id
      WHERE ta.id = NEW.tipo_ausencia_id;
    IF v_cat_cod IN ('FALTAS', 'ATESTADOS') THEN v_categoria := v_cat_cod; END IF;
    IF v_cat_cod = 'ACIDENTES' THEN v_categoria := 'ACIDENTES'; END IF;
  END IF;
  IF v_categoria IS NULL THEN RETURN NULL; END IF;

  BEGIN
    IF v_categoria = 'ACIDENTES' THEN
      PERFORM public.materializar_whatsapp_acidente(NEW.id);
    ELSE
      PERFORM public.materializar_whatsapp_ausencia(NEW.id, v_uid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'ERRO_MATERIALIZACAO', SQLSTATE, SQLERRM,
      jsonb_build_object('ausencia_id', NEW.id, 'origem', 'trigger', 'categoria', v_categoria)
    );
  END;
  RETURN NULL;
END; $$;

-- 9) Bootstrap do TST (NÃO CONFIRMADO)
INSERT INTO public.whatsapp_tst_destinatarios
  (nome, cargo, telefone_original, telefone_normalizado, telefone_e164,
   telefone_hash, telefone_mascarado,
   ativo, destinatario_principal_acidente, confirmado)
SELECT
  'Técnico de Segurança do Trabalho',
  'Técnico de Segurança do Trabalho',
  '(61) 9312-5557',
  '5561993125557',
  '+5561993125557',
  encode(extensions.digest('5561993125557', 'sha256'), 'hex'),
  '+55 (61) *****-5557',
  true, true, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_tst_destinatarios WHERE telefone_e164 = '+5561993125557'
);

-- 10) RPC: reenfileirar acidente
CREATE OR REPLACE FUNCTION public.reenfileirar_acidente_para_tst(p_ausencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'rh'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  RETURN public.materializar_whatsapp_acidente(p_ausencia_id);
END; $$;

REVOKE ALL ON FUNCTION public.reenfileirar_acidente_para_tst(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reenfileirar_acidente_para_tst(uuid) TO authenticated;

-- 11) RPC: confirmar TST
CREATE OR REPLACE FUNCTION public.wa_tst_confirmar(p_id uuid)
RETURNS public.whatsapp_tst_destinatarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.whatsapp_tst_destinatarios;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'rh'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  UPDATE public.whatsapp_tst_destinatarios
     SET confirmado = true, confirmado_por = auth.uid(),
         confirmado_em = now(), updated_by = auth.uid()
   WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'TST não encontrado'; END IF;
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.wa_tst_confirmar(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.wa_tst_confirmar(uuid) TO authenticated;
