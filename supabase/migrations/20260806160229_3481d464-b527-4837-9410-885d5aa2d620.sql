-- 1. Novas colunas na tabela public.ausencias para auditoria forense
ALTER TABLE public.ausencias 
ADD COLUMN IF NOT EXISTS hash_integridade TEXT,
ADD COLUMN IF NOT EXISTS hash_anterior TEXT,
ADD COLUMN IF NOT EXISTS hash_atual TEXT,
ADD COLUMN IF NOT EXISTS operacao_origem TEXT CHECK (operacao_origem IN ('WEB', 'MOBILE', 'API', 'IMPORTACAO', 'AUTOMACAO', 'INTEGRACAO', 'ROTINA')),
ADD COLUMN IF NOT EXISTS operacao_ip TEXT,
ADD COLUMN IF NOT EXISTS operacao_user_agent TEXT,
ADD COLUMN IF NOT EXISTS operacao_sistema_operacional TEXT,
ADD COLUMN IF NOT EXISTS operacao_navegador TEXT,
ADD COLUMN IF NOT EXISTS operacao_dispositivo_tipo TEXT,
ADD COLUMN IF NOT EXISTS operacao_timestamp_utc TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'UTC');

COMMENT ON COLUMN public.ausencias.hash_integridade IS 'Assinatura SHA-256 de integridade do registro';
COMMENT ON COLUMN public.ausencias.hash_anterior IS 'Hash da versão anterior do registro (cadeia de custódia)';
COMMENT ON COLUMN public.ausencias.hash_atual IS 'Hash calculado no momento da persistência';

-- 2. Tabela de auditoria por campo (Field-Level Audit)
CREATE TABLE IF NOT EXISTS public.ausencia_field_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ausencia_id UUID REFERENCES public.ausencias(id) ON DELETE CASCADE,
    campo TEXT NOT NULL,
    valor_anterior JSONB,
    valor_novo JSONB,
    responsavel_usuario_id UUID REFERENCES auth.users(id),
    responsavel_nome TEXT,
    responsavel_papel TEXT,
    data_hora TIMESTAMPTZ DEFAULT (now() AT TIME ZONE 'UTC'),
    correlation_id TEXT
);

GRANT SELECT, INSERT ON public.ausencia_field_audit TO authenticated;
GRANT ALL ON public.ausencia_field_audit TO service_role;

ALTER TABLE public.ausencia_field_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por RH/Compliance/Admin" ON public.ausencia_field_audit
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'rh') OR public.has_role(auth.uid(), 'compliance'));

-- 3. Função para diagnóstico de integridade
CREATE OR REPLACE FUNCTION public.diagnosticar_integridade_ausencias()
RETURNS TABLE (
    total_sem_hash BIGINT,
    total_hash_invalido BIGINT,
    total_sem_autoria BIGINT,
    total_alteradas BIGINT,
    total_contestadas BIGINT
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        COUNT(*) FILTER (WHERE hash_integridade IS NULL) as total_sem_hash,
        0::bigint as total_hash_invalido, -- placeholder para validação futura
        COUNT(*) FILTER (WHERE criado_por_usuario_id IS NULL) as total_sem_autoria,
        COUNT(*) FILTER (WHERE updated_at > created_at) as total_alteradas,
        (SELECT COUNT(*) FROM public.ausencia_contestacoes WHERE status = 'PENDENTE') as total_contestadas
    FROM public.ausencias;
$$;
