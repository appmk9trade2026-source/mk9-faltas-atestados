BEGIN;

-- 1. Remover o overload obsoleto (13 argumentos) que causava ambiguidade.
-- A assinatura canônica (OID 44153) com 14 argumentos (_trace_id) permanecerá como a única.
DROP FUNCTION IF EXISTS public.log_audit_event(text, audit_action, text, uuid, uuid, uuid, jsonb, jsonb, boolean, text, text, text, text);

COMMIT;