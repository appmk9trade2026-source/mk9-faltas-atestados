
-- =========================
-- RBAC Fase 1: fundação
-- =========================

-- 1. permissions
CREATE TABLE public.permissions (
  code TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select_authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "permissions_write_super_admin" ON public.permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2. role_permissions
CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_code)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select_authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_write_super_admin" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 3. user_permissions (override individual)
CREATE TYPE public.permission_effect AS ENUM ('allow', 'deny');

CREATE TABLE public.user_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  effect public.permission_effect NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, permission_code)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permissions_select_self_or_admin" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "user_permissions_write_super_admin" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- =========================
-- 4. Seed permissions
-- =========================
INSERT INTO public.permissions (code, module, action, description) VALUES
  ('dashboard.visualizar', 'dashboard', 'visualizar', 'Visualizar dashboard executivo'),
  ('empresa.visualizar', 'empresa', 'visualizar', 'Visualizar empresas'),
  ('empresa.criar', 'empresa', 'criar', 'Criar empresas'),
  ('empresa.editar', 'empresa', 'editar', 'Editar empresas'),
  ('empresa.excluir', 'empresa', 'excluir', 'Excluir/inativar empresas'),
  ('projeto.visualizar', 'projeto', 'visualizar', 'Visualizar projetos'),
  ('projeto.criar', 'projeto', 'criar', 'Criar projetos'),
  ('projeto.editar', 'projeto', 'editar', 'Editar projetos'),
  ('projeto.excluir', 'projeto', 'excluir', 'Excluir/inativar projetos'),
  ('colaborador.visualizar', 'colaborador', 'visualizar', 'Visualizar colaboradores'),
  ('colaborador.criar', 'colaborador', 'criar', 'Criar colaboradores'),
  ('colaborador.editar', 'colaborador', 'editar', 'Editar colaboradores'),
  ('colaborador.excluir', 'colaborador', 'excluir', 'Excluir/inativar colaboradores'),
  ('ausencia.visualizar', 'ausencia', 'visualizar', 'Visualizar ausências'),
  ('ausencia.criar', 'ausencia', 'criar', 'Registrar ausências'),
  ('ausencia.editar', 'ausencia', 'editar', 'Editar ausências'),
  ('ausencia.excluir', 'ausencia', 'excluir', 'Excluir ausências'),
  ('atestado.visualizar', 'atestado', 'visualizar', 'Visualizar atestados'),
  ('atestado.criar', 'atestado', 'criar', 'Registrar atestados'),
  ('atestado.editar', 'atestado', 'editar', 'Editar atestados'),
  ('usuario.visualizar', 'usuario', 'visualizar', 'Visualizar usuários'),
  ('usuario.criar', 'usuario', 'criar', 'Criar usuários'),
  ('usuario.editar', 'usuario', 'editar', 'Editar usuários'),
  ('relatorio.visualizar', 'relatorio', 'visualizar', 'Visualizar relatórios'),
  ('relatorio.exportar', 'relatorio', 'exportar', 'Exportar relatórios'),
  ('historico.visualizar', 'historico', 'visualizar', 'Visualizar histórico'),
  ('auditoria.visualizar', 'auditoria', 'visualizar', 'Visualizar auditoria'),
  ('configuracao.visualizar', 'configuracao', 'visualizar', 'Acessar configurações'),
  ('assistente.consultar', 'assistente', 'consultar', 'Usar assistente IA'),
  ('whatsapp.visualizar', 'whatsapp', 'visualizar', 'Visualizar módulo WhatsApp Admin'),
  ('alerta.visualizar', 'alerta', 'visualizar', 'Visualizar alertas operacionais');

-- =========================
-- 5. Seed role_permissions
-- =========================

-- super_admin: todas
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'super_admin'::public.app_role, code FROM public.permissions;

-- rh
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('rh','dashboard.visualizar'),
  ('rh','empresa.visualizar'),('rh','empresa.criar'),('rh','empresa.editar'),('rh','empresa.excluir'),
  ('rh','projeto.visualizar'),('rh','projeto.criar'),('rh','projeto.editar'),('rh','projeto.excluir'),
  ('rh','colaborador.visualizar'),('rh','colaborador.criar'),('rh','colaborador.editar'),('rh','colaborador.excluir'),
  ('rh','ausencia.visualizar'),('rh','ausencia.criar'),('rh','ausencia.editar'),('rh','ausencia.excluir'),
  ('rh','atestado.visualizar'),('rh','atestado.criar'),('rh','atestado.editar'),
  ('rh','usuario.visualizar'),('rh','usuario.criar'),('rh','usuario.editar'),
  ('rh','relatorio.visualizar'),('rh','relatorio.exportar'),
  ('rh','historico.visualizar'),
  ('rh','configuracao.visualizar'),
  ('rh','assistente.consultar'),
  ('rh','whatsapp.visualizar'),
  ('rh','alerta.visualizar');

