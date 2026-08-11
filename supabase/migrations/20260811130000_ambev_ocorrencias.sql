DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_ocorrencia') THEN
        CREATE TYPE public.status_ocorrencia AS ENUM ('PENDENTE', 'APROVADA', 'REPROVADA', 'CANCELADA');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.ocorrencias_ponto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo TEXT UNIQUE, -- Removido NOT NULL pois o trigger preenche
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    projeto_id UUID NOT NULL REFERENCES public.projetos(id),
    colaborador_id UUID REFERENCES public.colaboradores(id),
    data_ocorrencia DATE NOT NULL,
    motivo TEXT NOT NULL,
    justificativa TEXT NOT NULL,
    arquivo_url TEXT NOT NULL,
    arquivo_nome TEXT,
    status status_ocorrencia NOT NULL DEFAULT 'PENDENTE',
    registrado_por UUID REFERENCES auth.users(id),
    registrado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    processado_por UUID REFERENCES auth.users(id),
    processado_em TIMESTAMP WITH TIME ZONE,
    parecer_processamento TEXT,
    ausencia_id UUID REFERENCES public.ausencias(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.ocorrencias_ponto TO authenticated;
GRANT ALL ON public.ocorrencias_ponto TO service_role;

-- RLS
ALTER TABLE public.ocorrencias_ponto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver ocorrencias permitidas"
ON public.ocorrencias_ponto
FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'rh') OR 
    public.has_role(auth.uid(), 'coordenador') OR 
    registrado_por = auth.uid() OR
    public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Criar ocorrencias"
ON public.ocorrencias_ponto
FOR INSERT
TO authenticated
WITH CHECK (
    public.has_role(auth.uid(), 'rh') OR 
    public.has_role(auth.uid(), 'coordenador') OR 
    public.has_role(auth.uid(), 'supervisor')
);

CREATE POLICY "Processar ocorrencias"
ON public.ocorrencias_ponto
FOR UPDATE
TO authenticated
USING (
    public.has_role(auth.uid(), 'rh') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    public.has_role(auth.uid(), 'super_admin')
);

-- Função para protocolo automático
CREATE OR REPLACE FUNCTION public.fn_gerar_protocolo_ocorrencia()
RETURNS TRIGGER AS $$
DECLARE
    prefix TEXT := 'OCP-AMBEV-';
    today_str TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
    seq_val TEXT;
BEGIN
    SELECT lpad((count(*) + 1)::text, 6, '0') INTO seq_val 
    FROM public.ocorrencias_ponto 
    WHERE to_char(registrado_em, 'YYYYMMDD') = today_str;
    
    NEW.protocolo := prefix || today_str || '-' || seq_val;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tg_gerar_protocolo_ocorrencia
BEFORE INSERT ON public.ocorrencias_ponto
FOR EACH ROW
EXECUTE FUNCTION public.fn_gerar_protocolo_ocorrencia();
