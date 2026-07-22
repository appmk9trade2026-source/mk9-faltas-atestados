
-- Endurecer políticas do bucket 'atestados' para checar ownership por caminho
-- Convenção de caminho: ausencias/{colaborador_id}/...

-- Helper: valida se o usuário pode acessar arquivos de um caminho, com base no
-- colaborador_id extraído do segundo segmento do path. Super admin/RH/Compliance
-- veem todos; Supervisor apenas se estiver vinculado ao projeto do colaborador.
CREATE OR REPLACE FUNCTION public.atestado_path_visivel_para(_name text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _colab_id uuid;
  _projeto_id uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- Super admin, RH e Compliance têm acesso pleno (mesmo escopo já autorizado
  -- pelas policies de colaboradores/ausencias).
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN true;
  END IF;

  -- Supervisor: precisa estar vinculado ao projeto do colaborador.
  IF public.has_role(_user_id, 'supervisor'::app_role) THEN
    BEGIN
      _colab_id := (split_part(_name, '/', 2))::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF _colab_id IS NULL THEN RETURN false; END IF;

    SELECT c.projeto_id INTO _projeto_id
    FROM public.colaboradores c
    WHERE c.id = _colab_id;

    IF _projeto_id IS NULL THEN RETURN false; END IF;
    RETURN public.user_has_projeto(_user_id, _projeto_id);
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atestado_path_visivel_para(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atestado_path_visivel_para(text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS atestados_leitura_autorizada ON storage.objects;
DROP POLICY IF EXISTS atestados_upload_gestao ON storage.objects;
DROP POLICY IF EXISTS atestados_update_gestao ON storage.objects;
DROP POLICY IF EXISTS atestados_delete_gestao ON storage.objects;

-- SELECT: ownership real por caminho.
CREATE POLICY atestados_leitura_autorizada ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'atestados'
  AND public.atestado_path_visivel_para(name, auth.uid())
);

-- INSERT: super admin/RH podem em qualquer caminho; supervisor apenas
-- dentro do escopo do seu projeto (path convention ausencias/{colaborador_id}/...).
CREATE POLICY atestados_upload_gestao ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'atestados'
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'rh'::app_role)
    OR (
      public.has_role(auth.uid(), 'supervisor'::app_role)
      AND public.atestado_path_visivel_para(name, auth.uid())
    )
  )
);

-- UPDATE: super admin/RH somente.
CREATE POLICY atestados_update_gestao ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'atestados'
  AND (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'rh'::app_role))
)
WITH CHECK (
  bucket_id = 'atestados'
  AND (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'rh'::app_role))
);

-- DELETE: super admin somente (mantém política anterior).
CREATE POLICY atestados_delete_gestao ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'atestados'
  AND public.has_role(auth.uid(), 'super_admin'::app_role)
);