-- compliance
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('compliance','dashboard.visualizar'),
  ('compliance','empresa.visualizar'),
  ('compliance','projeto.visualizar'),
  ('compliance','colaborador.visualizar'),
  ('compliance','ausencia.visualizar'),
  ('compliance','atestado.visualizar'),
  ('compliance','usuario.visualizar'),
  ('compliance','relatorio.visualizar'),('compliance','relatorio.exportar'),
  ('compliance','historico.visualizar'),
  ('compliance','auditoria.visualizar'),
  ('compliance','assistente.consultar'),
  ('compliance','alerta.visualizar');

-- supervisor
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('supervisor','dashboard.visualizar'),
  ('supervisor','colaborador.visualizar'),
  ('supervisor','ausencia.visualizar'),('supervisor','ausencia.criar'),
  ('supervisor','atestado.visualizar'),('supervisor','atestado.criar'),
  ('supervisor','alerta.visualizar'),
  ('supervisor','assistente.consultar');

-- operacao
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('operacao','dashboard.visualizar'),
  ('operacao','colaborador.visualizar'),
  ('operacao','ausencia.visualizar'),
  ('operacao','atestado.visualizar'),
  ('operacao','alerta.visualizar');

-- visualizador
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('visualizador','dashboard.visualizar'),
  ('visualizador','empresa.visualizar'),
  ('visualizador','projeto.visualizar'),
  ('visualizador','colaborador.visualizar'),
  ('visualizador','ausencia.visualizar'),
  ('visualizador','atestado.visualizar'),
  ('visualizador','relatorio.visualizar'),
  ('visualizador','historico.visualizar'),
  ('visualizador','alerta.visualizar');

-- =========================
-- 6. Resolver has_permission
-- Ordem: user_permissions (deny > allow) > role_permissions
-- =========================
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _override public.permission_effect;
  _from_role BOOLEAN;
BEGIN
  IF _user_id IS NULL OR _code IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. override individual (deny prevalece sobre allow)
  SELECT effect INTO _override
  FROM public.user_permissions
  WHERE user_id = _user_id AND permission_code = _code
  ORDER BY (effect = 'deny') DESC
  LIMIT 1;

  IF _override = 'deny' THEN
    RETURN FALSE;
  ELSIF _override = 'allow' THEN
    RETURN TRUE;
  END IF;

  -- 2. herança do perfil
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_code = _code
  ) INTO _from_role;

  RETURN COALESCE(_from_role, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, service_role;

-- my_permissions: retorna todas as permissões efetivas do usuário corrente
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(permission_code TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH from_role AS (
    SELECT DISTINCT rp.permission_code
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _uid
  ),
  allows AS (
    SELECT up.permission_code FROM public.user_permissions up
    WHERE up.user_id = _uid AND up.effect = 'allow'
  ),
  denies AS (
    SELECT up.permission_code FROM public.user_permissions up
    WHERE up.user_id = _uid AND up.effect = 'deny'
  )
  SELECT p.permission_code
  FROM (
    SELECT permission_code FROM from_role
    UNION
    SELECT permission_code FROM allows
  ) p
  WHERE p.permission_code NOT IN (SELECT permission_code FROM denies);
END;
$$;

REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;

-- =========================
-- 7. log_permission_denied helper
-- =========================
CREATE OR REPLACE FUNCTION public.log_permission_denied(
  _code TEXT,
  _rota TEXT DEFAULT NULL,
  _empresa_id UUID DEFAULT NULL,
  _projeto_id UUID DEFAULT NULL,
  _observacoes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, modulo, acao, entidade, entidade_id, observacoes, dados_novos, origem
  ) VALUES (
    auth.uid(),
    'rbac',
    'PERMISSAO_NEGADA'::public.audit_action,
    'Permissao',
    NULL,
    _observacoes,
    jsonb_build_object(
      'permission_code', _code,
      'rota', _rota,
      'empresa_id', _empresa_id,
      'projeto_id', _projeto_id
    ),
    'web'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_permission_denied(TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_permission_denied(TEXT, TEXT, UUID, UUID, TEXT) TO authenticated, service_role;
