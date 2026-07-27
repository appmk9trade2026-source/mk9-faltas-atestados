
-- 1. Colunas de origem e dados manuais
ALTER TABLE public.ausencias
  ALTER COLUMN colaborador_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS origem_registro text NOT NULL DEFAULT 'AUTOMATICO',
  ADD COLUMN IF NOT EXISTS manual_motivo text,
  ADD COLUMN IF NOT EXISTS manual_motivo_detalhe text,
  ADD COLUMN IF NOT EXISTS manual_nome text,
  ADD COLUMN IF NOT EXISTS manual_matricula text,
  ADD COLUMN IF NOT EXISTS manual_cpf text,
  ADD COLUMN IF NOT EXISTS manual_cargo text,
  ADD COLUMN IF NOT EXISTS manual_centro_custo text,
  ADD COLUMN IF NOT EXISTS manual_telefone text,
  ADD COLUMN IF NOT EXISTS manual_email text,
  ADD COLUMN IF NOT EXISTS manual_supervisor_nome text,
  ADD COLUMN IF NOT EXISTS manual_supervisor_email text,
  ADD COLUMN IF NOT EXISTS manual_registrado_por uuid,
  ADD COLUMN IF NOT EXISTS manual_registrado_em timestamptz;

ALTER TABLE public.ausencias
  DROP CONSTRAINT IF EXISTS ausencias_origem_registro_chk;
ALTER TABLE public.ausencias
  ADD CONSTRAINT ausencias_origem_registro_chk
  CHECK (origem_registro IN ('AUTOMATICO','MANUAL'));

ALTER TABLE public.ausencias
  DROP CONSTRAINT IF EXISTS ausencias_origem_coerencia_chk;
