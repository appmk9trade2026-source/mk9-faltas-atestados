-- Fase 5: Endurecimento do Fluxo Manual e RBAC

-- 1. Helper SECURITY DEFINER para checar vínculo projeto-empresa (bypassa RLS de projetos)
CREATE OR REPLACE FUNCTION public.check_projeto_empresa_match(_projeto_id uuid, _empresa_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projetos 
    WHERE id = _projeto_id AND empresa_id = _empresa_id
  );
$$;

-- 2. Atualizar user_pode_projeto_escopo_manual para ser mais robusto e tratar privilégios
CREATE OR REPLACE FUNCTION public.user_pode_projeto_escopo_manual(_user_id uuid, _projeto_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_is_super boolean;
  v_is_rh boolean;
  v_is_compliance boolean;
BEGIN
  IF _user_id IS NULL OR _projeto_id IS NULL THEN RETURN false; END IF;

  -- Privilegiados veem tudo
  v_is_super := public.has_role(_user_id, 'super_admin');
  v_is_rh := public.has_role(_user_id, 'rh');
  v_is_compliance := public.has_role(_user_id, 'compliance');
  
  IF v_is_super OR v_is_rh OR v_is_compliance THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.projetos p
    WHERE p.id = _projeto_id AND p.ativo = true
  ) AND (
    public.user_has_projeto(_user_id, _projeto_id)
    OR (
      public.has_role(_user_id, 'supervisor')
      AND public.supervisor_has_projeto_via_equipe(_user_id, _projeto_id)
    )
    OR (
      public.has_role(_user_id, 'coordenador')
      AND public.coordenador_has_projeto_via_equipe(_user_id, _projeto_id)
    )
  );
END;
$$;

-- 3. Recriar Políticas de RLS de colaboradores (Supervisor e Coordenador)
-- Usamos o helper SD para evitar falhas de RLS recursivas ou por falta de visibilidade no projeto.

DROP POLICY IF EXISTS "colaboradores_supervisor_manual_insert" ON public.colaboradores;
CREATE POLICY "colaboradores_supervisor_manual_insert" ON public.colaboradores
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'supervisor') 
  AND origem = 'MANUAL' 
  AND ativo = true 
  AND supervisor_usuario_id = auth.uid() 
  AND projeto_id IS NOT NULL 
  AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id) 
  AND public.check_projeto_empresa_match(projeto_id, empresa_id)
);

DROP POLICY IF EXISTS "colaboradores_coordenador_manual_insert" ON public.colaboradores;
CREATE POLICY "colaboradores_coordenador_manual_insert" ON public.colaboradores
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'coordenador') 
  AND origem = 'MANUAL' 
  AND ativo = true 
  AND supervisor_usuario_id IS NOT NULL 
  AND projeto_id IS NOT NULL 
  AND public.user_pode_projeto_escopo_manual(auth.uid(), projeto_id) 
  AND (
    supervisor_usuario_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.profiles pf 
      WHERE pf.id = colaboradores.supervisor_usuario_id 
      AND pf.coordenador_usuario_id = auth.uid()
    )
  )
  AND public.check_projeto_empresa_match(projeto_id, empresa_id)
);

-- 4. Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.check_projeto_empresa_match(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
