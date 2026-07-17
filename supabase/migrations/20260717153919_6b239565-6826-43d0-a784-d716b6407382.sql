
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cnpj text,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Super Admin: visualiza tudo
CREATE POLICY "Super admin vê todas empresas" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super Admin: cria
CREATE POLICY "Super admin insere empresas" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Super Admin: edita
CREATE POLICY "Super admin edita empresas" ON public.empresas
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RH: visualiza tudo
CREATE POLICY "RH vê todas empresas" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'rh'));

-- Supervisor: visualiza apenas ativas
CREATE POLICY "Supervisor vê empresas ativas" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor') AND ativo = true);

-- Compliance: visualiza apenas ativas
CREATE POLICY "Compliance vê empresas ativas" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance') AND ativo = true);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_empresas
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed inicial (idempotente)
INSERT INTO public.empresas (nome) VALUES ('R&G'), ('R&J'), ('CZB')
ON CONFLICT (nome) DO NOTHING;