ALTER TABLE public.ausencias
  ADD CONSTRAINT ausencias_origem_coerencia_chk
  CHECK (
    (origem_registro = 'AUTOMATICO' AND colaborador_id IS NOT NULL)
    OR (origem_registro = 'MANUAL' AND colaborador_id IS NULL
        AND manual_nome IS NOT NULL AND manual_matricula IS NOT NULL
        AND manual_motivo IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS ausencias_origem_registro_idx
  ON public.ausencias (origem_registro);
CREATE INDEX IF NOT EXISTS ausencias_manual_matricula_idx
  ON public.ausencias (empresa_id, manual_matricula)
  WHERE origem_registro = 'MANUAL';

COMMENT ON COLUMN public.ausencias.origem_registro IS
  'AUTOMATICO = vinculado a colaborador cadastrado; MANUAL = preenchido à mão (colaborador não encontrado).';

-- 2. Validação: ramifica automático x manual
CREATE OR REPLACE FUNCTION public.tg_ausencias_valida()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_ativa boolean;
  v_projeto_empresa uuid;
  v_projeto_ativo boolean;
  v_colab_empresa uuid;
  v_colab_projeto uuid;
  v_colab_ativo boolean;
  v_manual boolean := (NEW.origem_registro = 'MANUAL');
BEGIN
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data final não pode ser anterior à data inicial.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.dias := (NEW.data_fim - NEW.data_inicio) + 1;
  IF NEW.dias < 1 THEN NEW.dias := 1; END IF;

  IF NEW.cid IS NOT NULL THEN
    NEW.cid := upper(regexp_replace(btrim(NEW.cid), '\s+', '', 'g'));
    IF NEW.cid = '' THEN NEW.cid := NULL; END IF;
  END IF;
  IF NEW.localidade IS NOT NULL THEN
    NEW.localidade := regexp_replace(btrim(NEW.localidade), '\s+', ' ', 'g');
    IF NEW.localidade = '' THEN NEW.localidade := NULL; END IF;
  END IF;
  IF NEW.loja_codigo_nome IS NOT NULL THEN
    NEW.loja_codigo_nome := regexp_replace(btrim(NEW.loja_codigo_nome), '\s+', ' ', 'g');
    IF NEW.loja_codigo_nome = '' THEN NEW.loja_codigo_nome := NULL; END IF;
  END IF;
  IF NEW.motivo IS NOT NULL AND btrim(NEW.motivo) = '' THEN NEW.motivo := NULL; END IF;
  IF NEW.tipo_detalhe IS NOT NULL THEN
    NEW.tipo_detalhe := btrim(NEW.tipo_detalhe);
    IF NEW.tipo_detalhe = '' THEN NEW.tipo_detalhe := NULL; END IF;
  END IF;
  IF NEW.dias_label IS NOT NULL THEN
    NEW.dias_label := btrim(NEW.dias_label);
    IF NEW.dias_label = '' THEN NEW.dias_label := NULL; END IF;
  END IF;

  -- Normalização dos campos manuais
  IF v_manual THEN
    NEW.manual_nome := nullif(regexp_replace(btrim(coalesce(NEW.manual_nome,'')), '\s+', ' ', 'g'), '');
    NEW.manual_matricula := nullif(btrim(coalesce(NEW.manual_matricula,'')), '');
    NEW.manual_cpf := nullif(regexp_replace(coalesce(NEW.manual_cpf,''), '\D', '', 'g'), '');
    NEW.manual_cargo := nullif(btrim(coalesce(NEW.manual_cargo,'')), '');
    NEW.manual_centro_custo := nullif(btrim(coalesce(NEW.manual_centro_custo,'')), '');
    NEW.manual_telefone := nullif(regexp_replace(coalesce(NEW.manual_telefone,''), '\D', '', 'g'), '');
    NEW.manual_email := nullif(lower(btrim(coalesce(NEW.manual_email,''))), '');
    NEW.manual_supervisor_nome := nullif(btrim(coalesce(NEW.manual_supervisor_nome,'')), '');
    NEW.manual_supervisor_email := nullif(lower(btrim(coalesce(NEW.manual_supervisor_email,''))), '');
    NEW.manual_motivo := nullif(btrim(coalesce(NEW.manual_motivo,'')), '');
    NEW.manual_motivo_detalhe := nullif(btrim(coalesce(NEW.manual_motivo_detalhe,'')), '');
    IF NEW.manual_nome IS NULL OR length(NEW.manual_nome) < 3 THEN
      RAISE EXCEPTION 'Informe o nome completo do colaborador (mínimo 3 caracteres).' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.manual_matricula IS NULL THEN
      RAISE EXCEPTION 'Informe a matrícula do colaborador.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.manual_motivo IS NULL THEN
      RAISE EXCEPTION 'Informe o motivo do preenchimento manual.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.manual_cpf IS NOT NULL AND length(NEW.manual_cpf) <> 11 THEN
      RAISE EXCEPTION 'CPF inválido.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.manual_registrado_por := coalesce(NEW.manual_registrado_por, NEW.registrado_por, auth.uid());
      NEW.manual_registrado_em := coalesce(NEW.manual_registrado_em, now());
    END IF;
  ELSE
    NEW.manual_nome := NULL; NEW.manual_matricula := NULL; NEW.manual_cpf := NULL;
    NEW.manual_cargo := NULL; NEW.manual_centro_custo := NULL; NEW.manual_telefone := NULL;
    NEW.manual_email := NULL; NEW.manual_supervisor_nome := NULL;
    NEW.manual_supervisor_email := NULL; NEW.manual_motivo := NULL;
    NEW.manual_motivo_detalhe := NULL; NEW.manual_registrado_por := NULL;
    NEW.manual_registrado_em := NULL;
  END IF;

  IF NEW.arquivo_url IS NULL OR btrim(NEW.arquivo_url) = '' THEN
    NEW.possui_anexo := false;
    NEW.arquivo_url := NULL; NEW.arquivo_nome := NULL; NEW.arquivo_mime := NULL; NEW.arquivo_tamanho := NULL;
  ELSE
    NEW.possui_anexo := true;
  END IF;

  SELECT empresa_id, ativo INTO v_projeto_empresa, v_projeto_ativo FROM public.projetos WHERE id = NEW.projeto_id;
  IF v_projeto_empresa IS NULL THEN RAISE EXCEPTION 'Projeto não encontrado.' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF v_projeto_empresa <> NEW.empresa_id THEN
    RAISE EXCEPTION 'O projeto selecionado não pertence à empresa informada.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_manual THEN
    SELECT empresa_id, projeto_id, ativo INTO v_colab_empresa, v_colab_projeto, v_colab_ativo
    FROM public.colaboradores WHERE id = NEW.colaborador_id;
    IF v_colab_empresa IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado.' USING ERRCODE = 'foreign_key_violation'; END IF;
    IF v_colab_empresa <> NEW.empresa_id OR v_colab_projeto <> NEW.projeto_id THEN
      RAISE EXCEPTION 'O colaborador não pertence à empresa e projeto informados.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT ativo INTO v_empresa_ativa FROM public.empresas WHERE id = NEW.empresa_id;
    IF v_empresa_ativa IS NOT TRUE THEN RAISE EXCEPTION 'A empresa está inativa.' USING ERRCODE = 'check_violation'; END IF;
    IF v_projeto_ativo IS NOT TRUE THEN RAISE EXCEPTION 'O projeto está inativo.' USING ERRCODE = 'check_violation'; END IF;
    IF NOT v_manual AND v_colab_ativo IS NOT TRUE THEN RAISE EXCEPTION 'O colaborador está inativo.' USING ERRCODE = 'check_violation'; END IF;

    IF NEW.localidade IS NULL THEN RAISE EXCEPTION 'Localidade é obrigatória.' USING ERRCODE = 'check_violation'; END IF;
    IF NEW.loja_codigo_nome IS NULL THEN RAISE EXCEPTION 'Código ou nome da loja é obrigatório.' USING ERRCODE = 'check_violation'; END IF;
    IF NEW.acidente_trabalho_trajeto IS NULL THEN RAISE EXCEPTION 'Informe se foi acidente de trabalho/trajeto.' USING ERRCODE = 'check_violation'; END IF;
    IF NEW.motivo IS NULL OR length(NEW.motivo) < 5 THEN RAISE EXCEPTION 'Motivo deve ter ao menos 5 caracteres.' USING ERRCODE = 'check_violation'; END IF;

    IF NEW.registrado_por IS NULL THEN NEW.registrado_por := auth.uid(); END IF;
    IF NEW.registrado_em IS NULL THEN NEW.registrado_em := now(); END IF;
    NEW.status := COALESCE(NEW.status, 'PENDENTE');
    IF NEW.status = 'LANCADO' THEN
      NEW.lancado_por := COALESCE(NEW.lancado_por, auth.uid());
      NEW.lancado_em := COALESCE(NEW.lancado_em, now());
    END IF;
  ELSE
    NEW.registrado_por := OLD.registrado_por;
    NEW.registrado_em := OLD.registrado_em;
    IF NEW.status = 'LANCADO' AND OLD.status <> 'LANCADO' THEN
      NEW.lancado_por := COALESCE(NEW.lancado_por, auth.uid());
      NEW.lancado_em := COALESCE(NEW.lancado_em, now());
    ELSIF NEW.status = 'PENDENTE' AND OLD.status = 'LANCADO' THEN
      NEW.lancado_por := NULL; NEW.lancado_em := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Escopo do supervisor: no modo manual valida o PROJETO
CREATE OR REPLACE FUNCTION public.tg_ausencia_supervisor_escopo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
  v_is_priv boolean;
  v_colab_projeto uuid;
  v_colab_empresa uuid;
  v_colab_sup uuid;
  v_manual boolean := (NEW.origem_registro = 'MANUAL');
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_supervisor := public.has_role(v_uid, 'supervisor'::app_role);
  v_is_priv := public.has_role(v_uid, 'super_admin'::app_role)
            OR public.has_role(v_uid, 'rh'::app_role);

  IF NEW.registrado_por IS NULL THEN
    NEW.registrado_por := v_uid;
  END IF;

  IF v_is_supervisor AND NOT v_is_priv THEN
    IF NEW.registrado_por <> v_uid THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','PERMISSAO_NEGADA','ausencia', NULL, false, 'trigger', v_uid,
              'Supervisor tentou definir registrado_por diferente do próprio usuário.');
      RAISE EXCEPTION 'Operação não permitida: responsável inválido.' USING ERRCODE = '42501';
    END IF;

    IF v_manual THEN
      IF NOT public.user_has_projeto(v_uid, NEW.projeto_id) THEN
        INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
        VALUES ('ausencias','AUSENCIA_TENTATIVA_FORA_DO_ESCOPO','projeto', NEW.projeto_id, false, 'trigger', v_uid,
                'Lançamento manual em projeto fora do escopo do supervisor.');
        RAISE EXCEPTION 'Projeto fora do seu escopo.' USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','AUSENCIA_CRIADA_POR_SUPERVISOR','ausencia', NEW.id, true, 'trigger', v_uid,
              'Ausência MANUAL criada por supervisor no projeto permitido. Motivo: ' || coalesce(NEW.manual_motivo,'-'));
      RETURN NEW;
    END IF;

    -- Colaborador precisa estar diretamente vinculado ao supervisor.
    SELECT projeto_id, empresa_id, supervisor_usuario_id
      INTO v_colab_projeto, v_colab_empresa, v_colab_sup
    FROM public.colaboradores WHERE id = NEW.colaborador_id;

    IF v_colab_sup IS NULL OR v_colab_sup <> v_uid THEN
      INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
      VALUES ('ausencias','AUSENCIA_TENTATIVA_FORA_DO_ESCOPO','colaborador', NEW.colaborador_id, false, 'trigger', v_uid,
              'Colaborador não está vinculado ao supervisor autenticado.');
      RAISE EXCEPTION 'Colaborador não está vinculado a você.' USING ERRCODE = '42501';
    END IF;

    IF NEW.projeto_id IS NOT NULL AND v_colab_projeto IS NOT NULL AND v_colab_projeto <> NEW.projeto_id THEN
      RAISE EXCEPTION 'Colaborador não pertence ao projeto informado.' USING ERRCODE = '42501';
    END IF;
    IF NEW.empresa_id IS NOT NULL AND v_colab_empresa IS NOT NULL AND v_colab_empresa <> NEW.empresa_id THEN
      RAISE EXCEPTION 'Colaborador não pertence à empresa informada.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, sucesso, origem, usuario_id, observacoes)
    VALUES ('ausencias','AUSENCIA_CRIADA_POR_SUPERVISOR','ausencia', NEW.id, true, 'trigger', v_uid,
            'Ausência criada por supervisor no escopo direto permitido.');
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. WhatsApp: pular registros manuais (sem colaborador vinculado)
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
  IF NEW.status::text <> 'LANCADO' THEN RETURN NULL; END IF;
  IF NEW.colaborador_id IS NULL THEN RETURN NULL; END IF;

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
END; $function$;

