
UPDATE public.ausencias 
SET status_processamento = 'EM_PROCESSAMENTO',
    processamento_iniciado_em = now()
WHERE protocolo = 'COMPARTI-20260728-000007'
RETURNING id, protocolo, status_processamento;
