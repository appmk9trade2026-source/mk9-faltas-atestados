
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
  -- 1. Datas (Sempre valida)
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data final não pode ser anterior à data inicial.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.dias := (NEW.data_fim - NEW.data_inicio) + 1;
  IF NEW.dias < 1 THEN NEW.dias := 1; END IF;

  -- 2. Normalizações (Sempre aplica)
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
  END IF;

  IF NEW.arquivo_url IS NULL OR btrim(NEW.arquivo_url) = '' THEN
    NEW.possui_anexo := false;
    NEW.arquivo_url := NULL; NEW.arquivo_nome := NULL; NEW.arquivo_mime := NULL; NEW.arquivo_tamanho := NULL;
  ELSE
    NEW.possui_anexo := true;
  END IF;

  -- 3. Validação de Vínculo Estrutural (REGRA CIRÚRGICA)
  -- Valida em INSERT ou se campos chave mudaram em UPDATE
  IF TG_OP = 'INSERT' OR 
     OLD.colaborador_id IS DISTINCT FROM NEW.colaborador_id OR
     OLD.empresa_id IS DISTINCT FROM NEW.empresa_id OR
     OLD.projeto_id IS DISTINCT FROM NEW.projeto_id 
  THEN
    SELECT empresa_id, ativo INTO v_projeto_empresa, v_projeto_ativo FROM public.projetos WHERE id = NEW.projeto_id;
    IF v_projeto_empresa IS NULL THEN RAISE EXCEPTION 'Projeto não encontrado.' USING ERRCODE = 'foreign_key_violation'; END IF;
    IF v_projeto_empresa <> NEW.empresa_id THEN
      RAISE EXCEPTION 'O projeto selecionado não pertence à empresa informada.' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT v_manual THEN
      SELECT empresa_id, projeto_id, ativo INTO v_colab_empresa, v_colab_projeto, v_colab_ativo 
      FROM public.colaboradores WHERE id = NEW.colaborador_id;
      IF v_colab_empresa IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado.' USING ERRCODE = 'foreign_key_violation'; END IF;
      
      -- Se for um lançamento (INSERT) ou se o vínculo foi alterado propositalmente (Retificação estrutural)
      -- Deve-se garantir que o colaborador pertence à empresa/projeto.
      IF v_colab_empresa <> NEW.empresa_id OR v_colab_projeto <> NEW.projeto_id THEN
        RAISE EXCEPTION 'O colaborador não pertence à empresa e projeto informados.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- 4. Validações de Estado (INSERT)
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
  END IF;

  RETURN NEW;
END;
$function$;
