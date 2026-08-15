-- 1. Tabela de Outbox de Notificações Operacionais
CREATE TABLE public.operational_notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES public.operational_alerts(id),
    incident_id UUID REFERENCES public.operational_health_incidents(id) NOT NULL,
    fingerprint TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'WHATSAPP',
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    idempotency_key TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ DEFAULT now(),
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    provider_message_id TEXT,
    last_error_code TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Idempotência
CREATE UNIQUE INDEX idx_notification_outbox_idempotency 
ON public.operational_notification_outbox (idempotency_key)
WHERE status != 'CANCELLED';

-- 2. Histórico de Tentativas
CREATE TABLE public.operational_notification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outbox_id UUID REFERENCES public.operational_notification_outbox(id) ON DELETE CASCADE NOT NULL,
    attempt_number INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    result TEXT NOT NULL, -- 'SUCCESS', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE'
    provider_status TEXT,
    safe_error_code TEXT,
    provider_message_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Grants e RLS
GRANT SELECT, INSERT, UPDATE ON public.operational_notification_outbox TO authenticated;
GRANT ALL ON public.operational_notification_outbox TO service_role;

GRANT SELECT, INSERT ON public.operational_notification_attempts TO authenticated;
GRANT ALL ON public.operational_notification_attempts TO service_role;

ALTER TABLE public.operational_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can view notifications"
ON public.operational_notification_outbox
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super Admins can view attempts"
ON public.operational_notification_attempts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));
