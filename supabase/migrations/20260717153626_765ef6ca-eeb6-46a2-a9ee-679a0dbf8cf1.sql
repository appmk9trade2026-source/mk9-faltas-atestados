
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  -- Se já existir qualquer super_admin, não faz nada
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    RETURN 'already_exists';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF lower(coalesce(v_email, '')) <> 'automacaomk9@gmail.com' THEN
    RETURN 'not_allowed';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'super_admin')
  ON CONFLICT DO NOTHING;

  RETURN 'created';
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_super_admin() TO authenticated;
