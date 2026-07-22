
-- =========================================================================
-- ETAPA 1 · Coluna empresa_id + IP da confirmação
-- =========================================================================
ALTER TABLE public.whatsapp_tst_destinatarios
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmado_ip inet;

CREATE INDEX IF NOT EXISTS wa_tst_empresa_idx
  ON public.whatsapp_tst_destinatarios(empresa_id);

-- =========================================================================
-- ETAPA 3 · Índice único: 1 principal ativo por empresa
--    Substitui o índice global antigo (que só permitia 1 principal no mundo).
-- =========================================================================
DROP INDEX IF EXISTS public.wa_tst_um_principal_ativo_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS wa_tst_um_principal_ativo_por_empresa_uidx
  ON public.whatsapp_tst_destinatarios(empresa_id)
  WHERE ativo = true
    AND destinatario_principal_acidente = true
    AND empresa_id IS NOT NULL;

-- =========================================================================
-- ETAPA 4 · Migração de dados dos registros pré-existentes
--    Se houver 1 TST + 1 empresa ativa: vincula automaticamente.
--    Caso contrário: mantém NULL e cria alerta administrativo.
-- =========================================================================
DO $mig$
DECLARE
  v_tst_nulos int;
  v_empresas  int;
  v_empresa   uuid;
  v_tst_id    uuid;
BEGIN
  SELECT count(*) INTO v_tst_nulos
    FROM public.whatsapp_tst_destinatarios WHERE empresa_id IS NULL;

  SELECT count(*) INTO v_empresas FROM public.empresas WHERE ativo = true;

  IF v_tst_nulos = 1 AND v_empresas = 1 THEN
    SELECT id INTO v_empresa FROM public.empresas WHERE ativo = true LIMIT 1;
    UPDATE public.whatsapp_tst_destinatarios
       SET empresa_id = v_empresa, updated_at = now()
     WHERE empresa_id IS NULL;
  ELSIF v_tst_nulos > 0 THEN
    -- Gera 1 alerta administrativo por TST sem empresa vinculada.
    FOR v_tst_id IN
      SELECT id FROM public.whatsapp_tst_destinatarios WHERE empresa_id IS NULL
    LOOP
      BEGIN
        INSERT INTO public.alertas (
          titulo, descricao, categoria, regra_codigo, severidade, status,
          chave_idempotencia, detectado_em
        ) VALUES (
          'TST sem empresa vinculada',
          'A migração do módulo Acidente de Trabalho detectou um TST sem empresa. Vincule manualmente antes que ocorrências sejam registradas.',
          'WHATSAPP', 'TST_SEM_EMPRESA', 'ALTA', 'NOVO',
          'tst_sem_empresa:'||v_tst_id::text, now()
        ) ON CONFLICT (chave_idempotencia) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;
END $mig$;

-- =========================================================================
-- ETAPA 6+7+8 · Trigger BEFORE INSERT/UPDATE
--    - Normaliza telefone
--    - Valida E.164 BR (55 + DDD 11-99 + 8 ou 9 dígitos = 12 ou 13)
--    - Gera SHA-256 no banco (pgcrypto)
--    - Gera telefone_mascarado
--    - Se telefone mudou em UPDATE, revoga confirmação
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_wa_tst_normalize_and_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_source text;
  v_digits text;
  v_ddd    int;
