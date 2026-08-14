DROP FUNCTION IF EXISTS public.detectar_conflitos_ausencia(_colaborador_id uuid, _data_inicio date, _data_fim date, _tipo text, _origem_registro text, _manual_matricula text, _empresa_id uuid);
DROP FUNCTION IF EXISTS public.detectar_conflitos_ausencia(_colaborador_id uuid, _data_inicio date, _data_fim date, _tipo tipo_ausencia, _origem_registro text, _manual_matricula text, _empresa_id uuid);

CREATE OR REPLACE FUNCTION public.detectar_conflitos_ausencia(
    _colaborador_id uuid, 
    _data_inicio date, 
    _data_fim date, 
    _tipo text, 
    _origem_registro text, 
    _manual_matricula text, 
    _empresa_id uuid,
    _projeto_id uuid DEFAULT NULL,
    _supervisor_id uuid DEFAULT NULL
)
 RETURNS TABLE(
    id uuid, 
    tipo text, 
    data_inicio date, 
    data_fim date, 
    registrado_por uuid, 
    registrado_em timestamp with time zone, 
    protocolo text, 
    status text, 
    registrado_por_nome text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        a.id, 
        a.tipo::text,
        a.data_inicio, 
        a.data_fim, 
        a.registrado_por, 
        a.registrado_em, 
        a.protocolo,
        a.status::text,
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
        -- Hardening: Ignorar registros cancelados ou excluídos
        AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
        AND (a.status_documental IS NULL OR a.status_documental != 'EXCLUIDO')
        AND (
            -- Sobreposição de datas
            (a.data_inicio, a.data_fim) OVERLAPS (_data_inicio, _data_fim)
            OR a.data_inicio = _data_inicio
            OR a.data_fim = _data_fim
        )
        -- Conflito lógico entre Atestado e Falta
        AND (
            (_tipo = 'ATESTADO' AND a.tipo::text IN ('ATESTADO', 'FALTA'))
            OR (_tipo = 'FALTA' AND a.tipo::text IN ('ATESTADO', 'FALTA'))
        );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.detectar_conflitos_ausencia(uuid, date, date, text, text, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detectar_conflitos_ausencia(uuid, date, date, text, text, text, uuid, uuid, uuid) TO service_role;
