-- 1. Enum para Ambiente de Notificação
DO $$ BEGIN
    CREATE TYPE public.notification_environment AS ENUM ('DISABLED', 'SANDBOX', 'PRODUCTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tabela de Configuração Global (Singleton)
CREATE TABLE IF NOT EXISTS public.operational_notification_config (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
    environment public.notification_environment NOT NULL DEFAULT 'DISABLED',
    kill_switch_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT singleton_config CHECK (id = '00000000-0000-0000-0000-000000000001'::UUID)
);

-- Inserir config inicial
INSERT INTO public.operational_notification_config (environment, kill_switch_enabled)
VALUES ('DISABLED', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Tabela de Destinatários Técnicos
CREATE TABLE IF NOT EXISTS public.operational_notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL DEFAULT 'WHATSAPP',
    destination TEXT NOT NULL,
    label TEXT NOT NULL,
    environment public.notification_environment NOT NULL DEFAULT 'SANDBOX',
    severity_scope TEXT[] NOT NULL DEFAULT '{P0}',
    active BOOLEAN NOT NULL DEFAULT false,
    is_test_recipient BOOLEAN NOT NULL DEFAULT true,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Log de Alteração de Configuração
CREATE TABLE IF NOT EXISTS public.operational_notification_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    trace_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Função de Verificação Fail-Closed
CREATE OR REPLACE FUNCTION public.check_notification_ready(p_channel TEXT, p_environment public.notification_environment)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.operational_notification_recipients 
        WHERE channel = p_channel 
          AND environment = p_environment
          AND active = true 
          AND verified_at IS NOT NULL
    );
$$;

-- 6. Grants
GRANT SELECT, INSERT, UPDATE ON public.operational_notification_config TO authenticated;
GRANT ALL ON public.operational_notification_config TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_notification_recipients TO authenticated;
GRANT ALL ON public.operational_notification_recipients TO service_role;

GRANT SELECT, INSERT ON public.operational_notification_audit_logs TO authenticated;
GRANT ALL ON public.operational_notification_audit_logs TO service_role;

-- 7. RLS
ALTER TABLE public.operational_notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_notification_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to be idempotent)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Super Admins manage config" ON public.operational_notification_config;
    DROP POLICY IF EXISTS "Super Admins manage recipients" ON public.operational_notification_recipients;
    DROP POLICY IF EXISTS "Super Admins view audit logs" ON public.operational_notification_audit_logs;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Super Admins manage config"
ON public.operational_notification_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super Admins manage recipients"
ON public.operational_notification_recipients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super Admins view audit logs"
ON public.operational_notification_audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));
