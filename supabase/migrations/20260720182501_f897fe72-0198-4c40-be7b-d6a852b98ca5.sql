
-- 1. Novas permissões
INSERT INTO public.permissions (code, module, action, description) VALUES
  ('permissao.visualizar', 'permissao', 'visualizar', 'Visualizar matriz de permissões'),
  ('permissao.editar', 'permissao', 'editar', 'Editar matriz de permissões e overrides')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('super_admin','permissao.visualizar'),
  ('super_admin','permissao.editar')
ON CONFLICT DO NOTHING;

-- 2. Ações de auditoria
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ROLE_PERMISSION_CREATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ROLE_PERMISSION_UPDATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ROLE_PERMISSION_REMOVED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ROLE_PERMISSION_BULK_UPDATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USER_PERMISSION_UPDATED';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'USER_PERMISSION_REMOVED';
