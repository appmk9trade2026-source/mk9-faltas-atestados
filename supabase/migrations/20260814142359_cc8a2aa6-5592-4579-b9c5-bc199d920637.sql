CREATE OR REPLACE FUNCTION public.ausencia_duplicada_existente(
  _colaborador_id uuid,
  _projeto_id uuid,
  _data_inicio date,
  _data_fim date,
  _opcao_periodo_id uuid,
  _ignorar_id uuid DEFAULT NULL,
  _manual_matricula text DEFAULT NULL
)
RETURNS TABLE (id uuid, protocolo text, tipo_ausencia_nome text, data_inicio date, data_fim date, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.id, a.protocolo, a.tipo_ausencia_nome, a.data_inicio, a.data_fim, a.created_at
    FROM public.ausencias a
   WHERE a.projeto_id = _projeto_id
     AND (_ignorar_id IS NULL OR a.id <> _ignorar_id)
     AND (
       (_colaborador_id IS NOT NULL AND a.colaborador_id = _colaborador_id)
       OR (_colaborador_id IS NULL AND _manual_matricula IS NOT NULL
           AND btrim(a.manual_matricula) = btrim(_manual_matricula))
     )
     AND a.data_inicio <= _data_fim
     AND a.data_fim >= _data_inicio
     AND (_opcao_periodo_id IS NULL OR a.opcao_periodo_id = _opcao_periodo_id)
     -- FIX P0: Ignorar registros que não estão ativos operacionalmente
     AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
     AND (a.status_documental IS NULL OR a.status_documental != 'EXCLUIDO')
   ORDER BY a.created_at DESC
   LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.ausencia_duplicada_existente(uuid,uuid,date,date,uuid,uuid,text) TO authenticated;
