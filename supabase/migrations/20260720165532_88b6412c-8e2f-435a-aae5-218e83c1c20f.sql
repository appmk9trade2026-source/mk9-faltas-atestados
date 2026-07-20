
BEGIN;
SET LOCAL session_replication_role = 'replica';
DELETE FROM storage.objects WHERE bucket_id = 'atestados';
DELETE FROM public.escalonamento_execucoes;
SET LOCAL session_replication_role = 'origin';
COMMIT;
