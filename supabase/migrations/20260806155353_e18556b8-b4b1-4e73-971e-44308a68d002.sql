-- Etapa 2: Campos Canônicos de Autoria (Retry)
ALTER TABLE public.ausencias 
ADD COLUMN IF NOT EXISTS criado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS atualizado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS lancado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS cancelado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS retificado_por_usuario_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS autor_nome_snapshot text,
ADD COLUMN IF NOT EXISTS autor_email_snapshot text,
ADD COLUMN IF NOT EXISTS autor_papel_snapshot text,
ADD COLUMN IF NOT EXISTS confirmacao_dados_ok boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS status_documental text DEFAULT 'ATIVO';

-- Grant access to these new columns
GRANT SELECT, INSERT, UPDATE ON public.ausencias TO authenticated;
GRANT ALL ON public.ausencias TO service_role;

-- Etapa 6: Tabela de Contestações
CREATE TABLE IF NOT EXISTS public.ausencia_contestacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ausencia_id uuid REFERENCES public.ausencias(id) ON DELETE CASCADE NOT NULL,
    solicitante_usuario_id uuid REFERENCES auth.users(id) NOT NULL,
    data_hora timestamp with time zone DEFAULT now(),
    motivo text NOT NULL,
    descricao text,
    status text DEFAULT 'ABERTA', -- ABERTA, EM_ANALISE, PROCEDENTE, IMPROCEDENTE, CORRIGIDA
    resolvido_em timestamp with time zone,
    resolvido_por uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- RLS para Contestações
ALTER TABLE public.ausencia_contestacoes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.ausencia_contestacoes TO authenticated;
GRANT ALL ON public.ausencia_contestacoes TO service_role;

-- Policies for contestacoes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Usuários autenticados podem ver contestações de seu escopo') THEN
        CREATE POLICY "Usuários autenticados podem ver contestações de seu escopo"
        ON public.ausencia_contestacoes
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.ausencias a 
                WHERE a.id = ausencia_id
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Usuários permitidos podem criar contestações') THEN
        CREATE POLICY "Usuários permitidos podem criar contestações"
        ON public.ausencia_contestacoes
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = solicitante_usuario_id);
    END IF;
END $$;

-- Helper function to capture snapshots on server side
CREATE OR REPLACE FUNCTION public.get_user_snapshot(_user_id uuid)
RETURNS TABLE (nome text, email text, papel text) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.nome as nome,
    u.email as email,
    COALESCE(ur.role::text, 'user') as papel
  FROM auth.users u
  JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.user_roles ur ON u.id = ur.user_id
  WHERE u.id = _user_id
  LIMIT 1;
$$;
