
-- ENUMS
CREATE TYPE public.roadmap_tipo AS ENUM ('FEATURE','BUG','MELHORIA','REFATORACAO','SEGURANCA','PERFORMANCE','UX','DOCUMENTACAO');
CREATE TYPE public.roadmap_status AS ENUM ('BACKLOG','PLANEJADO','EM_DESENVOLVIMENTO','EM_TESTES','HOMOLOGACAO','PRONTO_PARA_RELEASE','PUBLICADO','CANCELADO');
CREATE TYPE public.roadmap_prioridade AS ENUM ('BAIXA','MEDIA','ALTA','CRITICA');
CREATE TYPE public.roadmap_categoria AS ENUM ('RH','OPERACOES','AUDITORIA','DASHBOARD','COMUNICACOES','AUSENCIAS','COLABORADORES','DEPLOY','INFRAESTRUTURA','NOTIFICACOES','OPERACAO_ASSISTIDA','RELATORIOS','OUTROS');
CREATE TYPE public.release_tipo AS ENUM ('HOTFIX','PATCH','MINOR','MAJOR');
CREATE TYPE public.release_status AS ENUM ('PLANEJADA','EM_EXECUCAO','PUBLICADA','CANCELADA');
CREATE TYPE public.changelog_tipo AS ENUM ('NOVA_FUNCIONALIDADE','CORRECAO','SEGURANCA','PERFORMANCE','REFATORACAO','UI','INFRAESTRUTURA');

-- RELEASES
CREATE TABLE public.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao text NOT NULL UNIQUE,
  nome text,
  descricao text,
  tipo public.release_tipo NOT NULL DEFAULT 'MINOR',
  status public.release_status NOT NULL DEFAULT 'PLANEJADA',
  ambiente text NOT NULL DEFAULT 'producao',
  data_prevista date,
  data_publicacao timestamptz,
  responsavel uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text,
  commit text,
  build text,
  observacoes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.releases TO authenticated;
GRANT ALL ON public.releases TO service_role;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "releases select admin/compliance" ON public.releases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "releases insert admin" ON public.releases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "releases update admin" ON public.releases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "releases delete admin" ON public.releases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- ROADMAP
CREATE TABLE public.roadmap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  descricao_tecnica text,
  descricao_funcional text,
  objetivo text,
  criterios_aceite text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  versao text,
  release_id uuid REFERENCES public.releases(id) ON DELETE SET NULL,
  tipo public.roadmap_tipo NOT NULL DEFAULT 'FEATURE',
  status public.roadmap_status NOT NULL DEFAULT 'BACKLOG',
  prioridade public.roadmap_prioridade NOT NULL DEFAULT 'MEDIA',
  categoria public.roadmap_categoria NOT NULL DEFAULT 'OUTROS',
  responsavel uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text,
  inicio_previsto date,
  fim_previsto date,
  inicio_real date,
  fim_real date,
  incidente_id uuid REFERENCES public.operacao_incidentes(id) ON DELETE SET NULL,
  ordem int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_roadmap_status ON public.roadmap(status);
