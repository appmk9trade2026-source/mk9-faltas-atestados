-- CRM MK9 — CORREÇÃO CIRÚRGICA DE GRANTS E RLS PARA SUPERVISOR/COORDENADOR

-- 1. Permissões de Execução em Funções de Negócio e Segurança
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ausencia_com_colaborador_manual(jsonb, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.atestado_path_visivel_para(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atestado_path_visivel_para(text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

GRANT EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_pode_projeto_escopo_manual(uuid, uuid) TO service_role;

-- 2. Grants em Tabelas Públicas
GRANT SELECT, INSERT, UPDATE ON TABLE public.colaboradores TO authenticated;
GRANT ALL ON TABLE public.colaboradores TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.ausencias TO authenticated;
GRANT ALL ON TABLE public.ausencias TO service_role;

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

-- 3. Grants em Storage
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO service_role;

-- 4. Correção na Função de Visibilidade de Atestados
CREATE OR REPLACE FUNCTION public.atestado_path_visivel_para(_name text, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _colab_id uuid;
  _proj_id uuid;
  _prefix text;
  _second_part text;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Acesso privilegiado
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'rh'::app_role)
     OR public.has_role(_user_id, 'compliance'::app_role) THEN
    RETURN true;
  END IF;

  _prefix := split_part(_name, '/', 1);
  _second_part := split_part(_name, '/', 2);

  IF _prefix = 'ausencias' THEN
    IF _second_part = 'manual' THEN
      RETURN true;
    END IF;

    BEGIN
      _colab_id := _second_part::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF _colab_id IS NULL THEN RETURN false; END IF;

    IF public.has_role(_user_id, 'supervisor'::app_role) THEN
      RETURN EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.id = _colab_id
          AND c.supervisor_usuario_id = _user_id
      );
    END IF;

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

  IF _prefix = 'ocorrencias-ponto' THEN
    BEGIN
      _proj_id := _second_part::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    IF _proj_id IS NULL THEN RETURN false; END IF;

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