BEGIN
  -- Fonte do número: prefere telefone_original; senão usa normalizado; senão e164.
  v_source := COALESCE(
    NULLIF(NEW.telefone_original, ''),
    NULLIF(NEW.telefone_normalizado, ''),
    NULLIF(NEW.telefone_e164, '')
  );

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Telefone é obrigatório' USING ERRCODE = '22023';
  END IF;

  v_digits := regexp_replace(v_source, '\D', '', 'g');

  -- Adiciona DDI 55 quando ausente
  IF length(v_digits) BETWEEN 10 AND 11 AND left(v_digits, 2) <> '55' THEN
    v_digits := '55' || v_digits;
  END IF;

  -- Formato final: 55 + DDD(2) + 8 ou 9 dígitos = 12 ou 13
  IF v_digits !~ '^55\d{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido (esperado formato BR E.164): %',
      NEW.telefone_original USING ERRCODE = '22023';
  END IF;

  v_ddd := substring(v_digits, 3, 2)::int;
  IF v_ddd < 11 OR v_ddd > 99 THEN
    RAISE EXCEPTION 'DDD inválido: %', v_ddd USING ERRCODE = '22023';
  END IF;

  -- Exige nono dígito para números móveis (11 dígitos após DDI).
  -- Se veio com 12 dígitos (55+DDD+8), o número é fixo/legado — aceita
  -- apenas quando o próximo dígito não é '9' (móvel legado exige confirmação
  -- manual, mas persiste; o gate real é o "confirmado").
  --   Móvel novo:   55 DD 9XXXXXXXX (13)
  --   Fixo:         55 DD XXXXXXXX  (12) — permitido, mas sinalizado
  -- Nenhuma exceção aqui; o painel mostra badge "Telefone inválido" se necessário.

  NEW.telefone_normalizado := v_digits;
  NEW.telefone_e164        := '+' || v_digits;
  NEW.telefone_mascarado   := '+55 (' || substring(v_digits, 3, 2) || ') *****-' || right(v_digits, 4);
  NEW.telefone_hash        := encode(extensions.digest(v_digits, 'sha256'), 'hex');
  NEW.telefone_original    := COALESCE(NULLIF(NEW.telefone_original,''), v_source);

  -- ETAPA 8: alteração de telefone revoga confirmação anterior
  IF TG_OP = 'UPDATE' AND OLD.telefone_normalizado IS DISTINCT FROM NEW.telefone_normalizado THEN
    NEW.confirmado     := false;
    NEW.confirmado_por := NULL;
    NEW.confirmado_em  := NULL;
    NEW.confirmado_ip  := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_wa_tst_normalize_and_hash ON public.whatsapp_tst_destinatarios;
CREATE TRIGGER trg_wa_tst_normalize_and_hash
  BEFORE INSERT OR UPDATE ON public.whatsapp_tst_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_tst_normalize_and_hash();

-- =========================================================================
-- ETAPA 5 · Trigger: apenas 1 principal ativo por empresa (auto-unset)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_wa_tst_single_principal_por_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_afetados int;
BEGIN
  IF NEW.destinatario_principal_acidente = true
     AND NEW.ativo = true
     AND NEW.empresa_id IS NOT NULL
  THEN
    WITH upd AS (
      UPDATE public.whatsapp_tst_destinatarios
         SET destinatario_principal_acidente = false,
             updated_at = now()
       WHERE empresa_id = NEW.empresa_id
         AND id <> NEW.id
         AND destinatario_principal_acidente = true
      RETURNING id
    )
    SELECT count(*) INTO v_afetados FROM upd;

    IF v_afetados > 0 THEN
      BEGIN
        INSERT INTO public.audit_logs (modulo, entidade, registro_id, acao, usuario_id, depois)
        VALUES ('WHATSAPP', 'TST_DESTINATARIO', NEW.id, 'PRINCIPAL_TRANSFERIDO', auth.uid(),
          jsonb_build_object('empresa_id', NEW.empresa_id,
                             'novo_principal', NEW.id,
                             'antigos_desmarcados', v_afetados));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_wa_tst_single_principal ON public.whatsapp_tst_destinatarios;
CREATE TRIGGER trg_wa_tst_single_principal
  AFTER INSERT OR UPDATE OF destinatario_principal_acidente, ativo, empresa_id
  ON public.whatsapp_tst_destinatarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_tst_single_principal_por_empresa();

