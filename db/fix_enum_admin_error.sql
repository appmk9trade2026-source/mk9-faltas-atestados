-- Procedimento para corrigir o uso de 'admin' no enum e garantir conformidade com app_role
-- FASE 1: Auditar funções que possam estar referenciando 'admin' hardcoded

-- Nota: O enum app_role real é: 'super_admin', 'rh', 'compliance', 'coordenador', 'supervisor', 'operacao', 'visualizador'

-- Nenhuma alteração no enum necessária, apenas correção de lógica.

GRANT USAGE ON SCHEMA public TO authenticated;
