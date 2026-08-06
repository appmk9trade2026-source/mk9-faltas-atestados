
REVOKE ALL ON FUNCTION public.get_user_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_snapshot(uuid) TO authenticated;
