
BEGIN;

-- Desativar temporariamente triggers de auditoria/materialização durante DELETEs
SET LOCAL session_replication_role = 'replica';

-- 1) Storage: anexos de ausências
DELETE FROM storage.objects WHERE bucket_id = 'ausencias';

-- 2) WhatsApp
DELETE FROM public.whatsapp_outbox_eventos;
DELETE FROM public.whatsapp_outbox;
DELETE FROM public.whatsapp_worker_execucoes;

-- 3) Operação / escalonamento / alertas
DELETE FROM public.escalonamento_execucoes;
DELETE FROM public.operacao_alertas;
DELETE FROM public.alertas_eventos;
DELETE FROM public.alertas;
DELETE FROM public.comunicacoes;

-- 4) Ausências e auditoria
DELETE FROM public.ausencias;
DELETE FROM public.audit_logs;

-- 5) BI
DELETE FROM public.bi_refresh_execucoes;
DELETE FROM public.bi_absenteismo_diario;

-- 6) Importações e colaboradores
DELETE FROM public.importacoes;
DELETE FROM public.colaboradores;

-- Restaurar comportamento normal
SET LOCAL session_replication_role = 'origin';

COMMIT;
