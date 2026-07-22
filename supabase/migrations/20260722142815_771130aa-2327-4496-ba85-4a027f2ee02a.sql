
CREATE OR REPLACE VIEW public.whatsapp_tst_monitor AS
SELECT
  (SELECT count(*) FROM empresas WHERE ativo = true) AS empresas_ativas,
  (SELECT count(*) FROM empresas e
     WHERE e.ativo = true
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_tst_destinatarios t
          WHERE t.empresa_id = e.id AND t.ativo = true
       )) AS empresas_sem_tst,
  -- Só empresas que JÁ possuem TST cadastrado (ativo) mas nenhum confirmado.
  (SELECT count(*) FROM empresas e
     WHERE e.ativo = true
       AND EXISTS (
         SELECT 1 FROM whatsapp_tst_destinatarios t
          WHERE t.empresa_id = e.id AND t.ativo = true
       )
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_tst_destinatarios t
          WHERE t.empresa_id = e.id AND t.ativo = true AND t.confirmado = true
       )) AS empresas_sem_confirmacao,
  (SELECT count(*) FROM whatsapp_tst_destinatarios WHERE empresa_id IS NULL) AS tsts_sem_empresa,
  (SELECT count(*) FROM whatsapp_outbox o
     WHERE o.template_codigo = 'ACIDENTE_TRABALHO_TST_V1'
       AND o.status = ANY (ARRAY['FALHOU_TEMPORARIO'::whatsapp_status, 'FALHOU_DEFINITIVO'::whatsapp_status])
       AND o.created_at > now() - interval '24 hours') AS falhas_24h,
  (SELECT count(*) FROM alertas
     WHERE regra_codigo = 'ACIDENTE_SEM_TST' AND status = 'NOVO') AS alertas_sem_tst_abertos,
  (SELECT max(enviado_em) FROM whatsapp_outbox
     WHERE template_codigo = 'ACIDENTE_TRABALHO_TST_V1') AS ultimo_envio_em;
