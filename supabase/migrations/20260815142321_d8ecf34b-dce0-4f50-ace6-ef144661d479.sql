
CREATE OR REPLACE FUNCTION public.ausencia_duplicada_existente(
  _colaborador_id uuid, 
  _projeto_id uuid, 
  _data_inicio date, 
  _data_fim date, 
  _opcao_periodo_id uuid, 
  _ignorar_id uuid DEFAULT NULL::uuid, 
  _manual_matricula text DEFAULT NULL::text, 
  _horario_inicio time without time zone DEFAULT NULL::time without time zone, 
  _horario_fim time without time zone DEFAULT NULL::time without time zone
)
 RETURNS TABLE(id uuid, protocolo text, tipo_ausencia_nome text, data_inicio date, data_fim date, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.protocolo, a.tipo_ausencia_nome, a.data_inicio, a.data_fim, a.created_at
    FROM public.ausencias a
   WHERE a.projeto_id = _projeto_id
     AND (_ignorar_id IS NULL OR a.id <> _ignorar_id)
     AND (
       (_colaborador_id IS NOT NULL AND a.colaborador_id = _colaborador_id)
       OR (_colaborador_id IS NULL AND _manual_matricula IS NOT NULL
           AND btrim(a.manual_matricula) = btrim(_manual_matricula))
     )
     -- Sobreposição de datas
     AND a.data_inicio <= _data_fim
     AND a.data_fim >= _data_inicio
     -- Filtro de período
     AND (_opcao_periodo_id IS NULL OR a.opcao_periodo_id = _opcao_periodo_id)
     -- Nova lógica de sobreposição de horários (se informados)
     AND (
       (_horario_inicio IS NULL OR _horario_fim IS NULL OR a.horario_inicio IS NULL OR a.horario_fim IS NULL)
       OR 
       (_horario_inicio < a.horario_fim AND _horario_fim > a.horario_inicio)
     )
     -- FIX P0: Ignorar registros que não estão ativos operacionalmente (Alinhado com overload de 7 params)
     AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
     AND (a.status_documental IS NULL OR a.status_documental != 'EXCLUIDO')
   ORDER BY a.created_at DESC
   LIMIT 5;
$function$;

GRANT EXECUTE ON FUNCTION public.ausencia_duplicada_existente(uuid, uuid, date, date, uuid, uuid, text, time without time zone, time without time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ausencia_duplicada_existente(uuid, uuid, date, date, uuid, uuid, text, time without time zone, time without time zone) TO service_role;
