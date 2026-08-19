
-- Enumeração de SLA Status
DO $$ BEGIN
    CREATE TYPE public.support_sla_status AS ENUM ('NO_PRAZO', 'ATENCAO', 'ATRASADO', 'PAUSADO', 'CONCLUIDO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Adicionar colunas de SLA e Resolução à tabela support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS sla_priority public.support_priority DEFAULT 'NORMAL',
ADD COLUMN IF NOT EXISTS sla_status public.support_sla_status DEFAULT 'NO_PRAZO',
ADD COLUMN IF NOT EXISTS sla_first_response_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_resolution_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_total_paused_seconds BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS resolution_category TEXT,
ADD COLUMN IF NOT EXISTS resolution_summary TEXT,
ADD COLUMN IF NOT EXISTS resolution_internal_notes TEXT,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

-- Tabela de Configuração de SLA
CREATE TABLE IF NOT EXISTS public.support_sla_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority public.support_priority UNIQUE NOT NULL,
    first_response_minutes INTEGER NOT NULL,
    resolution_minutes INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grants
GRANT SELECT ON public.support_sla_config TO authenticated;
GRANT ALL ON public.support_sla_config TO service_role;

-- Inserir valores iniciais de SLA
INSERT INTO public.support_sla_config (priority, first_response_minutes, resolution_minutes)
VALUES 
    ('BAIXA', 480, 2880),
    ('NORMAL', 240, 1440),
    ('ALTA', 120, 720),
    ('URGENTE', 30, 240)
ON CONFLICT (priority) DO UPDATE 
SET first_response_minutes = EXCLUDED.first_response_minutes,
    resolution_minutes = EXCLUDED.resolution_minutes;

-- View para facilitar KPIs do dashboard
CREATE OR REPLACE VIEW public.support_dashboard_kpis AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'ABERTO') as abertos,
    COUNT(*) FILTER (WHERE status = 'EM_ATENDIMENTO') as em_atendimento,
    COUNT(*) FILTER (WHERE status = 'AGUARDANDO_USUARIO') as aguardando_usuario,
    COUNT(*) FILTER (WHERE status = 'RESOLVIDO' AND resolved_at >= CURRENT_DATE) as resolvidos_hoje,
    COUNT(*) FILTER (WHERE assigned_user_id IS NULL AND status IN ('ABERTO')) as sem_responsavel,
    AVG(EXTRACT(EPOCH FROM (sla_first_response_at - created_at))) FILTER (WHERE sla_first_response_at IS NOT NULL) as avg_first_response_seconds,
    AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_seconds
FROM public.support_tickets;

GRANT SELECT ON public.support_dashboard_kpis TO authenticated;
