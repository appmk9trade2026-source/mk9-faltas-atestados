# Plano de Ação - Qualidade de Lançamentos Fase 3: Retificação Controlada

Implementação de um fluxo seguro e auditável para retificação de ausências, permitindo correções operacionais sem perda de rastreabilidade, mantendo a integridade do protocolo original e integrando com o dashboard de qualidade.

## Alterações

### Backend & Banco de Dados

- **Migração SQL**: 
  - Atualizar a função RPC `public.retificar_ausencia` para incluir lógica de concorrência (verificação de `updated_at` ou similar) e garantir que o campo `registrado_por` da ausência original nunca seja alterado.
  - Garantir que a retificação registre se o motivo é um erro operacional do supervisor para alimentar a `taxa_acerto` na Fase 2.
  - Adicionar campos de justificativa e motivo estruturado se ainda não presentes na tabela `ausencia_retificacoes`.

### Server Functions

- **`src/lib/retificacao.functions.ts`**:
  - Atualizar `retificarSchema` para incluir novos campos de motivo estruturado e justificativa.
  - Hardening da função `retificarAusencia` para validar os novos parâmetros antes de chamar a RPC.

### Frontend & UI/UX

- **`src/components/ausencias/retificar-ausencia-dialog.tsx`**:
  - Implementar a Etapa 3-7: Exibir comparação "Antes → Depois".
  - Adicionar campos de "Motivo da Retificação" (estruturado) e "Justificativa" (texto livre).
  - Bloquear confirmação se nenhum dado foi alterado (Etapa 7).
  - Melhorar a hierarquia visual para mostrar dados imutáveis do protocolo no topo.
- **`src/routes/_authenticated/ausencias.tsx`**:
  - Atualizar o menu contextual para garantir que a ação "Retificar" respeite as permissões RBAC.
  - Adicionar o badge "RETIFICADO" na lista de ausências.
- **`src/routes/_authenticated/qualidade-lancamentos.tsx`**:
  - Adicionar badge "RETIFICADO" no Drawer de auditoria (Etapa 20).
  - Garantir que o KPI principal não duplique protocolos retificados (Etapa 11).

## Detalhes Técnicos

- **Concorrência**: A RPC `retificar_ausencia` usará o `updated_at` do registro original como lock otimista para evitar o problema de "Lost Update".
- **Auditoria**: Cada retificação gera uma entrada imutável em `ausencia_retificacoes` contendo o snapshot `before` e `after`.
- **Integridade**: O `protocolo` e o `registrado_por` (identidade do autor original) permanecem inalterados na tabela `ausencias`.

## Guardrails P0

- Não altera `src/routes/index.tsx`.
- Não altera `dashboard_metrics`.
- Não desabilita RLS.
- Preserva infraestrutura de WhatsApp e OCP AMBEV.
