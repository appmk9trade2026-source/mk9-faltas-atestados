-- ETAPA 1: Criar helper SECURITY DEFINER otimizado e não recursivo
CREATE OR REPLACE FUNCTION public.pode_ver_perfil_alvo(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer_id uuid := auth.uid();
BEGIN
  -- 1. O próprio usuário sempre vê seu perfil
  IF _viewer_id = _target_user_id THEN
    RETURN TRUE;
  END IF;

  -- 2. Checagem de Roles Administrativas (Super Admin, RH, Compliance)
  -- Nota: public.has_role já é SECURITY DEFINER, então não gera recursão via RLS
  IF public.has_role(_viewer_id, 'super_admin') 
     OR public.has_role(_viewer_id, 'rh') 
     OR public.has_role(_viewer_id, 'compliance') THEN
    RETURN TRUE;
  END IF;

  -- 3. Escopo de Coordenador: vê perfis que o têm como coordenador
  IF public.has_role(_viewer_id, 'coordenador') THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = _target_user_id 
      AND coordenador_usuario_id = _viewer_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- 4. Escopo de Supervisor (via tabela colaboradores)
  IF EXISTS (
    SELECT 1 FROM public.colaboradores c
    WHERE c.supervisor_usuario_id = _target_user_id
    AND EXISTS (
        SELECT 1 FROM public.ausencias a 
        WHERE a.colaborador_id = c.id 
        AND a.registrado_por = _viewer_id
    )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pode_ver_perfil_alvo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_perfil_alvo(uuid) TO authenticated;

-- ETAPA 2: Limpeza radical de todas as policies de SELECT de profiles para garantir estado limpo
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'SELECT') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- ETAPA 3: Implementação da Policy Única e Robusta (Bypass de recursão)
CREATE POLICY "profiles_authenticated_select_v3"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.pode_ver_perfil_alvo(id));

-- ETAPA 4: Garantir GRANTs
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
