CREATE OR REPLACE FUNCTION public.tg_ausencias_bloqueia_duplicidade()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_id uuid; 
  v_protocolo text;
BEGIN
  -- Chamada explícita para a assinatura de 9 parâmetros (incluindo horários)
  SELECT d.id, d.protocolo INTO v_id, v_protocolo
    FROM public.ausencia_duplicada_existente(
      NEW.colaborador_id, 
      NEW.projeto_id, 
      NEW.data_inicio, 
      NEW.data_fim,
      NEW.opcao_periodo_id, 
      NEW.id, 
      NEW.manual_matricula,
      NEW.horario_inicio,
      NEW.horario_fim
    ) d
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICIDADE_AUSENCIA: Já existe uma ausência registrada para este colaborador neste período (protocolo %). Retifique o lançamento existente.', coalesce(v_protocolo,'—')
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tg_ausencias_bloqueia_duplicidade() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_ausencias_bloqueia_duplicidade() TO service_role;