-- 5. RLS: registros manuais visíveis/editáveis pelo autor dentro do projeto
DROP POLICY IF EXISTS ausencias_manual_autor_select ON public.ausencias;
CREATE POLICY ausencias_manual_autor_select ON public.ausencias
  FOR SELECT TO authenticated
  USING (
    origem_registro = 'MANUAL'
    AND registrado_por = auth.uid()
    AND public.user_has_projeto(auth.uid(), projeto_id)
    AND (public.has_role(auth.uid(), 'supervisor'::app_role)
         OR public.has_role(auth.uid(), 'coordenador'::app_role))
  );

DROP POLICY IF EXISTS ausencias_manual_autor_insert ON public.ausencias;
CREATE POLICY ausencias_manual_autor_insert ON public.ausencias
  FOR INSERT TO authenticated
  WITH CHECK (
    origem_registro = 'MANUAL'
    AND registrado_por = auth.uid()
    AND public.user_has_projeto(auth.uid(), projeto_id)
    AND (public.has_role(auth.uid(), 'supervisor'::app_role)
         OR public.has_role(auth.uid(), 'coordenador'::app_role))
  );

DROP POLICY IF EXISTS ausencias_manual_autor_update ON public.ausencias;
CREATE POLICY ausencias_manual_autor_update ON public.ausencias
  FOR UPDATE TO authenticated
  USING (
    origem_registro = 'MANUAL'
    AND registrado_por = auth.uid()
    AND public.user_has_projeto(auth.uid(), projeto_id)
    AND (public.has_role(auth.uid(), 'supervisor'::app_role)
         OR public.has_role(auth.uid(), 'coordenador'::app_role))
  )
  WITH CHECK (
    origem_registro = 'MANUAL'
    AND registrado_por = auth.uid()
    AND public.user_has_projeto(auth.uid(), projeto_id)
    AND (public.has_role(auth.uid(), 'supervisor'::app_role)
         OR public.has_role(auth.uid(), 'coordenador'::app_role))
  );
