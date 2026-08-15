-- Migration 20260815164000: Admin Verification Fallback P0
-- Objetivo: Implementar contingência administrativa para provedores sem pre-flight check.

-- 1. Alterar Tabela de Destinatários
ALTER TABLE public.operational_notification_recipients 
ADD COLUMN IF NOT EXISTS admin_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS provider_check_capability TEXT DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS verification_method TEXT,
ADD COLUMN IF NOT EXISTS verification_reason TEXT,
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS trace_id TEXT;

-- 2. Criar Tabela de Auditoria Forense
CREATE TABLE IF NOT EXISTS public.operational_notification_recipient_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES public.operational_notification_recipients(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL, -- 'ADMIN_VERIFY', 'ADMIN_REVOKE'
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    trace_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Grants
GRANT SELECT, INSERT ON public.operational_notification_recipient_audit TO authenticated;
GRANT ALL ON public.operational_notification_recipient_audit TO service_role;

-- 4. RLS
ALTER TABLE public.operational_notification_recipient_audit ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'operational_notification_recipient_audit' 
        AND policyname = 'Admins can view audit logs'
    ) THEN
        CREATE POLICY "Admins can view audit logs"
        ON public.operational_notification_recipient_audit
        FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;

-- 5. Data Correction: Evolution v2.3.7 Fallback
UPDATE public.operational_notification_recipients 
SET provider_check_capability = 'NOT_SUPPORTED'
WHERE environment = 'SANDBOX';
