
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(permission_code text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH from_role AS (
    SELECT DISTINCT rp.permission_code AS code
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _uid
  ),
  allows AS (
    SELECT up.permission_code AS code
    FROM public.user_permissions up
    WHERE up.user_id = _uid AND up.effect = 'allow'
  ),
  denies AS (
    SELECT up.permission_code AS code
    FROM public.user_permissions up
    WHERE up.user_id = _uid AND up.effect = 'deny'
  )
  SELECT p.code
  FROM (
    SELECT code FROM from_role
    UNION
    SELECT code FROM allows
  ) p
  WHERE p.code NOT IN (SELECT code FROM denies);
END;
$function$;
