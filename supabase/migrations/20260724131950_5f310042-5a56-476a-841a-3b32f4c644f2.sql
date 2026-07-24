
-- =========================================================================
-- ETAPA 3 — Escopo do Coordenador
-- Aditiva: não altera nem remove policies existentes.
-- =========================================================================

-- ---------- Helpers ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_coordenador()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'coordenador'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.coordenador_supervisor_ids(_coord_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id
    FROM public.profiles p
   WHERE p.coordenador_usuario_id = _coord_id
     AND p.ativo = true;
$$;

CREATE OR REPLACE FUNCTION public.coordenador_pode_ver_colaborador(_coord_id uuid, _colab_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.colaboradores c
      JOIN public.profiles p ON p.id = c.supervisor_usuario_id
     WHERE c.id = _colab_id
       AND p.coordenador_usuario_id = _coord_id
  );
$$;

CREATE OR REPLACE FUNCTION public.coordenador_pode_ver_ausencia(_coord_id uuid, _ausencia_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.ausencias a
      JOIN public.colaboradores c ON c.id = a.colaborador_id
      JOIN public.profiles p       ON p.id = c.supervisor_usuario_id
     WHERE a.id = _ausencia_id
       AND p.coordenador_usuario_id = _coord_id
  );
$$;

CREATE OR REPLACE FUNCTION public.coordenador_has_projeto_via_equipe(_user_id uuid, _projeto_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.colaboradores c
      JOIN public.profiles p ON p.id = c.supervisor_usuario_id
     WHERE c.projeto_id = _projeto_id
       AND c.ativo = true
       AND p.coordenador_usuario_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.coordenador_has_empresa_via_equipe(_user_id uuid, _empresa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.colaboradores c
      JOIN public.profiles p ON p.id = c.supervisor_usuario_id
     WHERE c.empresa_id = _empresa_id
       AND c.ativo = true
       AND p.coordenador_usuario_id = _user_id
  );
$$;

-- Hardening: revogar EXECUTE do público
REVOKE EXECUTE ON FUNCTION public.is_coordenador() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenador_supervisor_ids(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenador_pode_ver_colaborador(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenador_pode_ver_ausencia(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenador_has_projeto_via_equipe(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenador_has_empresa_via_equipe(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coordenador() TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_supervisor_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_pode_ver_colaborador(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_pode_ver_ausencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_has_projeto_via_equipe(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenador_has_empresa_via_equipe(uuid, uuid) TO authenticated;

-- ---------- Índices ------------------------------------------------------

CREATE INDEX IF NOT EXISTS colaboradores_sup_ativo_idx
  ON public.colaboradores (supervisor_usuario_id, ativo)
  WHERE supervisor_usuario_id IS NOT NULL;

-- ---------- Colaboradores: SELECT do Coordenador -------------------------

DROP POLICY IF EXISTS colaboradores_coordenador_select ON public.colaboradores;
CREATE POLICY colaboradores_coordenador_select
  ON public.colaboradores FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND supervisor_usuario_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = colaboradores.supervisor_usuario_id
         AND p.coordenador_usuario_id = auth.uid()
    )
  );

-- ---------- Ausências: SELECT/INSERT/UPDATE do Coordenador ---------------
-- DELETE permanece bloqueado (não há policy) — regra atual preservada.

DROP POLICY IF EXISTS ausencias_coordenador_select ON public.ausencias;
CREATE POLICY ausencias_coordenador_select
  ON public.ausencias FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
        JOIN public.profiles p ON p.id = c.supervisor_usuario_id
       WHERE c.id = ausencias.colaborador_id
         AND p.coordenador_usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ausencias_coordenador_insert ON public.ausencias;
CREATE POLICY ausencias_coordenador_insert
  ON public.ausencias FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
        JOIN public.profiles p ON p.id = c.supervisor_usuario_id
       WHERE c.id = ausencias.colaborador_id
         AND p.coordenador_usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ausencias_coordenador_update ON public.ausencias;
CREATE POLICY ausencias_coordenador_update
  ON public.ausencias FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
        JOIN public.profiles p ON p.id = c.supervisor_usuario_id
       WHERE c.id = ausencias.colaborador_id
         AND p.coordenador_usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.colaboradores c
        JOIN public.profiles p ON p.id = c.supervisor_usuario_id
       WHERE c.id = ausencias.colaborador_id
         AND p.coordenador_usuario_id = auth.uid()
    )
  );

-- ---------- Projetos: SELECT via equipe ----------------------------------

DROP POLICY IF EXISTS coordenador_projetos_via_equipe_select ON public.projetos;
CREATE POLICY coordenador_projetos_via_equipe_select
  ON public.projetos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND ativo = true
    AND public.coordenador_has_projeto_via_equipe(auth.uid(), id)
  );

-- ---------- Empresas: SELECT via equipe ----------------------------------

DROP POLICY IF EXISTS coordenador_empresas_via_equipe_select ON public.empresas;
CREATE POLICY coordenador_empresas_via_equipe_select
  ON public.empresas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND ativo = true
    AND public.coordenador_has_empresa_via_equipe(auth.uid(), id)
  );

-- ---------- Tabelas auxiliares do formulário -----------------------------

DROP POLICY IF EXISTS tipos_ausencia_coordenador_select ON public.tipos_ausencia;
CREATE POLICY tipos_ausencia_coordenador_select
  ON public.tipos_ausencia FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador'::app_role) AND ativo = true);

DROP POLICY IF EXISTS opcoes_periodo_coordenador_select ON public.opcoes_periodo_ausencia;
CREATE POLICY opcoes_periodo_coordenador_select
  ON public.opcoes_periodo_ausencia FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador'::app_role));

DROP POLICY IF EXISTS tao_coordenador_select ON public.tipo_ausencia_opcoes_periodo;
CREATE POLICY tao_coordenador_select
  ON public.tipo_ausencia_opcoes_periodo FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coordenador'::app_role));

-- ---------- Profiles: leitura de Supervisores e Colaboradores da equipe --
-- Permite exibir nome do Supervisor em rankings e do responsável.

DROP POLICY IF EXISTS profiles_coordenador_ve_equipe ON public.profiles;
CREATE POLICY profiles_coordenador_ve_equipe
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coordenador'::app_role)
    AND (
      -- o próprio Coordenador
      profiles.id = auth.uid()
      -- Supervisores vinculados
      OR profiles.coordenador_usuario_id = auth.uid()
    )
  );

-- ---------- RPC: get_projetos_ativos_por_empresa respeitando escopo ------
-- Mantém compatibilidade com Super Admin / RH / Supervisor; adiciona filtro
-- para Coordenador.

CREATE OR REPLACE FUNCTION public.get_projetos_ativos_por_empresa(_empresa_id uuid)
RETURNS TABLE(id uuid, nome text, codigo_protocolo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.nome, p.codigo_protocolo
    FROM public.projetos p
   WHERE p.empresa_id = _empresa_id
     AND p.ativo = true
     AND (
       public.has_role(auth.uid(), 'super_admin'::app_role)
       OR public.has_role(auth.uid(), 'rh'::app_role)
       OR public.has_role(auth.uid(), 'compliance'::app_role)
       OR (
         public.has_role(auth.uid(), 'supervisor'::app_role)
         AND public.supervisor_has_projeto_via_equipe(auth.uid(), p.id)
       )
       OR (
         public.has_role(auth.uid(), 'coordenador'::app_role)
         AND public.coordenador_has_projeto_via_equipe(auth.uid(), p.id)
       )
     )
   ORDER BY p.nome ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_projetos_ativos_por_empresa(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_projetos_ativos_por_empresa(uuid) TO authenticated;
