-- CRM MK9 — CORREÇÃO CIRÚRGICA UPLOAD RLS SUPERVISOR AMBEV
-- MODO: SECURITY HARDENING P0
-- CAUSA: O helper atestado_path_visivel_para() não reconhecia o path 'ocorrencias-ponto/'

CREATE OR REPLACE FUNCTION public.atestado_path_visivel_para(_name text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _colab_id uuid;
  _proj_id uuid;
  _prefix text;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Acesso privilegiado (RH, Super Admin, Compliance)
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN true;
  END IF;

  -- Identificação do fluxo pelo prefixo
  _prefix := split_part(_name, '/', 1);

  -- FLUXO 1: Ausências Tradicionais (ausencias/{colaborador_id}/...)
  IF _prefix = 'ausencias' THEN
    BEGIN
      _colab_id := (split_part(_name, '/', 2))::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF _colab_id IS NULL THEN RETURN false; END IF;

    -- Escopo de Supervisor (vínculo direto)
    IF public.has_role(_user_id, 'supervisor'::app_role) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.id = _colab_id
          AND c.supervisor_usuario_id = _user_id
      );
    END IF;

    -- Escopo de Coordenador (vínculo via Supervisor da equipe)
    IF public.has_role(_user_id, 'coordenador'::app_role) THEN
      RETURN EXISTS (
        SELECT 1 
        FROM public.colaboradores c
        JOIN public.profiles p ON p.id = c.supervisor_usuario_id
        WHERE c.id = _colab_id
          AND p.coordenador_usuario_id = _user_id
      );
    END IF;
  END IF;

  -- FLUXO 2: Ocorrências de Ponto AMBEV (ocorrencias-ponto/{projeto_id}/...)
  IF _prefix = 'ocorrencias-ponto' THEN
    BEGIN
      _proj_id := (split_part(_name, '/', 2))::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF _proj_id IS NULL THEN RETURN false; END IF;

    -- Escopo de Supervisor/Coordenador (vínculo ao projeto)
    IF public.has_role(_user_id, 'supervisor'::app_role) THEN
       RETURN EXISTS (
         SELECT 1 FROM public.colaboradores c
         WHERE c.projeto_id = _proj_id
           AND c.supervisor_usuario_id = _user_id
       );
    END IF;

    IF public.has_role(_user_id, 'coordenador'::app_role) THEN
       RETURN EXISTS (
         SELECT 1 FROM public.profiles p
         JOIN public.colaboradores c ON c.supervisor_usuario_id = p.id
         WHERE c.projeto_id = _proj_id
           AND p.coordenador_usuario_id = _user_id
       );
    END IF;
  END IF;

  RETURN false;
END;
$function$;
