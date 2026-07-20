-- Novas ações de auditoria para Histórico, Relatórios e Alertas.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'HISTORICO_VISUALIZADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'RELATORIO_VISUALIZADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'RELATORIO_EXPORTADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ALERTA_CRIADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ALERTA_LIDO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ALERTA_ASSUMIDO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ALERTA_RESOLVIDO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ALERTA_DISPENSADO';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ALERTA_REABERTO';

-- Índice para paginação por cursor no histórico (created_at desc, id).
CREATE INDEX IF NOT EXISTS audit_logs_created_id_desc_idx
  ON public.audit_logs (created_at DESC, id DESC);

-- Índices auxiliares para filtros do histórico.
CREATE INDEX IF NOT EXISTS audit_logs_registro_id_idx
  ON public.audit_logs (registro_id) WHERE registro_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_empresa_idx
  ON public.audit_logs (empresa_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_projeto_idx
  ON public.audit_logs (projeto_id) WHERE projeto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_modulo_idx
  ON public.audit_logs (modulo);
CREATE INDEX IF NOT EXISTS audit_logs_usuario_idx
  ON public.audit_logs (usuario_id) WHERE usuario_id IS NOT NULL;