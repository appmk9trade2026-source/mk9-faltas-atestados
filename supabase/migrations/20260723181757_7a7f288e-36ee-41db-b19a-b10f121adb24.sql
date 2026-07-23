
-- Fix: Supervisores precisam LER tipos ativos e opções de período para registrar ausências.
-- Sem SELECT, RLS retorna vazio e o formulário mostra "Nenhum tipo encontrado".
-- Escrita/administração continua restrita a super_admin.

DROP POLICY IF EXISTS tipos_ausencia_select ON public.tipos_ausencia;
CREATE POLICY tipos_ausencia_select ON public.tipos_ausencia
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'compliance'::app_role)
    OR (has_role(auth.uid(), 'supervisor'::app_role) AND ativo = true)
  );

DROP POLICY IF EXISTS opcoes_periodo_select ON public.opcoes_periodo_ausencia;
CREATE POLICY opcoes_periodo_select ON public.opcoes_periodo_ausencia
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'compliance'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS tao_select ON public.tipo_ausencia_opcoes_periodo;
CREATE POLICY tao_select ON public.tipo_ausencia_opcoes_periodo
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'compliance'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  );
