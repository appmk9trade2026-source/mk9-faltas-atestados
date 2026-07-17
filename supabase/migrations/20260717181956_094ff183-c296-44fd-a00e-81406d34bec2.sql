
-- Import history table
CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome text NOT NULL,
  arquivo_tamanho bigint,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  total_linhas integer NOT NULL DEFAULT 0,
  importadas integer NOT NULL DEFAULT 0,
  atualizadas integer NOT NULL DEFAULT 0,
  ignoradas integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  duracao_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'SUCESSO',
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.importacoes TO authenticated;
GRANT ALL ON public.importacoes TO service_role;

ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "importacoes_select_admin_rh_sup_comp" ON public.importacoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR
    public.has_role(auth.uid(),'rh') OR
    public.has_role(auth.uid(),'supervisor') OR
    public.has_role(auth.uid(),'compliance')
  );

CREATE POLICY "importacoes_insert_admin_rh" ON public.importacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid() AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')
    )
  );

CREATE POLICY "importacoes_update_admin_rh" ON public.importacoes
  FOR UPDATE TO authenticated
  USING (
    usuario_id = auth.uid() AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'rh')
    )
  );

CREATE TRIGGER tg_importacoes_updated_at
  BEFORE UPDATE ON public.importacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Bulk import RPC. Receives already-validated rows.
-- Runs INSERT / UPDATE inside a single function (single transaction).
CREATE OR REPLACE FUNCTION public.import_colaboradores_bulk(
  _rows jsonb,
  _atualizar boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_empresa_id uuid;
  v_projeto_id uuid;
  v_existing_id uuid;
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
        WHERE empresa_id = v_empresa_id AND matricula = v_row->>'matricula' LIMIT 1;

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
          v_details := v_details || jsonb_build_object('linha', v_row->>'linha', 'erro', 'Matrícula já existe (ignorada)');
        END IF;
      ELSE
        INSERT INTO public.colaboradores(
          empresa_id, projeto_id, matricula, nome_completo,
          telefone, whatsapp, email,
          supervisor_nome, supervisor_telefone, supervisor_email,
          ativo
        ) VALUES (
          v_empresa_id, v_projeto_id,
          v_row->>'matricula', v_row->>'nome_completo',
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
$$;

GRANT EXECUTE ON FUNCTION public.import_colaboradores_bulk(jsonb, boolean) TO authenticated;
