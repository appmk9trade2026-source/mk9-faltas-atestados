
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS codigo_protocolo text;

ALTER TABLE public.projetos
  DROP CONSTRAINT IF EXISTS projetos_codigo_protocolo_formato_chk;
ALTER TABLE public.projetos
  ADD CONSTRAINT projetos_codigo_protocolo_formato_chk
  CHECK (codigo_protocolo IS NULL OR codigo_protocolo ~ '^[A-Z0-9]{2,10}$');

CREATE UNIQUE INDEX IF NOT EXISTS projetos_codigo_protocolo_uidx
  ON public.projetos (codigo_protocolo)
  WHERE codigo_protocolo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_projetos_normaliza_codigo_protocolo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.codigo_protocolo IS NOT NULL THEN
    NEW.codigo_protocolo := upper(btrim(NEW.codigo_protocolo));
    IF NEW.codigo_protocolo = '' THEN NEW.codigo_protocolo := NULL; END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projetos_normaliza_codigo_protocolo ON public.projetos;
CREATE TRIGGER trg_projetos_normaliza_codigo_protocolo
  BEFORE INSERT OR UPDATE OF codigo_protocolo ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_projetos_normaliza_codigo_protocolo();

CREATE TABLE IF NOT EXISTS public.projeto_protocolo_sequencias (
  projeto_id    uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  ano           int  NOT NULL,
  ultimo_numero int  NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projeto_id, ano)
);
GRANT SELECT ON public.projeto_protocolo_sequencias TO authenticated;
GRANT ALL    ON public.projeto_protocolo_sequencias TO service_role;
ALTER TABLE public.projeto_protocolo_sequencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados leem sequencias" ON public.projeto_protocolo_sequencias;
CREATE POLICY "Autenticados leem sequencias"
  ON public.projeto_protocolo_sequencias FOR SELECT TO authenticated USING (true);

ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS protocolo text;
CREATE UNIQUE INDEX IF NOT EXISTS ausencias_protocolo_uidx
  ON public.ausencias (protocolo) WHERE protocolo IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gerar_protocolo_ausencia(
  p_projeto_id uuid, p_data date
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_codigo text; v_ano int; v_seq int;
BEGIN
  IF p_projeto_id IS NULL THEN
    RAISE EXCEPTION 'PROJETO_OBRIGATORIO' USING ERRCODE='check_violation';
  END IF;
  SELECT codigo_protocolo INTO v_codigo FROM public.projetos WHERE id = p_projeto_id;
  IF v_codigo IS NULL OR v_codigo = '' THEN
    RAISE EXCEPTION 'PROJETO_SEM_CODIGO_PROTOCOLO'
      USING ERRCODE='check_violation',
            HINT='Configure o código de protocolo do projeto antes de lançar.';
  END IF;
  v_ano := EXTRACT(YEAR FROM coalesce(p_data, current_date))::int;
  INSERT INTO public.projeto_protocolo_sequencias (projeto_id, ano, ultimo_numero, updated_at)
  VALUES (p_projeto_id, v_ano, 1, now())
  ON CONFLICT (projeto_id, ano) DO UPDATE
    SET ultimo_numero = public.projeto_protocolo_sequencias.ultimo_numero + 1,
        updated_at = now()
  RETURNING ultimo_numero INTO v_seq;
  RETURN v_codigo || '-' || to_char(coalesce(p_data, current_date), 'YYYYMMDD')
                  || '-' || lpad(v_seq::text, 6, '0');
END; $$;
REVOKE ALL ON FUNCTION public.gerar_protocolo_ausencia(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.gerar_protocolo_ausencia(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_ausencias_gera_protocolo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.protocolo IS NOT NULL AND NEW.protocolo <> '' THEN
    RAISE EXCEPTION 'PROTOCOLO_NAO_PODE_SER_INFORMADO' USING ERRCODE='check_violation';
  END IF;
  NEW.protocolo := public.gerar_protocolo_ausencia(
    NEW.projeto_id, coalesce(NEW.data_inicio, current_date)
  );
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_ausencias_gera_protocolo ON public.ausencias;
CREATE TRIGGER trg_ausencias_gera_protocolo
  BEFORE INSERT ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_ausencias_gera_protocolo();

CREATE OR REPLACE FUNCTION public.tg_ausencias_protocolo_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.protocolo IS NOT NULL AND NEW.protocolo IS DISTINCT FROM OLD.protocolo THEN
    RAISE EXCEPTION 'PROTOCOLO_IMUTAVEL'
      USING ERRCODE='check_violation',
            HINT='O protocolo do lançamento não pode ser alterado.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_ausencias_protocolo_imutavel ON public.ausencias;
CREATE TRIGGER trg_ausencias_protocolo_imutavel
  BEFORE UPDATE OF protocolo ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_ausencias_protocolo_imutavel();

UPDATE public.projetos
   SET codigo_protocolo = 'ARMT'
   WHERE nome = 'AMBEV - AS ROTA MT'
     AND (codigo_protocolo IS NULL OR codigo_protocolo = '');

DO $$
DECLARE r record; v_novo text;
BEGIN
  FOR r IN
    SELECT a.id, a.projeto_id, coalesce(a.data_inicio, a.created_at::date) AS d
      FROM public.ausencias a
      JOIN public.projetos p ON p.id = a.projeto_id
     WHERE a.protocolo IS NULL AND p.codigo_protocolo IS NOT NULL
     ORDER BY a.created_at ASC
  LOOP
    v_novo := public.gerar_protocolo_ausencia(r.projeto_id, r.d);
    UPDATE public.ausencias SET protocolo = v_novo WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.materializar_whatsapp_ausencia(
  p_ausencia_id uuid, p_supervisor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ausencia public.ausencias%ROWTYPE;
  v_colab    public.colaboradores%ROWTYPE;
  v_empresa_nome text; v_projeto_nome text; v_tipo_lancamento text;
  v_tpl record; v_norm record;
  v_idem text;
  v_categoria text; v_cat_cod text;
  v_criados int := 0; v_ja int := 0; v_erros int := 0; v_supr int := 0;
  v_payload jsonb;
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
          'colaborador_nome', coalesce(v_colab.nome_completo, ''),
          'tipo_lancamento', v_tipo_lancamento,
          'data_referencia', to_char(coalesce(v_ausencia.data_inicio, v_ausencia.registrado_em::date, current_date), 'DD/MM/YYYY'),
          'projeto_nome', coalesce(v_projeto_nome, ''),
          'protocolo', coalesce(v_ausencia.protocolo, ''),
          'primeiro_nome', split_part(coalesce(v_colab.nome_completo, ''), ' ', 1),
          'data_registro', to_char(coalesce(v_ausencia.registrado_em, now()) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'empresa', coalesce(v_empresa_nome, ''),
          'telefone_e164', v_norm.telefone_normalizado
        );
        v_idem := public.whatsapp_idem_key_ausencia(p_ausencia_id, 'COLABORADOR'::whatsapp_publico, v_colab.id);
        INSERT INTO public.whatsapp_outbox
          (evento_tipo, evento_id, ausencia_id, publico, destinatario_usuario_id,
           telefone_hash, telefone_mascarado, template_id, template_codigo, template_versao,
           payload, idempotency_key, status, proxima_tentativa_em)
        VALUES
          ('AUSENCIA_LANCADA', p_ausencia_id::text, p_ausencia_id,
           'COLABORADOR', NULL, v_norm.telefone_hash, v_norm.telefone_mascarado,
           v_tpl.id, v_tpl.codigo, v_tpl.versao, v_payload, v_idem, 'PENDENTE', now())
        ON CONFLICT (idempotency_key) DO NOTHING;
        IF FOUND THEN v_criados := v_criados + 1; ELSE v_ja := v_ja + 1; END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_erros := v_erros + 1;
    PERFORM public.whatsapp_registrar_evento_seguro(
      NULL, 'MATERIALIZADOR_ERRO', SQLSTATE, NULL,
      jsonb_build_object('publico','COLABORADOR','ausencia_id',p_ausencia_id,'sqlerrm',left(SQLERRM,300)));
  END;

  RETURN jsonb_build_object('ok', true, 'criados', v_criados, 'ja_existentes', v_ja, 'erros', v_erros, 'suprimidos', v_supr);
END; $$;

INSERT INTO public.whatsapp_templates
  (codigo, versao, ativo, publico, nome, conteudo, variaveis_permitidas)
SELECT
  'AUSENCIA_LANCADA_COLABORADOR_V1',
  (SELECT coalesce(max(versao),0)+1 FROM public.whatsapp_templates WHERE codigo='AUSENCIA_LANCADA_COLABORADOR_V1'),
  true,
  'COLABORADOR'::whatsapp_publico,
  'Ausência lançada — Colaborador (com Protocolo)',
  E'Olá, {{colaborador_nome}}!\n\nFoi registrado um lançamento de {{tipo_lancamento}} referente ao dia {{data_referencia}}.\n\nProjeto: {{projeto_nome}}\nProtocolo: {{protocolo}}\n\nCaso identifique alguma divergência, procure sua liderança ou o RH pelos canais oficiais da empresa.\n\nEsta é uma mensagem automática. Não responda este WhatsApp.',
  ARRAY['colaborador_nome','tipo_lancamento','data_referencia','projeto_nome','protocolo']
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates
   WHERE codigo='AUSENCIA_LANCADA_COLABORADOR_V1'
     AND 'protocolo' = ANY(variaveis_permitidas)
);

UPDATE public.whatsapp_templates
   SET ativo = false
 WHERE codigo = 'AUSENCIA_LANCADA_COLABORADOR_V1'
   AND NOT ('protocolo' = ANY(variaveis_permitidas));
