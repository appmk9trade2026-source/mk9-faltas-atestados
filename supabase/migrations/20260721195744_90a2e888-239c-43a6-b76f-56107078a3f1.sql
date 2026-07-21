
DO $$
DECLARE
  v_pair RECORD;
  v_corr text;
  v_nome_antigo text;
  v_nome_dup text;
BEGIN
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('e25974c8-e37f-4916-99a5-cce2755679bb'::uuid, '8903ba00-f191-4b59-8d18-b60108509697'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV AS DIRETA AC'),
      ('facc14d5-c552-4f2a-aa22-452889d4e9d9'::uuid, '3e7730fb-de8e-47cc-96b9-188ea7c4712d'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV AS DIRETA MT'),
      ('5507193a-16d4-4097-852c-20b8db652b68'::uuid, '92177aab-129e-4033-90da-c26c4c784dd6'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV AS DIRETA TO'),
      ('680c2dc4-cb8a-44c7-a6a0-75fbefbeb77d'::uuid, '0be0ea6f-fc11-4507-8ecb-23ae85536aa5'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV AS ROTA PB'),
      ('f445e224-47a2-48b9-b738-88c28c9b4ac2'::uuid, 'b6fe27bc-a9a2-4e5d-9143-c3886dde45c9'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV REDE AM'),
      ('eca8e3c9-4044-457c-a5b2-6b2454058be1'::uuid, '3a71ea6c-2b71-4471-bb9f-b27d39b6281d'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV REDE DF'),
      ('50552cf0-18b2-4309-8481-06fcbba6a75b'::uuid, 'fb161da5-34f7-406a-902e-25a01fdcba15'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV REDE GO'),
      ('00ccfdee-4cd5-4659-8462-d239ae86b497'::uuid, 'a385ee1a-6436-4b25-b6b4-853422f3cdf6'::uuid, '0a6c2ac6-2872-47a0-b818-b4660ef81244'::uuid, 'AMBEV REDE MT')
    ) AS t(principal_id, duplicado_id, empresa_id_hint, nome_final)
  LOOP
    v_corr := gen_random_uuid()::text;

    SELECT nome INTO v_nome_antigo FROM public.projetos WHERE id = v_pair.principal_id FOR UPDATE;
    SELECT nome INTO v_nome_dup FROM public.projetos WHERE id = v_pair.duplicado_id FOR UPDATE;

    UPDATE public.colaboradores SET projeto_id = v_pair.principal_id WHERE projeto_id = v_pair.duplicado_id;
    UPDATE public.ausencias SET projeto_id = v_pair.principal_id WHERE projeto_id = v_pair.duplicado_id;
    UPDATE public.alertas SET projeto_id = v_pair.principal_id WHERE projeto_id = v_pair.duplicado_id;
    UPDATE public.ai_conversations SET projeto_id = v_pair.principal_id WHERE projeto_id = v_pair.duplicado_id;

    DELETE FROM public.usuario_projetos up_d
      WHERE up_d.projeto_id = v_pair.duplicado_id
        AND EXISTS (
          SELECT 1 FROM public.usuario_projetos up_p
          WHERE up_p.projeto_id = v_pair.principal_id AND up_p.user_id = up_d.user_id
        );
    UPDATE public.usuario_projetos SET projeto_id = v_pair.principal_id WHERE projeto_id = v_pair.duplicado_id;

    UPDATE public.projeto_protocolo_sequencias s
      SET ultimo_numero = GREATEST(s.ultimo_numero, c.n_dup), updated_at = now()
      FROM (
        SELECT s_d.ano, s_d.ultimo_numero AS n_dup
        FROM public.projeto_protocolo_sequencias s_d
        JOIN public.projeto_protocolo_sequencias s_p
          ON s_p.projeto_id = v_pair.principal_id AND s_p.ano = s_d.ano
        WHERE s_d.projeto_id = v_pair.duplicado_id
      ) c
      WHERE s.projeto_id = v_pair.principal_id AND s.ano = c.ano;
    DELETE FROM public.projeto_protocolo_sequencias
      WHERE projeto_id = v_pair.duplicado_id
        AND ano IN (SELECT ano FROM public.projeto_protocolo_sequencias WHERE projeto_id = v_pair.principal_id);
    UPDATE public.projeto_protocolo_sequencias SET projeto_id = v_pair.principal_id WHERE projeto_id = v_pair.duplicado_id;

    UPDATE public.projetos
      SET nome = left(v_nome_dup, 90) || ' [ARQ ' || substring(v_pair.duplicado_id::text, 1, 8) || ']',
          ativo = false,
          descricao = COALESCE(descricao,'') ||
            CASE WHEN COALESCE(descricao,'') = '' THEN '' ELSE ' | ' END ||
            '[Consolidado em ' || v_pair.principal_id::text || ' — ' || to_char(now(),'YYYY-MM-DD') || ']',
          updated_at = now()
      WHERE id = v_pair.duplicado_id;

    UPDATE public.projetos
      SET nome = v_pair.nome_final, updated_at = now()
      WHERE id = v_pair.principal_id;

    INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, projeto_id, empresa_id, depois, sucesso, observacoes, origem)
    VALUES (
      'projetos', 'PROJETO_EDITADO', 'projeto', v_pair.principal_id, v_pair.principal_id, v_pair.empresa_id_hint,
      jsonb_build_object(
        'nome_antigo', v_nome_antigo,
        'nome_novo', v_pair.nome_final,
        'consolidacao_correlation_id', v_corr,
        'origem', 'migration_fix_import_20260721'
      ),
      true,
      'Consolidação pós-importação — nome atualizado para versão da planilha',
      'migration'
    );

    INSERT INTO public.audit_logs (modulo, acao, entidade, registro_id, projeto_id, empresa_id, depois, sucesso, observacoes, origem)
    VALUES (
      'projetos', 'PROJETO_ARQUIVADO_AUTOMATICO', 'projeto', v_pair.duplicado_id, v_pair.duplicado_id, v_pair.empresa_id_hint,
      jsonb_build_object(
        'motivo', 'duplicado_equivalente',
        'principal_id', v_pair.principal_id,
        'nome_original', v_nome_dup,
        'consolidacao_correlation_id', v_corr,
        'origem', 'migration_fix_import_20260721'
      ),
      true,
      'Duplicado equivalente arquivado após transferência de vínculos',
      'migration'
    );
  END LOOP;
END $$;