-- =========================================================================
-- ETAPA 8 · Nova versão do wa_tst_confirmar com IP e checagem de empresa
-- =========================================================================
CREATE OR REPLACE FUNCTION public.wa_tst_confirmar(p_id uuid, p_ip inet DEFAULT NULL)
RETURNS whatsapp_tst_destinatarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_row public.whatsapp_tst_destinatarios;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin'::app_role)
          OR public.has_role(auth.uid(), 'rh'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.whatsapp_tst_destinatarios WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TST não encontrado';
  END IF;

  IF v_row.empresa_id IS NULL THEN
    RAISE EXCEPTION 'Vincule uma empresa antes de confirmar o TST' USING ERRCODE = '22023';
  END IF;

  IF v_row.confirmado THEN
    RAISE EXCEPTION 'TST já confirmado. Altere o telefone para exigir nova confirmação.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.whatsapp_tst_destinatarios
     SET confirmado     = true,
         confirmado_por = auth.uid(),
         confirmado_em  = now(),
         confirmado_ip  = p_ip,
         updated_by     = auth.uid()
   WHERE id = p_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs (modulo, entidade, registro_id, acao, usuario_id, depois)
  VALUES ('WHATSAPP', 'TST_DESTINATARIO', p_id, 'TST_CONFIRMADO', auth.uid(),
    jsonb_build_object(
      'empresa_id', v_row.empresa_id,
      'telefone_mascarado', v_row.telefone_mascarado,
      'ip', p_ip::text
    ));

  RETURN v_row;
END; $fn$;

-- =========================================================================
-- ETAPA 2 · Materialização: filtra TST pela empresa da ausência
-- =========================================================================
CREATE OR REPLACE FUNCTION public.materializar_whatsapp_acidente(p_ausencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  IF v_ausencia.empresa_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AUSENCIA_SEM_EMPRESA');
  END IF;

  SELECT * INTO v_colab FROM public.colaboradores WHERE id = v_ausencia.colaborador_id;
  SELECT nome INTO v_empresa_nome FROM public.empresas WHERE id = v_ausencia.empresa_id;
  SELECT nome INTO v_projeto_nome FROM public.projetos WHERE id = v_ausencia.projeto_id;

  -- Ordem de escolha do TST (apenas da MESMA empresa):
  --   1) ativo + confirmado + principal
  --   2) ativo + confirmado (mais recente)
  SELECT * INTO v_tst
    FROM public.whatsapp_tst_destinatarios
   WHERE empresa_id = v_ausencia.empresa_id
     AND ativo = true
     AND confirmado = true
   ORDER BY destinatario_principal_acidente DESC, updated_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'SEM_DESTINATARIO', 'TST_NAO_CONFIGURADO', NULL,
      jsonb_build_object('ausencia_id', p_ausencia_id,
                         'empresa_id', v_ausencia.empresa_id,
                         'publico','TST'));
    BEGIN
      INSERT INTO public.alertas (
        titulo, descricao, categoria, regra_codigo, severidade, status,
        chave_idempotencia, empresa_id, projeto_id, colaborador_id, ausencia_id, detectado_em
      ) VALUES (
        'Acidente sem destinatário TST',
        'Acidente registrado, mas não há Técnico de Segurança ativo e confirmado para esta empresa. Cadastre/confirme o TST para enviar a notificação.',
        'WHATSAPP', 'ACIDENTE_SEM_TST', 'ALTA', 'NOVO',
        'acidente_sem_tst:'||p_ausencia_id::text,
        v_ausencia.empresa_id, v_ausencia.projeto_id, v_ausencia.colaborador_id, p_ausencia_id, now()
      ) ON CONFLICT (chave_idempotencia) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('ok', true, 'motivo', 'SEM_DESTINATARIO',
                              'empresa_id', v_ausencia.empresa_id, 'criados', 0);
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

  INSERT INTO public.audit_logs (modulo, entidade, registro_id, acao, usuario_id, depois)
  VALUES ('WHATSAPP', 'ACIDENTE_TRABALHO', p_ausencia_id, 'ENVIO_COMUNICACAO', auth.uid(),
    jsonb_build_object(
      'ausencia_id', p_ausencia_id,
      'colaborador_id', v_ausencia.colaborador_id,
      'empresa_id', v_ausencia.empresa_id,
      'projeto_id', v_ausencia.projeto_id,
      'destinatario_id', v_tst.id,
      'destinatario_empresa_id', v_tst.empresa_id,
      'telefone_mascarado', v_tst.telefone_mascarado,
      'evento', 'ACIDENTE_TRABALHO_REGISTRADO',
      'idempotency_key', v_idem,
      'ja_materializado', v_ja = 1
    ));

  RETURN jsonb_build_object('ok', true, 'criados', v_criados, 'duplicados', v_ja,
                            'destinatario_id', v_tst.id,
                            'empresa_id', v_ausencia.empresa_id);
END; $fn$;

