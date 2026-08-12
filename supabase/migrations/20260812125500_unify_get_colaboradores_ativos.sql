-- CRM MK9: Unificação de assinaturas para get_colaboradores_ativos
-- Objetivo: Resolver ambiguidade (HTTP 300) e garantir suporte a filtro de supervisor

-- 1. Remover assinaturas antigas se existirem
DROP FUNCTION IF EXISTS public.get_colaboradores_ativos(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.get_colaboradores_ativos(uuid, uuid, text, uuid);

-- 2. Criar a assinatura única canônica
CREATE OR REPLACE FUNCTION public.get_colaboradores_ativos(
    _empresa_id uuid DEFAULT NULL,
    _projeto_id uuid DEFAULT NULL,
    _busca text DEFAULT NULL,
    _supervisor_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    nome_completo text,
    matricula text,
    empresa_id uuid,
    projeto_id uuid,
    cargo text,
    supervisor_usuario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id uuid := auth.uid();
    _is_admin boolean;
BEGIN
    -- Determinar se o usuário tem privilégio administrativo
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = _user_id 
        AND role IN ('rh', 'coordenador', 'super_admin')
    ) INTO _is_admin;

    RETURN QUERY
    SELECT 
        c.id,
        c.nome_completo,
        c.matricula,
        c.empresa_id,
        c.projeto_id,
        c.cargo,
        c.supervisor_usuario_id
    FROM public.colaboradores c
    WHERE c.ativo = true
      AND (_empresa_id IS NULL OR c.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR c.projeto_id = _projeto_id)
      AND (_supervisor_id IS NULL OR c.supervisor_usuario_id = _supervisor_id)
      AND (
          _busca IS NULL OR 
          c.nome_completo ILIKE '%' || _busca || '%' OR 
          c.matricula ILIKE '%' || _busca || '%'
      )
      AND (
          _is_admin OR 
          c.supervisor_usuario_id = _user_id 
      )
    ORDER BY c.nome_completo ASC
    LIMIT 1000;
END;
$$;

-- 3. Garantir permissões
GRANT EXECUTE ON FUNCTION public.get_colaboradores_ativos(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_colaboradores_ativos(uuid, uuid, text, uuid) TO service_role;
