
-- 1) Configurar código ADM (bloqueia se alguém já tiver assumido o valor)
DO $$
DECLARE v_conflito text;
BEGIN
  SELECT nome INTO v_conflito FROM public.projetos
   WHERE upper(codigo_protocolo) = 'ADM'
     AND id <> '93eb6d03-4514-4f51-8fd4-a94a649c343b';
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'CODIGO_ADM_EM_USO_POR: %', v_conflito;
  END IF;
END $$;

UPDATE public.projetos
   SET codigo_protocolo = 'ADM', updated_at = now()
 WHERE id = '93eb6d03-4514-4f51-8fd4-a94a649c343b'
   AND (codigo_protocolo IS NULL OR codigo_protocolo = '');

INSERT INTO public.audit_logs
  (usuario_id, modulo, entidade, registro_id, projeto_id,
   acao, sucesso, observacoes, depois)
VALUES
  (NULL, 'PROTOCOLO', 'projetos',
   '93eb6d03-4514-4f51-8fd4-a94a649c343b',
   '93eb6d03-4514-4f51-8fd4-a94a649c343b',
   'UPDATE'::audit_action, true, 'CODIGO_PROTOCOLO_CONFIGURADO',
   jsonb_build_object('projeto', 'ADMINISTRATIVO', 'codigo_protocolo', 'ADM'));

-- 2) Backfill dos históricos elegíveis (chama a função oficial → auditoria automática)
DO $$
DECLARE r record; v_proto text;
BEGIN
  FOR r IN
    SELECT a.id, a.projeto_id, a.data_inicio, a.created_at
      FROM public.ausencias a
     WHERE a.protocolo IS NULL
     ORDER BY a.created_at, a.id
  LOOP
    v_proto := public.gerar_protocolo_ausencia(
      r.projeto_id, COALESCE(r.data_inicio, r.created_at::date)
    );
    UPDATE public.ausencias SET protocolo = v_proto WHERE id = r.id;

    INSERT INTO public.audit_logs
      (usuario_id, modulo, entidade, registro_id, projeto_id,
       acao, sucesso, observacoes, depois)
    VALUES
      (NULL, 'PROTOCOLO', 'ausencias', r.id, r.projeto_id,
       'CREATE'::audit_action, true, 'PROTOCOLO_BACKFILL_GERADO',
       jsonb_build_object('ausencia_id', r.id, 'protocolo', v_proto));
  END LOOP;
END $$;
