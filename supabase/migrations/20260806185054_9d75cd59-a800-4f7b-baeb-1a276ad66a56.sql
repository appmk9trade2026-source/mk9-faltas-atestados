
-- 1. Helper de visibilidade de contestações (Hardening RLS)
CREATE OR REPLACE FUNCTION public.pode_ver_contestacao(_contestacao_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_ausencia_id uuid;
    v_projeto_id uuid;
    v_solicitante_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RETURN false; END IF;

    -- Super Admin vê tudo
    IF public.has_role(v_user_id, 'super_admin') THEN RETURN true; END IF;

    SELECT ausencia_id, solicitante_usuario_id 
    INTO v_ausencia_id, v_solicitante_id
    FROM public.ausencia_contestacoes 
    WHERE id = _contestacao_id;

    IF v_ausencia_id IS NULL THEN RETURN false; END IF;

    -- 1. Solicitante vê a própria contestação
    IF v_solicitante_id = v_user_id THEN RETURN true; END IF;

    -- Pegar o projeto da ausência para validar escopo
    SELECT projeto_id INTO v_projeto_id FROM public.ausencias WHERE id = v_ausencia_id;
    IF v_projeto_id IS NULL THEN RETURN false; END IF;

    -- 2. RH / Compliance (com escopo de projeto via mapping explicito)
    IF (public.has_role(v_user_id, 'rh') OR public.has_role(v_user_id, 'compliance')) 
       AND public.user_has_projeto(v_user_id, v_projeto_id) THEN
        RETURN true;
    END IF;

    -- 3. Supervisor / Coordenador (via helpers de equipe)
    IF public.has_role(v_user_id, 'supervisor') THEN
        -- Verifica se o colaborador da ausência é da equipe dele
        RETURN EXISTS (
            SELECT 1 FROM public.ausencias a
            JOIN public.colaboradores c ON c.id = a.colaborador_id
            WHERE a.id = v_ausencia_id AND c.supervisor_usuario_id = v_user_id
        );
    END IF;

    IF public.has_role(v_user_id, 'coordenador') THEN
        RETURN EXISTS (
            SELECT 1 FROM public.ausencias a
            JOIN public.colaboradores c ON c.id = a.colaborador_id
            JOIN public.profiles p ON p.id = c.supervisor_usuario_id
            WHERE a.id = v_ausencia_id AND p.coordenador_usuario_id = v_user_id
        );
    END IF;

    RETURN false;
END;
$$;

-- 2. Helper de visibilidade de field_audit (Hardening Forense)
CREATE OR REPLACE FUNCTION public.pode_ver_field_audit(_audit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_ausencia_id uuid;
    v_projeto_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RETURN false; END IF;

    -- Super Admin e Compliance (global ou escopo) veem tudo
    IF public.has_role(v_user_id, 'super_admin') OR public.has_role(v_user_id, 'compliance') THEN 
        RETURN true; 
    END IF;

    SELECT ausencia_id INTO v_ausencia_id FROM public.ausencia_field_audit WHERE id = _audit_id;
    IF v_ausencia_id IS NULL THEN RETURN false; END IF;

    SELECT projeto_id INTO v_projeto_id FROM public.ausencias WHERE id = v_ausencia_id;
    IF v_projeto_id IS NULL THEN RETURN false; END IF;

    -- RH com escopo
    IF public.has_role(v_user_id, 'rh') AND public.user_has_projeto(v_user_id, v_projeto_id) THEN
        RETURN true;
    END IF;

    -- Supervisores/Coordenadores NÃO devem ver auditoria de campo forense por padrão (Contém IP/UA)
    RETURN false;
END;
$$;

-- 3. Classificação de Eventos de Alertas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alerta_evento_classificacao') THEN
        CREATE TYPE public.alerta_evento_classificacao AS ENUM ('OPERACIONAL', 'INTERNO_RH', 'COMPLIANCE', 'SISTEMA');
    END IF;
END $$;

ALTER TABLE public.alertas_eventos 
ADD COLUMN IF NOT EXISTS classificacao public.alerta_evento_classificacao DEFAULT 'OPERACIONAL';

CREATE OR REPLACE FUNCTION public.pode_ver_alerta_evento(_evento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_alerta_id uuid;
    v_classificacao public.alerta_evento_classificacao;
BEGIN
    IF v_user_id IS NULL THEN RETURN false; END IF;

    SELECT alerta_id, classificacao INTO v_alerta_id, v_classificacao
    FROM public.alertas_eventos WHERE id = _evento_id;
    
    IF v_alerta_id IS NULL THEN RETURN false; END IF;

    -- Super Admin
    IF public.has_role(v_user_id, 'super_admin') THEN RETURN true; END IF;

    -- Se for COMPLIANCE, só Super Admin e Compliance veem
    IF v_classificacao = 'COMPLIANCE' THEN
        RETURN public.has_role(v_user_id, 'compliance');
    END IF;

    -- Se for INTERNO_RH, Super Admin, Compliance e RH veem
    IF v_classificacao = 'INTERNO_RH' THEN
        RETURN public.has_role(v_user_id, 'rh') OR public.has_role(v_user_id, 'compliance');
    END IF;

    -- SISTEMA e OPERACIONAL dependem da visibilidade do alerta base
    RETURN EXISTS (
        SELECT 1 FROM public.alertas a 
        WHERE a.id = v_alerta_id AND public.alerta_visivel_para(a.*, v_user_id)
    );
END;
$$;

-- 4. Aplicar Policies (Hardening)
DROP POLICY IF EXISTS "Usuários autenticados podem ver contestações de seu escopo" ON public.ausencia_contestacoes;
CREATE POLICY "Usuários autenticados podem ver contestações de seu escopo"
ON public.ausencia_contestacoes
FOR SELECT
TO authenticated
USING (public.pode_ver_contestacao(id));

DROP POLICY IF EXISTS "Usuários permitidos podem criar contestações" ON public.ausencia_contestacoes;
CREATE POLICY "Usuários permitidos podem criar contestações"
ON public.ausencia_contestacoes
FOR INSERT
TO authenticated
WITH CHECK (
    (auth.uid() = solicitante_usuario_id) AND
    (EXISTS (SELECT 1 FROM public.ausencias a WHERE a.id = ausencia_id))
);

DROP POLICY IF EXISTS "Acesso por RH/Compliance/Admin" ON public.ausencia_field_audit;
CREATE POLICY "Acesso por RH/Compliance/Admin"
ON public.ausencia_field_audit
FOR SELECT
TO authenticated
USING (public.pode_ver_field_audit(id));

DROP POLICY IF EXISTS "alertas_eventos_select" ON public.alertas_eventos;
CREATE POLICY "alertas_eventos_select"
ON public.alertas_eventos
FOR SELECT
TO authenticated
USING (public.pode_ver_alerta_evento(id));

-- 5. Hardening SECURITY DEFINER (Revoke from PUBLIC)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', func_record.nspname, func_record.proname, func_record.args);
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon', func_record.nspname, func_record.proname, func_record.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Grants para service_role (Admin bypass)
GRANT ALL ON public.ausencia_contestacoes TO service_role;
GRANT ALL ON public.ausencia_field_audit TO service_role;
GRANT ALL ON public.alertas_eventos TO service_role;
GRANT SELECT, INSERT ON public.ausencia_contestacoes TO authenticated;
GRANT SELECT ON public.ausencia_field_audit TO authenticated;
GRANT SELECT, INSERT ON public.alertas_eventos TO authenticated;
