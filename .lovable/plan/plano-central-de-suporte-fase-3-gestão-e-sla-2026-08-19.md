# Plano: Central de Suporte - Fase 3 (Gestão e SLA)

Este plano descreve a implementação da Fase 3 da Central de Suporte, focada em transformar a ferramenta em um painel de gestão operacional com KPIs reais, controle de SLA e inteligência de recorrência.

## Etapas de Implementação

### 1. Infraestrutura de Dados e Backend
- **Migração SQL**: 
    - Adicionar colunas de SLA (`sla_priority`, `sla_status`, `sla_first_response_at`, `sla_resolution_at`, etc.) à tabela `support_tickets`.
    - Criar tabela `support_sla_config` para centralizar os tempos de resposta por prioridade.
    - Criar colunas para Resolução (`resolution_category`, `resolution_summary`, `resolved_at`).
    - Criar colunas para auditoria de Reabertura.
- **Server Functions**:
    - `getSupportStats`: Query agregada para alimentar o dashboard sem carregar dados pesados.
    - `getModuleMetrics`: Análise por módulo de origem (Fase 2).
    - `resolveTicket`: Ação para encerrar chamados com dados estruturados.
    - `reopenTicket`: Ação para reabrir chamados preservando o histórico.

### 2. Dashboard de Gestão (`/suporte/dashboard`)
- Criar nova rota protegida por RBAC (`super_admin` e `rh` autorizado).
- Implementar KPIs de topo: Abertos, Em Atendimento, Aguardando Usuário, Sem Responsável.
- Implementar métricas de tempo: Tempo Médio de Primeira Resposta e Resolução.
- Gráficos (Recharts): Volume por período, Chamados por Módulo, Principais Categorias.

### 3. Sistema de SLA e Fila Operacional
- Implementar lógica de cálculo de status de SLA (No Prazo, Atenção, Atrasado).
- Atualizar a UI da lista de chamados em `/suporte` para exibir indicadores visuais de SLA.
- Melhorar ordenação e filtros da fila (SLA vencido primeiro, prioridade).
- Implementar "Relógio de SLA" que pausa quando o status é `AGUARDANDO_USUARIO`.

### 4. Inteligência Operacional e Timeline
- Implementar detecção de recorrência simples por `safe_code` e `category`.
- Criar Timeline visual no detalhe do chamado baseada em eventos reais (`support_ticket_events`).
- Adicionar painel de "Informações para Suporte" com cópia rápida de Safe Code.

## Detalhes Técnicos

- **Segurança**: RLS estrito para garantir que RH veja apenas o escopo permitido.
- **Performance**: Uso de queries agregadas e paginação para o dashboard.
- **Design**: UI moderna e responsiva usando Tailwind v4 e componentes Shadcn.

## Guardrails
- Não alterar `src/routes/index.tsx`.
- Não usar dados mockados.
- Não flexibilizar RBAC/RLS.
- Preservar integridade dos módulos operacionais anteriores.
