CREATE OR REPLACE FUNCTION public.admin_contas_primeiro_acesso_suspeitas(
  _corte timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  matricula text,
  criado_em timestamptz,
  ultimo_login timestamptz,
  motivos text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.nome,
    p.email,
    p.matricula,
    p.created_at,
    u.last_sign_in_at,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN u.last_sign_in_at IS NULL THEN 'nunca_logou' END,
      CASE WHEN p.primeiro_acesso_pendente = false THEN 'primeiro_acesso_ja_marcado_concluido' END,
      CASE WHEN p.senha_temporaria_redefinida_em IS NULL THEN 'sem_evidencia_de_troca_de_senha' END,
      CASE WHEN p.created_at < COALESCE(_corte, now() - interval '1 day') THEN 'criado_no_periodo_da_regra_antiga' END
    ], NULL) AS motivos
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE public.has_role(auth.uid(), 'super_admin')
    AND p.ativo = true
    AND u.last_sign_in_at IS NULL
    AND p.primeiro_acesso_pendente = false
    AND p.senha_temporaria_redefinida_em IS NULL
    AND p.created_at < COALESCE(_corte, now() - interval '1 day')
  ORDER BY p.created_at ASC
$$;

REVOKE ALL ON FUNCTION public.admin_contas_primeiro_acesso_suspeitas(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_contas_primeiro_acesso_suspeitas(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_contas_primeiro_acesso_suspeitas(timestamptz) TO service_role;