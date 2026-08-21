GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.require_permission(text, text, uuid, uuid, uuid, uuid, text) TO anon;

SELECT 
    grantee, 
    privilege_type 
FROM 
    information_schema.routine_privileges 
WHERE 
    routine_name = 'require_permission';