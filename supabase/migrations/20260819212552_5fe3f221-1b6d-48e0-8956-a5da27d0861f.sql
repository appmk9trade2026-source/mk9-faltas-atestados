
INSERT INTO public.support_knowledge_articles (
  title, slug, summary, category, source_module, content, audience, status, version, created_by
) VALUES 
(
  'Diagnóstico de Falha na Retificação: Safe Code AMBEVASD5',
  'diagnostico-retificacao-ambevasd5',
  'Procedimento técnico para tratar falhas de contrato em retificações de meio período.',
  'Retificação',
  'Retificação',
  '{
    "symptom": "Erro Safe Code AMBEVASD5 ao tentar retificar ausência de meio período.",
    "cause": "Divergência de contrato entre o frontend e a RPC retificar_ausencia no banco de dados.",
    "solution": "A correção exige atualização do schema da tabela ausencia_retificacoes e sincronização da assinatura da RPC.",
    "escalation": "Se o erro 2F7F1193 persistir após a migração, escalar para o Super Admin."
  }',
  'ALL_AUTHORIZED',
  'PUBLISHED',
  1,
  '212717a0-68b4-46e9-8e9f-21dd21bdc637'
),
(
  'Manual de Governança: RBAC e RLS na Central de Suporte',
  'manual-governanca-rbac-rls',
  'Diretrizes de isolamento de dados para perfis consultivos e administrativos.',
  'Permissões',
  'Administração',
  '{
    "symptom": "Acesso negado a rotas de suporte por perfis de supervisão ou operação.",
    "cause": "Políticas de RLS restritivas ou falta de permissão na rota pai /suporte.",
    "solution": "Verificar se o perfil possui permissão na tabela user_roles e se a rota pai permite a role específica no beforeLoad.",
    "escalation": "Dúvidas sobre o Princípio de Menor Privilégio devem ser tratadas com Compliance."
  }',
  'ALL_AUTHORIZED',
  'PUBLISHED',
  1,
  '212717a0-68b4-46e9-8e9f-21dd21bdc637'
),
(
  'Guia de Idempotência: Ocorrência de Ponto',
  'guia-idempotencia-ocorrencia',
  'Como evitar duplicidade de registros em fluxos críticos de ponto.',
  'Ocorrência',
  'Ocorrência de Ponto',
  '{
    "symptom": "Lançamentos duplicados detectados no Centro de Inteligência de Incidentes.",
    "cause": "Falta de Correlation ID ou falha no índice único da tabela ocorrencias_ponto.",
    "solution": "Implementar strict idempotency via constraint de banco de dados e validação Zod no server function.",
    "escalation": "Incidentes de duplicidade confirmados devem ser vinculados ao protocolo P0-IDEMP."
  }',
  'ALL_AUTHORIZED',
  'PUBLISHED',
  1,
  '212717a0-68b4-46e9-8e9f-21dd21bdc637'
)
ON CONFLICT (slug) DO NOTHING;

GRANT SELECT ON public.support_knowledge_articles TO authenticated;