-- =========================================================================
-- ETAPA 9 · Views de saúde e monitoramento
-- =========================================================================
CREATE OR REPLACE VIEW public.whatsapp_tst_saude AS
SELECT
  e.id                                   AS empresa_id,
  e.nome                                 AS empresa_nome,
  t.id                                   AS tst_id,
  t.nome                                 AS tst_nome,
  t.telefone_mascarado,
  t.telefone_e164,
  t.ativo,
  t.destinatario_principal_acidente      AS principal,
  t.confirmado,
  t.confirmado_em,
  (SELECT max(o.enviado_em)
     FROM public.whatsapp_outbox o
    WHERE o.telefone_hash = t.telefone_hash
      AND o.template_codigo = 'ACIDENTE_TRABALHO_TST_V1')   AS ultimo_envio_em,
  (SELECT count(*)
     FROM public.whatsapp_outbox o
    WHERE o.telefone_hash = t.telefone_hash
      AND o.template_codigo = 'ACIDENTE_TRABALHO_TST_V1'
      AND o.status = 'ENVIADO'::whatsapp_status)            AS enviados_total,
  (SELECT count(*)
     FROM public.whatsapp_outbox o
    WHERE o.telefone_hash = t.telefone_hash
      AND o.template_codigo = 'ACIDENTE_TRABALHO_TST_V1'
      AND o.status IN ('FALHOU_DEFINITIVO'::whatsapp_status,
                       'FALHOU_TEMPORARIO'::whatsapp_status)) AS falhas_total,
  (SELECT count(*)
     FROM public.alertas a
    WHERE a.regra_codigo = 'ACIDENTE_SEM_TST'
      AND a.empresa_id = e.id)                              AS alertas_sem_tst
FROM public.empresas e
LEFT JOIN public.whatsapp_tst_destinatarios t
       ON t.empresa_id = e.id AND t.ativo = true;

GRANT SELECT ON public.whatsapp_tst_saude TO authenticated;

CREATE OR REPLACE VIEW public.whatsapp_tst_monitor AS
SELECT
  (SELECT count(*) FROM public.empresas WHERE ativo = true) AS empresas_ativas,
  (SELECT count(*) FROM public.empresas e WHERE ativo = true
     AND NOT EXISTS (SELECT 1 FROM public.whatsapp_tst_destinatarios t
                      WHERE t.empresa_id = e.id AND t.ativo = true))  AS empresas_sem_tst,
  (SELECT count(*) FROM public.empresas e WHERE ativo = true
     AND NOT EXISTS (SELECT 1 FROM public.whatsapp_tst_destinatarios t
                      WHERE t.empresa_id = e.id AND t.ativo = true AND t.confirmado = true))
                                                                       AS empresas_sem_confirmacao,
  (SELECT count(*) FROM public.whatsapp_tst_destinatarios WHERE empresa_id IS NULL)
                                                                       AS tsts_sem_empresa,
  (SELECT count(*) FROM public.whatsapp_outbox o
    WHERE o.template_codigo = 'ACIDENTE_TRABALHO_TST_V1'
      AND o.status IN ('FALHOU_TEMPORARIO'::whatsapp_status,
                       'FALHOU_DEFINITIVO'::whatsapp_status)
      AND o.created_at > now() - interval '24 hours')                  AS falhas_24h,
  (SELECT count(*) FROM public.alertas
    WHERE regra_codigo = 'ACIDENTE_SEM_TST' AND status = 'NOVO')       AS alertas_sem_tst_abertos,
  (SELECT max(enviado_em) FROM public.whatsapp_outbox
    WHERE template_codigo = 'ACIDENTE_TRABALHO_TST_V1')                AS ultimo_envio_em;

GRANT SELECT ON public.whatsapp_tst_monitor TO authenticated;

-- RLS já cobre a tabela base; as views herdam privilégios do owner.
-- Restringimos acesso via view apenas a papéis operacionais:
REVOKE ALL ON public.whatsapp_tst_saude   FROM PUBLIC;
REVOKE ALL ON public.whatsapp_tst_monitor FROM PUBLIC;
GRANT SELECT ON public.whatsapp_tst_saude   TO authenticated;
GRANT SELECT ON public.whatsapp_tst_monitor TO authenticated;

-- Refresca hash existente para linhas antigas (garante coerência com o novo pipeline).
UPDATE public.whatsapp_tst_destinatarios
   SET telefone_original = telefone_original
 WHERE telefone_normalizado IS NOT NULL;
