
ALTER TABLE public.ausencias
  ADD COLUMN IF NOT EXISTS localidade text,
  ADD COLUMN IF NOT EXISTS cid text,
  ADD COLUMN IF NOT EXISTS loja_codigo_nome text,
  ADD COLUMN IF NOT EXISTS acidente_trabalho_trajeto boolean;

-- data_retorno como coluna gerada (data_fim + 1)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ausencias' AND column_name='data_retorno'
  ) THEN
    EXECUTE 'ALTER TABLE public.ausencias ADD COLUMN data_retorno date GENERATED ALWAYS AS (data_fim + 1) STORED';
  END IF;
END $$;

-- Atualiza trigger para normalizar CID e validar novos campos obrigatórios em novos registros
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
BEGIN
  -- Datas
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'A data final não pode ser anterior à data inicial.'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.dias := (NEW.data_fim - NEW.data_inicio) + 1;
  IF NEW.dias < 1 THEN NEW.dias := 1; END IF;

  -- Normalizações
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
  IF NEW.motivo IS NOT NULL THEN
    IF btrim(NEW.motivo) = '' THEN NEW.motivo := NULL; END IF;
  END IF;

  -- Coerência do anexo
  IF NEW.arquivo_url IS NULL OR btrim(NEW.arquivo_url) = '' THEN
    NEW.possui_anexo := false;
    NEW.arquivo_url := NULL;
    NEW.arquivo_nome := NULL;
    NEW.arquivo_mime := NULL;
    NEW.arquivo_tamanho := NULL;
  ELSE
    NEW.possui_anexo := true;
  END IF;

  -- Vínculos
  SELECT empresa_id, ativo INTO v_projeto_empresa, v_projeto_ativo
  FROM public.projetos WHERE id = NEW.projeto_id;
  IF v_projeto_empresa IS NULL THEN
    RAISE EXCEPTION 'Projeto não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_projeto_empresa <> NEW.empresa_id THEN
    RAISE EXCEPTION 'O projeto selecionado não pertence à empresa informada.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT empresa_id, projeto_id, ativo
    INTO v_colab_empresa, v_colab_projeto, v_colab_ativo
  FROM public.colaboradores WHERE id = NEW.colaborador_id;
  IF v_colab_empresa IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_colab_empresa <> NEW.empresa_id OR v_colab_projeto <> NEW.projeto_id THEN
    RAISE EXCEPTION 'O colaborador não pertence à empresa e projeto informados.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT ativo INTO v_empresa_ativa FROM public.empresas WHERE id = NEW.empresa_id;
    IF v_empresa_ativa IS NOT TRUE THEN
      RAISE EXCEPTION 'A empresa está inativa.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_projeto_ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'O projeto está inativo.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_colab_ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'O colaborador está inativo.' USING ERRCODE = 'check_violation';
    END IF;

    -- Campos obrigatórios em novos registros
    IF NEW.localidade IS NULL THEN
      RAISE EXCEPTION 'Localidade é obrigatória.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.loja_codigo_nome IS NULL THEN
      RAISE EXCEPTION 'Código ou nome da loja é obrigatório.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.acidente_trabalho_trajeto IS NULL THEN
      RAISE EXCEPTION 'Informe se foi acidente de trabalho/trajeto.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.motivo IS NULL OR length(NEW.motivo) < 5 THEN
      RAISE EXCEPTION 'Motivo deve ter ao menos 5 caracteres.' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.registrado_por IS NULL THEN
      NEW.registrado_por := auth.uid();
    END IF;
    IF NEW.registrado_em IS NULL THEN
      NEW.registrado_em := now();
    END IF;
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
      NEW.lancado_por := NULL;
      NEW.lancado_em := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
