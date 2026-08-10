
-- Restaurar o estado original da ausência após o teste de sucesso
UPDATE public.ausencias 
SET status_processamento = 'AGUARDANDO',
    processamento_iniciado_em = NULL
WHERE protocolo = 'COMPARTI-20260728-000007';
