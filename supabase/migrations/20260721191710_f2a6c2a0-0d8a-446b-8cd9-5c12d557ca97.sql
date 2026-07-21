-- Adiciona policies de DELETE para projetos. Sem elas, o DELETE
-- sob RLS afeta zero linhas silenciosamente e a UI mostra "sucesso"
-- indevidamente. A permissão granular projeto.excluir continua sendo
-- validada no server function via require_permission.

CREATE POLICY "Super admin exclui projetos"
  ON public.projetos
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "RH exclui projetos"
  ON public.projetos
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'rh'::app_role));