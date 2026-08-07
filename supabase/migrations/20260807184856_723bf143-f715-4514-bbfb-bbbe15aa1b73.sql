-- CRM MK9 — CORREÇÃO CIRÚRGICA DO RLS DO STORAGE PARA COORDENADOR
-- MODO: IMPLEMENTAÇÃO CONTROLADA APÓS CAUSA RAIZ COMPROVADA

-- ETAPA 2 e 3: EXTENDER O HELPER PARA COORDENADOR
-- Adiciona suporte ao papel 'coordenador' no helper de visibilidade de atestado.
-- O Coordenador deve visualizar/enviar documento somente quando o colaborador 
-- pertencer a um Supervisor que está sob sua coordenação.

CREATE OR REPLACE FUNCTION public.atestado_path_visivel_para(_name text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _colab_id uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Acesso privilegiado (RH, Super Admin, Compliance)
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN true;
  END IF;

  -- Extração do colaborador_id do path (convenção: ausencias/{colaborador_id}/...)
  BEGIN
    _colab_id := (split_part(_name, '/', 2))::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF _colab_id IS NULL THEN RETURN false; END IF;

  -- 2. Escopo de Supervisor (vínculo direto)
  IF public.has_role(_user_id, 'supervisor'::app_role) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.colaboradores c
      WHERE c.id = _colab_id
        AND c.supervisor_usuario_id = _user_id
    );
  END IF;

  -- 3. Escopo de Coordenador (vínculo via Supervisor da equipe)
  IF public.has_role(_user_id, 'coordenador'::app_role) THEN
    RETURN EXISTS (
      SELECT 1 
      FROM public.colaboradores c
      JOIN public.profiles p ON p.id = c.supervisor_usuario_id
      WHERE c.id = _colab_id
        AND p.coordenador_usuario_id = _user_id
    );
  END IF;

  RETURN false;
END;
$function$;

-- ETAPA 5 e 6: ATUALIZAR POLICIES DE STORAGE
-- Inclui o papel 'coordenador' nas políticas de leitura e upload.

-- Política de Upload (INSERT)
DROP POLICY IF EXISTS atestados_upload_gestao ON storage.objects;
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
    OR (
      public.has_role(auth.uid(), 'coordenador'::app_role)
      AND public.atestado_path_visivel_para(name, auth.uid())
    )
  )
);

-- Política de Leitura (SELECT)
-- Já utiliza o helper, mas a recriação garante integridade com o novo helper.
DROP POLICY IF EXISTS atestados_leitura_autorizada ON storage.objects;
CREATE POLICY atestados_leitura_autorizada ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'atestados'
  AND public.atestado_path_visivel_para(name, auth.uid())
);
