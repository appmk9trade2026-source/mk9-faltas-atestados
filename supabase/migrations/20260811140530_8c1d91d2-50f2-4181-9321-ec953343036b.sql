
-- Migration para adicionar supervisor_usuario_id em ocorrencias_ponto
-- Data: 2026-08-11

-- 1. Adicionar a coluna
ALTER TABLE public.ocorrencias_ponto 
ADD COLUMN IF NOT EXISTS supervisor_usuario_id uuid REFERENCES auth.users(id);

-- 2. Grant (Redundante mas boa prática em migrations de hardening/schema)
GRANT SELECT, INSERT, UPDATE ON public.ocorrencias_ponto TO authenticated;
GRANT ALL ON public.ocorrencias_ponto TO service_role;

-- 3. Criar ou atualizar a RPC para buscar supervisores por projeto (AMBEV)
CREATE OR REPLACE FUNCTION public.get_supervisores_projeto(_projeto_id uuid)
RETURNS TABLE (
    id uuid,
    nome text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        c.supervisor_usuario_id,
        c.supervisor_nome
    FROM public.colaboradores c
    WHERE c.projeto_id = _projeto_id
      AND c.ativo = true
      AND c.supervisor_usuario_id IS NOT NULL
    ORDER BY c.supervisor_nome ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supervisores_projeto(uuid) TO authenticated;

-- 4. Atualizar get_colaboradores_ativos para aceitar filtro opcional de supervisor
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
    LIMIT 1000; -- Aumentado para suportar equipes grandes conforme ETAPA 5
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_colaboradores_ativos(uuid, uuid, text, uuid) TO authenticated;
