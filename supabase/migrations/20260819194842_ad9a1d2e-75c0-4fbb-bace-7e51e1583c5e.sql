-- ETAPA 1: MODELAGEM DE DADOS - CENTRAL DE SUPORTE

DO $$ BEGIN
    CREATE TYPE public.support_priority AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.support_status AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_SUPORTE', 'RESOLVIDO', 'FECHADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.support_message_type AS ENUM ('TEXTO', 'SISTEMA', 'ANEXO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. support_tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol TEXT UNIQUE NOT NULL,
    requester_user_id UUID REFERENCES auth.users(id) NOT NULL,
    requester_role public.app_role NOT NULL,
    assigned_user_id UUID REFERENCES auth.users(id),
    assigned_role public.app_role,
    category TEXT NOT NULL,
    priority public.support_priority NOT NULL DEFAULT 'NORMAL',
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status public.support_status NOT NULL DEFAULT 'ABERTO',
    source_route TEXT,
    related_entity_type TEXT,
    related_entity_id UUID,
    related_protocol TEXT,
    safe_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- 2. support_messages
CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE NOT NULL,
    sender_user_id UUID REFERENCES auth.users(id),
    message TEXT NOT NULL,
    message_type public.support_message_type NOT NULL DEFAULT 'TEXTO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ
);

-- 3. support_attachments
CREATE TABLE IF NOT EXISTS public.support_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE NOT NULL,
    message_id UUID REFERENCES public.support_messages(id) ON DELETE SET NULL,
    uploaded_by UUID REFERENCES auth.users(id) NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. support_ticket_events
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE NOT NULL,
    actor_user_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ETAPA 2: PROTOCOLO E AUTOMACÃO
CREATE OR REPLACE FUNCTION public.generate_support_protocol()
RETURNS TRIGGER AS $$
DECLARE
    today_prefix TEXT;
    seq_num TEXT;
BEGIN
    today_prefix := 'SUP-' || to_char(now(), 'YYYYMMDD') || '-';
    
    SELECT LPAD((COUNT(*) + 1)::TEXT, 6, '0')
    INTO seq_num
    FROM public.support_tickets
    WHERE protocol LIKE today_prefix || '%';
    
    NEW.protocol := today_prefix || seq_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_support_protocol ON public.support_tickets;
CREATE TRIGGER tr_generate_support_protocol
BEFORE INSERT ON public.support_tickets
FOR EACH ROW
WHEN (NEW.protocol IS NULL)
EXECUTE FUNCTION public.generate_support_protocol();

-- ETAPA 15: RBAC / RLS
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_messages TO authenticated;
GRANT SELECT, INSERT ON public.support_attachments TO authenticated;
GRANT SELECT, INSERT ON public.support_ticket_events TO authenticated;

GRANT ALL ON public.support_tickets TO service_role;
GRANT ALL ON public.support_messages TO service_role;
GRANT ALL ON public.support_attachments TO service_role;
GRANT ALL ON public.support_ticket_events TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;
CREATE POLICY "Users can view their own tickets"
ON public.support_tickets FOR SELECT
TO authenticated
USING (
    auth.uid() = requester_user_id OR 
    public.has_role(auth.uid(), 'super_admin') OR 
    (public.has_role(auth.uid(), 'rh') AND assigned_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can create tickets" ON public.support_tickets;
CREATE POLICY "Users can create tickets"
ON public.support_tickets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requester_user_id);

DROP POLICY IF EXISTS "Admins/Moderators can update tickets" ON public.support_tickets;
CREATE POLICY "Admins/Moderators can update tickets"
ON public.support_tickets FOR UPDATE
TO authenticated
USING (
    public.has_role(auth.uid(), 'super_admin') OR 
    (public.has_role(auth.uid(), 'rh') AND (assigned_user_id = auth.uid() OR assigned_user_id IS NULL))
);

DROP POLICY IF EXISTS "Users can view messages of accessible tickets" ON public.support_messages;
CREATE POLICY "Users can view messages of accessible tickets"
ON public.support_messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.support_tickets
        WHERE id = ticket_id
    )
);

DROP POLICY IF EXISTS "Users can send messages to accessible tickets" ON public.support_messages;
CREATE POLICY "Users can send messages to accessible tickets"
ON public.support_messages FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.support_tickets
        WHERE id = ticket_id AND (
            requester_user_id = auth.uid() OR
            public.has_role(auth.uid(), 'super_admin') OR
            (public.has_role(auth.uid(), 'rh') AND assigned_user_id = auth.uid())
        )
    )
);

-- RLS para Storage
DROP POLICY IF EXISTS "Support attachments are private" ON storage.objects;
CREATE POLICY "Support attachments are private"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'support_private')
WITH CHECK (bucket_id = 'support_private');
