# Plano de Ação: Fase 4 — Base de Conhecimento Operacional

Implementação de uma Base de Conhecimento (KB) estruturada para a Central de Suporte, permitindo a transformação de soluções de chamados em artigos pesquisáveis, com governança de revisão e métricas de lacunas de conhecimento.

## 1. Infraestrutura de Dados (Modelagem)

- Criar tipos enumerados para `support_article_status` e `support_article_audience`.
- Criar tabela `support_knowledge_articles` para armazenar o conteúdo, metadados e versionamento.
- Criar tabela `support_article_feedback` para métricas de utilidade.
- Criar tabela `support_article_links` para relacionamentos com tickets e Safe Codes.
- Implementar políticas de RLS e permissões por perfil (Super Admin, RH).

## 2. Backend e Lógica de Negócio

- Desenvolver Server Functions em `src/lib/knowledge.functions.ts`:
  - `getArticles`: Busca com filtros e paginação.
  - `getArticleById`: Detalhes com histórico.
  - `upsertArticle`: Criação e atualização com controle de versão.
  - `publishArticle`: Fluxo de revisão e publicação.
  - `createArticleFromTicket`: Helper para extração segura de dados de um chamado resolvido.
  - `submitFeedback`: Registro de utilidade.
  - `getKnowledgeMetrics`: KPIs para o dashboard (lacunas, mais usados).

## 3. Interface do Usuário (UX/Design)

- **Nova Rota `/suporte/conhecimento`**:
  - Painel principal com busca global e filtros laterais por categoria/módulo.
  - Lista de artigos com badges de status e audiência.
- **Visualização do Artigo**:
  - Layout limpo seguindo a estrutura padrão (Sintoma, Causa, Solução).
  - Componente de feedback rápido ("Ajudou?").
- **Integração com Suporte**:
  - Ação no `TicketDetailsDrawer` para converter chamado resolvido em artigo.
  - Seção de "Artigos Relacionados" no Drawer baseada em contexto técnico.
- **Dashboard**:
  - Adicionar cards de métricas de documentação.

## Detalhes Técnicos

- **Segurança Forense**: Implementar filtros de limpeza para garantir que dados sensíveis (PII) não sejam migrados de tickets para artigos.
- **Versionamento**: O campo `version` será incrementado a cada publicação oficial.
- **Performance**: Utilizar busca via Postgres `tsvector` ou filtros determinísticos server-side.

## Guardrails

- Não alterar a rota de redirecionamento `src/routes/index.tsx`.
- Preservar integridade dos módulos operacionais e baselines de estabilidade.
- RLS rigoroso para garantir que Drafts não sejam visíveis para perfis não autorizados.