CREATE INDEX idx_roadmap_categoria ON public.roadmap(categoria);
CREATE INDEX idx_roadmap_release ON public.roadmap(release_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap TO authenticated;
GRANT ALL ON public.roadmap TO service_role;
ALTER TABLE public.roadmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roadmap select admin/compliance" ON public.roadmap FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "roadmap insert admin" ON public.roadmap FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "roadmap update admin" ON public.roadmap FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "roadmap delete admin" ON public.roadmap FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- CHANGELOG
CREATE TABLE public.release_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  roadmap_id uuid REFERENCES public.roadmap(id) ON DELETE SET NULL,
  tipo public.changelog_tipo NOT NULL,
  titulo text NOT NULL,
  descricao text,
  impacto text,
  modulo text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_changelog_release ON public.release_changelog(release_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_changelog TO authenticated;
GRANT ALL ON public.release_changelog TO service_role;
ALTER TABLE public.release_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changelog select admin/compliance" ON public.release_changelog FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance'));
CREATE POLICY "changelog insert admin" ON public.release_changelog FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "changelog update admin" ON public.release_changelog FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "changelog delete admin" ON public.release_changelog FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- TRIGGERS: updated_at
CREATE TRIGGER trg_roadmap_updated BEFORE UPDATE ON public.roadmap
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_releases_updated BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- TRIGGERS: preencher created_by e nomes
CREATE OR REPLACE FUNCTION public.tg_roadmap_biu()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF NEW.responsavel IS NOT NULL AND NEW.responsavel_nome IS NULL THEN
      SELECT nome INTO NEW.responsavel_nome FROM public.profiles WHERE id=NEW.responsavel;
    END IF;
    IF NEW.status='PUBLICADO' AND NEW.fim_real IS NULL THEN NEW.fim_real := CURRENT_DATE; END IF;
  ELSE
    IF NEW.status='PUBLICADO' AND OLD.status<>'PUBLICADO' AND NEW.fim_real IS NULL THEN
      NEW.fim_real := CURRENT_DATE;
    END IF;
    IF NEW.status='EM_DESENVOLVIMENTO' AND OLD.status<>'EM_DESENVOLVIMENTO' AND NEW.inicio_real IS NULL THEN
      NEW.inicio_real := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_roadmap_biu BEFORE INSERT OR UPDATE ON public.roadmap
  FOR EACH ROW EXECUTE FUNCTION public.tg_roadmap_biu();

CREATE OR REPLACE FUNCTION public.tg_releases_biu()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF NEW.responsavel IS NOT NULL AND NEW.responsavel_nome IS NULL THEN
      SELECT nome INTO NEW.responsavel_nome FROM public.profiles WHERE id=NEW.responsavel;
    END IF;
  END IF;
  IF NEW.status='PUBLICADA' AND OLD.status IS DISTINCT FROM 'PUBLICADA' AND NEW.data_publicacao IS NULL THEN
    NEW.data_publicacao := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_releases_biu BEFORE INSERT OR UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.tg_releases_biu();

-- AUDITORIA
CREATE OR REPLACE FUNCTION public.tg_roadmap_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acao public.audit_action; v_obs text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_acao := 'CREATE'; v_obs := 'Item criado';
    PERFORM public.log_audit_event('roadmap', v_acao, TG_TABLE_NAME, NEW.id, NULL, NULL, NULL, to_jsonb(NEW), true, v_obs, 'roadmap', NULL, NULL);
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_audit_event('roadmap','MUDANCA_STATUS',TG_TABLE_NAME,NEW.id,NULL,NULL,jsonb_build_object('status',OLD.status),jsonb_build_object('status',NEW.status),true,'Status alterado','roadmap',NULL,NULL);
    END IF;
    IF TG_TABLE_NAME='roadmap' AND NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN
      PERFORM public.log_audit_event('roadmap','UPDATE',TG_TABLE_NAME,NEW.id,NULL,NULL,jsonb_build_object('prioridade',OLD.prioridade),jsonb_build_object('prioridade',NEW.prioridade),true,'Prioridade alterada','roadmap',NULL,NULL);
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      PERFORM public.log_audit_event('roadmap','UPDATE',TG_TABLE_NAME,NEW.id,NULL,NULL,to_jsonb(OLD),to_jsonb(NEW),true,'Atualização','roadmap',NULL,NULL);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.log_audit_event('roadmap','DELETE_LOGICO',TG_TABLE_NAME,OLD.id,NULL,NULL,to_jsonb(OLD),NULL,true,'Removido','roadmap',NULL,NULL);
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER trg_roadmap_audit AFTER INSERT OR UPDATE OR DELETE ON public.roadmap
  FOR EACH ROW EXECUTE FUNCTION public.tg_roadmap_audit();
CREATE TRIGGER trg_releases_audit AFTER INSERT OR UPDATE OR DELETE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.tg_roadmap_audit();
CREATE TRIGGER trg_changelog_audit AFTER INSERT OR UPDATE OR DELETE ON public.release_changelog
  FOR EACH ROW EXECUTE FUNCTION public.tg_roadmap_audit();

-- APROVAÇÃO: valida transição para PRONTO_PARA_RELEASE
CREATE OR REPLACE FUNCTION public.tg_roadmap_valida_pronto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status='PRONTO_PARA_RELEASE' AND OLD.status IS DISTINCT FROM 'PRONTO_PARA_RELEASE' THEN
    IF COALESCE(btrim(NEW.descricao),'')='' THEN
      RAISE EXCEPTION 'Descrição é obrigatória para PRONTO_PARA_RELEASE' USING ERRCODE='check_violation';
    END IF;
    IF COALESCE(btrim(NEW.criterios_aceite),'')='' THEN
      RAISE EXCEPTION 'Critérios de aceite são obrigatórios para PRONTO_PARA_RELEASE' USING ERRCODE='check_violation';
    END IF;
    IF NEW.release_id IS NULL THEN
      RAISE EXCEPTION 'Release vinculada é obrigatória para PRONTO_PARA_RELEASE' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_roadmap_valida_pronto BEFORE UPDATE ON public.roadmap
  FOR EACH ROW EXECUTE FUNCTION public.tg_roadmap_valida_pronto();

-- DASHBOARD RPC
CREATE OR REPLACE FUNCTION public.roadmap_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'backlog',(SELECT count(*) FROM roadmap WHERE status='BACKLOG'),
      'em_desenvolvimento',(SELECT count(*) FROM roadmap WHERE status='EM_DESENVOLVIMENTO'),
      'em_testes',(SELECT count(*) FROM roadmap WHERE status='EM_TESTES'),
      'prontos',(SELECT count(*) FROM roadmap WHERE status='PRONTO_PARA_RELEASE'),
      'publicados',(SELECT count(*) FROM roadmap WHERE status='PUBLICADO'),
      'bugs',(SELECT count(*) FROM roadmap WHERE tipo='BUG'),
      'melhorias',(SELECT count(*) FROM roadmap WHERE tipo='MELHORIA'),
      'tempo_medio_entrega_dias',
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (fim_real - inicio_real))/86400.0),0)
         FROM roadmap WHERE fim_real IS NOT NULL AND inicio_real IS NOT NULL),
      'lead_time_dias',
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (fim_real - created_at::date))/86400.0),0)
         FROM roadmap WHERE fim_real IS NOT NULL)
    ),
    'por_categoria',(SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC),'[]'::jsonb) FROM
      (SELECT categoria::text AS nome, count(*) AS total FROM roadmap GROUP BY categoria) t),
    'por_prioridade',(SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM
      (SELECT prioridade::text AS nome, count(*) AS total FROM roadmap GROUP BY prioridade) t),
    'por_status',(SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM
      (SELECT status::text AS nome, count(*) AS total FROM roadmap GROUP BY status) t),
    'por_tipo',(SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM
      (SELECT tipo::text AS nome, count(*) AS total FROM roadmap GROUP BY tipo) t),
    'por_versao',(SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.versao),'[]'::jsonb) FROM
      (SELECT COALESCE(versao,'(sem versão)') AS versao, count(*) AS total,
              count(*) FILTER (WHERE tipo='BUG') AS bugs
       FROM roadmap GROUP BY versao) t),
    'releases',(SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC),'[]'::jsonb) FROM
      (SELECT r.id, r.versao, r.nome, r.status::text, r.tipo::text, r.data_prevista, r.data_publicacao, r.commit, r.build,
              (SELECT count(*) FROM roadmap x WHERE x.release_id=r.id AND x.tipo='MELHORIA') AS melhorias,
              (SELECT count(*) FROM roadmap x WHERE x.release_id=r.id AND x.tipo='BUG') AS bugs,
              (SELECT count(*) FROM roadmap x WHERE x.release_id=r.id) AS itens
       FROM releases r) r)
  ) INTO v;
  RETURN v;
END $$;
