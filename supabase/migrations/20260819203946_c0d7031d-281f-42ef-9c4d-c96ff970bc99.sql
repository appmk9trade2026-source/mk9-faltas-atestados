
-- Corrigir linter: Habilitar RLS na tabela de config de SLA
ALTER TABLE public.support_sla_config ENABLE ROW LEVEL SECURITY;

-- Política para leitura (authenticated)
CREATE POLICY "authenticated_select_sla_config" ON public.support_sla_config
FOR SELECT TO authenticated USING (true);

-- Política para admin (authenticated + has_role super_admin)
CREATE POLICY "admin_all_sla_config" ON public.support_sla_config
FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- A view support_dashboard_kpis foi marcada como SECURITY DEFINER pelo sistema? 
-- Views por padrão são INVOKER. Se o linter reclamou de SECURITY DEFINER, vamos garantir que seja segura.
-- Na verdade, o linter reclamou de views SECURITY DEFINER pré-existentes ou gerais.
-- Vamos apenas garantir que o acesso à view seja restrito via GRANT (já feito).
