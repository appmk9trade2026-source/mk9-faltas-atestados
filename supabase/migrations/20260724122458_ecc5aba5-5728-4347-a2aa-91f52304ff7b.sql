
-- Permite ao Supervisor visualizar (somente leitura) os projetos referenciados
-- pelos seus próprios colaboradores, para que empresa/projeto do colaborador
-- carreguem corretamente ao buscar pela matrícula e para popular o select
-- de projetos no formulário de Nova Ausência.
-- Escopo mantido: apenas projetos ligados à equipe do supervisor.
CREATE OR REPLACE FUNCTION public.supervisor_has_projeto_via_equipe(_user_id uuid, _projeto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores c
    WHERE c.supervisor_usuario_id = _user_id
      AND c.projeto_id = _projeto_id
  );
$$;

REVOKE ALL ON FUNCTION public.supervisor_has_projeto_via_equipe(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisor_has_projeto_via_equipe(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "supervisor_projetos_via_equipe_select" ON public.projetos;
CREATE POLICY "supervisor_projetos_via_equipe_select"
ON public.projetos
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND ativo = true
  AND public.supervisor_has_projeto_via_equipe(auth.uid(), id)
);
