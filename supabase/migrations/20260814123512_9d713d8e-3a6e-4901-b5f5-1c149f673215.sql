
-- 1. DROP the problematic function
DROP FUNCTION IF EXISTS public.detectar_conflitos_ausencia(uuid, date, date, text, text, text, uuid);

-- 2. CREATE the fixed version that respects CANCELADO/SUBSTITUIDA status
CREATE OR REPLACE FUNCTION public.detectar_conflitos_ausencia(
    _colaborador_id uuid,
    _data_inicio date,
    _data_fim date,
    _tipo text,
    _origem_registro text,
    _manual_matricula text,
    _empresa_id uuid
)
RETURNS TABLE (
    id uuid,
    tipo text,
    data_inicio date,
    data_fim date,
    registrado_por uuid,
    registrado_em timestamptz,
    protocolo text,
    status text,
    registrado_por_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
    RETURN QUERY
    SELECT 
        a.id, 
        a.tipo, 
        a.data_inicio, 
        a.data_fim, 
        a.registrado_por, 
        a.registrado_em, 
        a.protocolo,
        a.status,
        p.nome as registrado_por_nome
    FROM public.ausencias a
    LEFT JOIN public.profiles p ON p.id = a.registrado_por
    WHERE 
        -- Identificação do colaborador
        (
            (_origem_registro = 'AUTOMATICO' AND a.colaborador_id = _colaborador_id)
            OR 
            (_origem_registro = 'MANUAL' AND a.empresa_id = _empresa_id AND a.manual_matricula = _manual_matricula)
        )
        -- FIX: Explicitly ignore cancelled, substituted, or logically deleted records
        AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
        AND (a.status_documental IS NULL OR a.status_documental != 'EXCLUIDO')
        AND (
            -- Sobreposição de datas (Inclusive)
            (a.data_inicio, a.data_fim) OVERLAPS (_data_inicio, _data_fim)
            OR a.data_inicio = _data_inicio
            OR a.data_fim = _data_fim
            OR a.data_inicio = _data_fim
            OR a.data_fim = _data_inicio
        )
        -- Conflito entre Atestado e Falta (ou mesmo tipo no mesmo período)
        AND (
            (_tipo = 'ATESTADO' AND a.tipo IN ('ATESTADO', 'FALTA'))
            OR (_tipo = 'FALTA' AND a.tipo IN ('ATESTADO', 'FALTA'))
        );
END;
$func$;

-- 3. GRANTS
GRANT EXECUTE ON FUNCTION public.detectar_conflitos_ausencia(uuid, date, date, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detectar_conflitos_ausencia(uuid, date, date, text, text, text, uuid) TO service_role;
