-- Migration: Add Admin Verification fields to Recipients (Stage 8.7)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operational_notification_recipients' AND column_name = 'admin_verified') THEN
        ALTER TABLE public.operational_notification_recipients ADD COLUMN admin_verified boolean DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operational_notification_recipients' AND column_name = 'provider_check_capability') THEN
        ALTER TABLE public.operational_notification_recipients ADD COLUMN provider_check_capability text DEFAULT 'UNKNOWN';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operational_notification_recipients' AND column_name = 'verification_method') THEN
        ALTER TABLE public.operational_notification_recipients ADD COLUMN verification_method text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operational_notification_recipients' AND column_name = 'verification_reason') THEN
        ALTER TABLE public.operational_notification_recipients ADD COLUMN verification_reason text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operational_notification_recipients' AND column_name = 'verified_by') THEN
        ALTER TABLE public.operational_notification_recipients ADD COLUMN verified_by uuid REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'operational_notification_recipients' AND column_name = 'trace_id') THEN
        ALTER TABLE public.operational_notification_recipients ADD COLUMN trace_id text;
    END IF;
END $$;

-- Drop constraints if they exist to avoid errors on retry
ALTER TABLE public.operational_notification_recipients DROP CONSTRAINT IF EXISTS valid_provider_capability;
ALTER TABLE public.operational_notification_recipients ADD CONSTRAINT valid_provider_capability 
CHECK (provider_check_capability IN ('SUPPORTED', 'NOT_SUPPORTED', 'UNKNOWN'));

ALTER TABLE public.operational_notification_recipients DROP CONSTRAINT IF EXISTS valid_verification_method;
ALTER TABLE public.operational_notification_recipients ADD CONSTRAINT valid_verification_method
CHECK (verification_method IN ('ADMIN_MANUAL', 'PROVIDER_AUTOMATIC', null));

-- Audit Log Table
CREATE TABLE IF NOT EXISTS public.operational_notification_recipient_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id uuid REFERENCES public.operational_notification_recipients(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    reason text,
    trace_id text,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.operational_notification_recipient_audit TO authenticated;
GRANT ALL ON public.operational_notification_recipient_audit TO service_role;

ALTER TABLE public.operational_notification_recipient_audit ENABLE ROW LEVEL SECURITY;

-- Evita erro se a política já existir
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

-- Data Correction: Update Sandbox Recipient to NOT_SUPPORTED for Evolution v2.3.7
UPDATE public.operational_notification_recipients 
SET provider_check_capability = 'NOT_SUPPORTED'
WHERE environment = 'SANDBOX';
