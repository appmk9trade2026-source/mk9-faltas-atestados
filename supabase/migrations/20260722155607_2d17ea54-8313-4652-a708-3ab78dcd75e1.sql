
CREATE TABLE public.primeiro_acesso_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_masked TEXT NOT NULL,
  resultado TEXT NOT NULL,
  codigo_erro TEXT,
  mensagem_erro TEXT,
  request_id TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.primeiro_acesso_logs TO authenticated;
GRANT ALL ON public.primeiro_acesso_logs TO service_role;

ALTER TABLE public.primeiro_acesso_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_primeiro_acesso_logs"
  ON public.primeiro_acesso_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_primeiro_acesso_logs_created_at
  ON public.primeiro_acesso_logs (created_at DESC);

CREATE INDEX idx_primeiro_acesso_logs_resultado
  ON public.primeiro_acesso_logs (resultado, created_at DESC);
