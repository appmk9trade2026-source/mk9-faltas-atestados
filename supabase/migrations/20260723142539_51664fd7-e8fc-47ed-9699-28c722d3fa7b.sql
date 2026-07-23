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
  v_empresa_norm text;
  v_projeto_norm text;
  v_count int;
  v_projetos_equivalentes text;
  v_supervisor_email text;
  v_supervisor_uid uuid;
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
      v_empresa_id := NULL;
      v_projeto_id := NULL;

      IF nullif(v_row->>'empresa_id','') IS NOT NULL THEN
        v_empresa_id := (v_row->>'empresa_id')::uuid;
        PERFORM 1 FROM public.empresas WHERE id = v_empresa_id AND ativo = true;
        IF NOT FOUND THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            'Empresa não encontrada ou inativa (empresa_id inválido).');
          CONTINUE;
        END IF;
      ELSE
        v_empresa_norm := public.normalize_name(v_row->>'empresa');
        IF v_empresa_norm = '' THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Empresa obrigatória.');
          CONTINUE;
        END IF;
        SELECT count(*), (array_agg(id ORDER BY id))[1]
          INTO v_count, v_empresa_id
        FROM public.empresas
        WHERE public.normalize_name(nome) = v_empresa_norm
          AND ativo = true;
        IF v_count = 0 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Empresa "%s" não encontrada.', v_row->>'empresa'));
          CONTINUE;
        ELSIF v_count > 1 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Existem várias empresas cadastradas como "%s".', v_row->>'empresa'));
          CONTINUE;
        END IF;
      END IF;

      IF nullif(v_row->>'projeto_id','') IS NOT NULL THEN
        v_projeto_id := (v_row->>'projeto_id')::uuid;
        PERFORM 1 FROM public.projetos WHERE id = v_projeto_id AND empresa_id = v_empresa_id AND ativo = true;
        IF NOT FOUND THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            'Projeto inválido para a empresa informada.');
          CONTINUE;
        END IF;
      ELSE
        v_projeto_norm := public.normalize_name(v_row->>'projeto');
        IF v_projeto_norm = '' THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Projeto obrigatório.');
          CONTINUE;
        END IF;
        SELECT count(*), (array_agg(id ORDER BY id))[1]
          INTO v_count, v_projeto_id
        FROM public.projetos
        WHERE empresa_id = v_empresa_id
          AND public.normalize_name(nome) = v_projeto_norm
          AND ativo = true;
        IF v_count = 0 THEN
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Projeto "%s" não foi encontrado na empresa "%s", mesmo após normalização de espaços, acentos e hífens.',
                   v_row->>'projeto', v_row->>'empresa'));
          CONTINUE;
        ELSIF v_count > 1 THEN
          SELECT string_agg(format('"%s"', nome), ', ' ORDER BY nome)
            INTO v_projetos_equivalentes
          FROM public.projetos
          WHERE empresa_id = v_empresa_id
            AND public.normalize_name(nome) = v_projeto_norm
            AND ativo = true;
          v_errors := v_errors + 1;
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro',
            format('Projeto ambíguo: existem cadastros equivalentes na empresa "%s" (%s). Selecione o projeto correto no preview.',
                   v_row->>'empresa', coalesce(v_projetos_equivalentes,'')));
          v_projeto_id := NULL;
          CONTINUE;
        END IF;
      END IF;

      -- Resolver supervisor pelo e-mail
      v_supervisor_email := lower(btrim(coalesce(v_row->>'supervisor_email','')));
      v_supervisor_uid := NULL;
      IF v_supervisor_email <> '' THEN
        v_supervisor_uid := public.resolve_supervisor_usuario_id(v_supervisor_email);
      END IF;

      SELECT id INTO v_existing_id FROM public.colaboradores
        WHERE empresa_id = v_empresa_id AND matricula = v_matricula LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        IF _atualizar THEN
          -- Regra: nunca apagar supervisor_email já gravado quando a planilha
          -- vier com valor vazio (leitura incorreta / coluna ausente). Só
          -- sobrescreve quando há novo valor não vazio.
          UPDATE public.colaboradores SET
            projeto_id = v_projeto_id,
            nome_completo = COALESCE(NULLIF(v_row->>'nome_completo',''), nome_completo),
            telefone = NULLIF(v_row->>'telefone',''),
            whatsapp = NULLIF(v_row->>'whatsapp',''),
            email = NULLIF(v_row->>'email',''),
            supervisor_nome = COALESCE(NULLIF(v_row->>'supervisor_nome',''), supervisor_nome),
            supervisor_telefone = COALESCE(NULLIF(v_row->>'supervisor_telefone',''), supervisor_telefone),
            supervisor_email = COALESCE(NULLIF(v_supervisor_email,''), supervisor_email),
            supervisor_usuario_id = COALESCE(v_supervisor_uid, supervisor_usuario_id)
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
          supervisor_usuario_id, ativo
        ) VALUES (
          v_empresa_id, v_projeto_id,
          v_matricula, v_row->>'nome_completo',
          NULLIF(v_row->>'telefone',''), NULLIF(v_row->>'whatsapp',''), NULLIF(v_row->>'email',''),
          NULLIF(v_row->>'supervisor_nome',''), NULLIF(v_row->>'supervisor_telefone',''), NULLIF(v_supervisor_email,''),
          v_supervisor_uid, true
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