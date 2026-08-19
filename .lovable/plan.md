# Plano de Ação: Fase 5 — Copiloto Inteligente (Human-in-the-Loop)

Implementação do Copiloto de IA para suporte interno, focado em acelerar a triagem, diagnóstico e resolução de chamados, mantendo controle humano total sobre todas as ações operacionais.

## 1. Infraestrutura de IA e Backend
- Criar a server function `src/lib/ai-copilot.functions.ts` para interagir com o AI Gateway do Lovable.
- Implementar sanitização obrigatória de PII (CPF, dados clínicos) no servidor antes de enviar contexto para a IA.
- Adicionar suporte a Auditoria de IA na tabela `support_ticket_events`.
- Implementar Feature Flag `SUPPORT_AI_ENABLED` e o `AI_KILL_SWITCH` no backend.

## 2. Integração no Suporte (Drawer & UI)
- Adicionar aba "Copiloto MK9" ao `TicketDetailsDrawer`.
- Criar componentes de UI para as ações:
  - **Resumir Chamado:** Sumarização estruturada.
  - **Sugerir Diagnóstico:** Cruzamento de logs/Safe Codes com a Base de Conhecimento.
  - **Sugerir Resposta:** Gerar rascunho para o composer do chat.
  - **Preparar Escalonamento:** Relatório técnico para Nível 2.

## 3. Segurança e Governança
- Garantir que a IA tenha acesso somente a artigos PUBLISHED da Base de Conhecimento.
- Implementar lógica de Human-in-the-Loop: a IA preenche campos (composer, categoria), mas nunca envia ou salva sem clique do atendente.
- Proteção contra Prompt Injection: tratar mensagens de tickets como dados não confiáveis.
- Implementar indicadores de confiança (Confidence: HIGH/MEDIUM/LOW) baseados na evidência encontrada.

## 4. Auditoria e Feedback
- Registrar eventos específicos de IA (sugestão aceita, editada ou descartada).
- Adicionar botões de feedback [Útil/Não Útil] em cada sugestão da IA para melhoria contínua da documentação.

## Detalhes Técnicos
- **Modelagem:** Uso de `support_ticket_events` para logs de IA.
- **Contexto:** Envio minimizado de mensagens (recentes + metadados técnicos).
- **Abstenção:** Lógica de fallback para quando não houver documentação suficiente na Base de Conhecimento.
