CREATE TABLE IF NOT EXISTS public.audit_stability_results (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    flow_id text NOT NULL,
    gate_id text NOT NULL,
    status text NOT NULL,
    severity text,
    evidence text,
    root_cause text,
    recommended_fix text,
    trace_id text,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id),
    UNIQUE(flow_id, gate_id)
);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_stability_results TO authenticated;
GRANT ALL ON public.audit_stability_results TO service_role;

-- RLS
ALTER TABLE public.audit_stability_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on audit results"
ON public.audit_stability_results
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated users can read audit results"
ON public.audit_stability_results
FOR SELECT
TO authenticated
USING (true);

-- Garantir que a coluna correlation_id exista em ocorrencias_ponto para idempotência
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ocorrencias_ponto' AND column_name='correlation_id') THEN
        ALTER TABLE public.ocorrencias_ponto ADD COLUMN correlation_id text;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ocorrencias_ponto_correlation_id ON public.ocorrencias_ponto(correlation_id) WHERE correlation_id IS NOT NULL;
    END IF;
END $$;
