-- 1. Criar a sequence para o sufixo numérico do protocolo
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_protocol_seq;

-- 2. Criar a função de geração de protocolo
CREATE OR REPLACE FUNCTION public.generate_support_protocol()
RETURNS TRIGGER AS $$
DECLARE
    date_part TEXT;
    seq_part TEXT;
    final_protocol TEXT;
BEGIN
    -- Formato: SUP-YYYYMMDD-XXXXXX
    -- Nota: Usamos BEFORE INSERT para garantir que o protocolo definitivo sobrescreva qualquer valor enviado (como 'PENDING')
    date_part := to_char(CURRENT_DATE, 'YYYYMMDD');
    seq_part := lpad(nextval('public.support_ticket_protocol_seq')::text, 6, '0');
    final_protocol := 'SUP-' || date_part || '-' || seq_part;
    
    NEW.protocol := final_protocol;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Criar o trigger na tabela support_tickets
DROP TRIGGER IF EXISTS trg_generate_support_protocol ON public.support_tickets;
CREATE TRIGGER trg_generate_support_protocol
BEFORE INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.generate_support_protocol();

-- 4. Garantir privilégios de uso da sequence para os papéis necessários
GRANT USAGE ON SEQUENCE public.support_ticket_protocol_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.support_ticket_protocol_seq TO service_role;

-- 5. Atualizar o ticket de teste PENDING existente para o novo formato de forma controlada
UPDATE public.support_tickets 
SET protocol = 'SUP-' || to_char(created_at, 'YYYYMMDD') || '-' || lpad(nextval('public.support_ticket_protocol_seq')::text, 6, '0')
WHERE protocol = 'PENDING';