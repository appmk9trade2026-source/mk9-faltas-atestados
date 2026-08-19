# Plano de Implementação — Central de Suporte Fase 2

Este plano detalha a implementação do Suporte Contextual "Preciso de Ajuda", conectando os fluxos operacionais (Nova Ausência, Retificação, Ocorrência, Processamento) à Central de Suporte MK9.

## 1. Arquitetura e Helper
Criar o helper e componente reutilizável para captura de contexto.

- **Arquivo:** `src/components/support/support-context-provider.tsx` (ou similar)
- **Helper:** `useSupport()` hook para gerenciar estado do diálogo e contexto.
- **Componente:** `SupportHelpButton` (Ícone + Texto discreto).

## 2. Refatoração do Diálogo de Ticket
Ajustar `NovoChamadoDialog` para suportar o preenchimento automático de contexto e exibição amigável.

- Exibir "Relacionado a: [Protocolo]" e "Módulo: [Nome]".
- Adicionar campo oculto para `entityId` e `sourceRoute`.
- Implementar proteção contra double-click (idempotência).

## 3. Integrações nos Fluxos
Integrar o botão "Preciso de ajuda" em locais estratégicos sem alterar a lógica de negócio.

- **Nova Ausência:** No cabeçalho e em toasts de erro.
- **Retificação:** No diálogo de retificação e toasts de erro (Safe Code automático).
- **Ocorrência de Ponto:** Na lista de ações e formulário.
- **Processamento Interno:** No painel lateral (Painel 360).

## 4. Auditoria e Chat
Atualizar a visualização do ticket para exibir o card de contexto para os atendentes.

- **Componente:** `TicketContextCard` na lateral da conversa.
- Botão "Ver registro relacionado" (respeitando RBAC original).

## Detalhes Técnicos
- **Safe Code:** Captura automática a partir de erros sanitizados (`parseRbacError`).
- **Segurança:** Allowlist de campos (Minimum Necessary Context).
- **Realtime:** Preservar infraestrutura da Fase 1.

## Guardrails
- Não alterar RPCs ou tabelas operacionais.
- Não capturar dados médicos (CID, etc).
- Não resetar baselines de estabilidade.

## Testes Obrigatórios
- SUPCTX-001 a SUPCTX-015 (conforme definido no protocolo).
- Build e Typecheck (`tsgo`).
