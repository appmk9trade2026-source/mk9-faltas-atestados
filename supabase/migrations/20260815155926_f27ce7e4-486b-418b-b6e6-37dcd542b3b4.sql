-- Migration: Add Admin Verification fields to Recipients
ALTER TABLE public.operational_notification_recipients 
ADD COLUMN IF NOT EXISTS admin_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS provider_check_capability public.app_role DEFAULT 'user', -- Placeholder type, will fix to enum if needed or just use text
ADD COLUMN IF NOT EXISTS verification_method text,
ADD COLUMN IF NOT EXISTS verification_reason text,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS trace_id text;

-- Drop and recreate the column for capability to use a proper enum or text
ALTER TABLE public.operational_notification_recipients DROP COLUMN IF EXISTS provider_check_capability;
ALTER TABLE public.operational_notification_recipients ADD COLUMN provider_check_capability text DEFAULT 'UNKNOWN';

-- Constraints
ALTER TABLE public.operational_notification_recipients ADD CONSTRAINT valid_provider_capability 
CHECK (provider_check_capability IN ('SUPPORTED', 'NOT_SUPPORTED', 'UNKNOWN'));

ALTER TABLE public.operational_notification_recipients ADD CONSTRAINT valid_verification_method
CHECK (verification_method IN ('ADMIN_MANUAL', 'PROVIDER_AUTOMATIC', null));

-- Audit Log for Recipient Changes
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

CREATE POLICY "Admins can view audit logs"
ON public.operational_notification_recipient_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update Sandbox Recipient to NOT_SUPPORTED for Evolution v2.3.7
UPDATE public.operational_notification_recipients 
SET provider_check_capability = 'NOT_SUPPORTED'
WHERE environment = 'SANDBOX';
