-- 1) Função IMMUTABLE de normalização compartilhada
CREATE OR REPLACE FUNCTION public.normalize_matricula(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _v IS NULL THEN NULL
    ELSE upper(regexp_replace(btrim(_v), '\s+', '', 'g'))
  END
$$;

-- 2) Novo evento de auditoria
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'audit_action' AND e.enumlabel = 'COLABORADOR_DUPLICIDADE_BLOQUEADA'
  ) THEN
    ALTER TYPE public.audit_action ADD VALUE 'COLABORADOR_DUPLICIDADE_BLOQUEADA';
  END IF;
END $$;

-- 3) Trigger passa a usar a função compartilhada (agora inclui UPPER)
CREATE OR REPLACE FUNCTION public.tg_colaboradores_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.matricula := public.normalize_matricula(NEW.matricula);
  NEW.nome_completo := regexp_replace(btrim(NEW.nome_completo), '\s+', ' ', 'g');

  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;

  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF NEW.cpf = '' THEN NEW.cpf := NULL; END IF;
  END IF;

  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := regexp_replace(NEW.telefone, '\D', '', 'g');
    IF NEW.telefone = '' THEN NEW.telefone := NULL; END IF;
  END IF;

  IF NEW.whatsapp IS NOT NULL THEN
    NEW.whatsapp := regexp_replace(NEW.whatsapp, '\D', '', 'g');
    IF NEW.whatsapp = '' THEN NEW.whatsapp := NULL; END IF;
  END IF;

  IF NEW.cargo IS NOT NULL THEN
    NEW.cargo := btrim(NEW.cargo);
    IF NEW.cargo = '' THEN NEW.cargo := NULL; END IF;
  END IF;

  IF NEW.observacoes IS NOT NULL THEN
    IF btrim(NEW.observacoes) = '' THEN NEW.observacoes := NULL; END IF;
  END IF;

  IF NEW.supervisor_nome IS NOT NULL THEN
    NEW.supervisor_nome := regexp_replace(btrim(NEW.supervisor_nome), '\s+', ' ', 'g');
    IF NEW.supervisor_nome = '' THEN NEW.supervisor_nome := NULL; END IF;
  END IF;

  IF NEW.supervisor_telefone IS NOT NULL THEN
    NEW.supervisor_telefone := regexp_replace(NEW.supervisor_telefone, '\D', '', 'g');
    IF NEW.supervisor_telefone = '' THEN NEW.supervisor_telefone := NULL; END IF;
  END IF;

  IF NEW.supervisor_email IS NOT NULL THEN
    NEW.supervisor_email := lower(btrim(NEW.supervisor_email));
    IF NEW.supervisor_email = '' THEN NEW.supervisor_email := NULL; END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Backfill seguro: normaliza somente onde não gera colisão com registro existente
UPDATE public.colaboradores c
SET matricula = public.normalize_matricula(c.matricula)
WHERE c.matricula IS DISTINCT FROM public.normalize_matricula(c.matricula)
  AND NOT EXISTS (
    SELECT 1 FROM public.colaboradores c2
    WHERE c2.empresa_id = c.empresa_id
      AND c2.id <> c.id
      AND c2.matricula = public.normalize_matricula(c.matricula)
  );

-- 5) RPC de importação passa a normalizar a matrícula
CREATE OR REPLACE FUNCTION public.import_colaboradores_bulk(_rows jsonb, _atualizar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_empresa_id uuid;
  v_projeto_id uuid;
  v_existing_id uuid;
  v_matricula text;
  v_inserted int := 0;
  v_updated  int := 0;
  v_skipped  int := 0;
  v_errors   int := 0;
  v_details  jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')) THEN
    RAISE EXCEPTION 'Sem permissão para importar colaboradores.' USING ERRCODE='insufficient_privilege';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows)
  LOOP
    BEGIN
      v_matricula := public.normalize_matricula(v_row->>'matricula');

      SELECT id INTO v_empresa_id FROM public.empresas
        WHERE lower(nome) = lower(v_row->>'empresa') AND ativo = true LIMIT 1;
      IF v_empresa_id IS NULL THEN
        v_errors := v_errors + 1;
        v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Empresa inexistente ou inativa');
        CONTINUE;
      END IF;

      SELECT id INTO v_projeto_id FROM public.projetos
        WHERE empresa_id = v_empresa_id AND lower(nome) = lower(v_row->>'projeto') AND ativo = true LIMIT 1;
      IF v_projeto_id IS NULL THEN
        v_errors := v_errors + 1;
        v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Projeto inexistente/inativo ou não pertence à empresa');
        CONTINUE;
      END IF;

      SELECT id INTO v_existing_id FROM public.colaboradores
        WHERE empresa_id = v_empresa_id AND matricula = v_matricula LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        IF _atualizar THEN
          UPDATE public.colaboradores SET
            telefone = NULLIF(v_row->>'telefone',''),
            whatsapp = NULLIF(v_row->>'whatsapp',''),
            email = NULLIF(v_row->>'email',''),
            supervisor_nome = NULLIF(v_row->>'supervisor_nome',''),
            supervisor_telefone = NULLIF(v_row->>'supervisor_telefone',''),
            supervisor_email = NULLIF(v_row->>'supervisor_email','')
          WHERE id = v_existing_id;
          v_updated := v_updated + 1;
        ELSE
          v_skipped := v_skipped + 1;
          v_details := v_details || jsonb_build_object(
            'linha', v_row->>'linha',
            'erro', 'Matrícula já existe (ignorada)',
            'matricula_normalizada', v_matricula,
            'colaborador_existente', v_existing_id
          );
          -- Auditoria específica para duplicidade
          BEGIN
            INSERT INTO public.audit_logs (
              usuario_id, empresa_id, modulo, acao, entidade,
              sucesso, origem, observacoes, depois
            ) VALUES (
              auth.uid(), v_empresa_id, 'colaboradores',
              'COLABORADOR_DUPLICIDADE_BLOQUEADA', 'colaborador',
              false, 'importacao',
              'Tentativa de importação bloqueada por duplicidade (empresa + matrícula)',
              jsonb_build_object(
                'matricula_informada', v_row->>'matricula',
                'matricula_normalizada', v_matricula,
                'colaborador_existente_id', v_existing_id,
                'linha', v_row->>'linha'
              )
            );
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;
      ELSE
        INSERT INTO public.colaboradores(
          empresa_id, projeto_id, matricula, nome_completo,
          telefone, whatsapp, email,
          supervisor_nome, supervisor_telefone, supervisor_email,
          ativo
        ) VALUES (
          v_empresa_id, v_projeto_id,
          v_matricula, v_row->>'nome_completo',
          NULLIF(v_row->>'telefone',''), NULLIF(v_row->>'whatsapp',''), NULLIF(v_row->>'email',''),
          NULLIF(v_row->>'supervisor_nome',''), NULLIF(v_row->>'supervisor_telefone',''), NULLIF(v_row->>'supervisor_email',''),
          true
        );
        v_inserted := v_inserted + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inseridas', v_inserted,
    'atualizadas', v_updated,
    'ignoradas', v_skipped,
    'erros', v_errors,
    'detalhes', v_details
  );
END;
$function$;