
CREATE OR REPLACE FUNCTION public.saude_sistema()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'usuarios',       (SELECT count(*) FROM public.profiles),
    'usuarios_ativos',(SELECT count(*) FROM public.profiles WHERE ativo=true),
    'empresas',       (SELECT count(*) FROM public.empresas WHERE ativo=true),
    'projetos',       (SELECT count(*) FROM public.projetos WHERE ativo=true),
    'colaboradores',  (SELECT count(*) FROM public.colaboradores WHERE ativo=true),
    'ausencias',      (SELECT count(*) FROM public.ausencias),
    'ausencias_pendentes',(SELECT count(*) FROM public.ausencias WHERE status='PENDENTE'),
    'comunicacoes',   (SELECT count(*) FROM public.comunicacoes),
    'auditoria_24h',  (SELECT count(*) FROM public.audit_logs WHERE created_at >= now() - interval '24 hours'),
    'ultima_migracao',(SELECT max(version) FROM supabase_migrations.schema_migrations),
    'db_size',        pg_size_pretty(pg_database_size(current_database())),
    'gerado_em',      now()
  ) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.saude_sistema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saude_sistema() TO authenticated;
