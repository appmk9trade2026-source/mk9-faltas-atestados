
CREATE TYPE public.operational_alert_status AS ENUM ('PENDING', 'SUPPRESSED', 'READY', 'ESCALATED', 'CLOSED');

CREATE TABLE public.operational_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id uuid REFERENCES public.operational_health_incidents(id) ON DELETE CASCADE NOT NULL,
    fingerprint text NOT NULL,
    severity text NOT NULL,
    status public.operational_alert_status NOT NULL DEFAULT 'PENDING',
    decision_reason text,
    alert_count bigint NOT NULL DEFAULT 0,
    escalation_level integer NOT NULL DEFAULT 1,
    sample_trace_id uuid,
    first_eligible_at timestamptz NOT NULL DEFAULT now(),
    last_evaluated_at timestamptz NOT NULL DEFAULT now(),
    last_alerted_at timestamptz,
    next_eligible_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT ON public.operational_alerts TO authenticated;
GRANT ALL ON public.operational_alerts TO service_role;

-- RLS
ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can select alerts"
ON public.operational_alerts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_operational_alerts_incident_id ON public.operational_alerts(incident_id);
CREATE INDEX idx_operational_alerts_fingerprint ON public.operational_alerts(fingerprint);
CREATE INDEX idx_operational_alerts_status ON public.operational_alerts(status);
