# Plano de Implementação: Central de Suporte Interno (Fase 1)

Este plano detalha a criação da Central de Suporte Interno no CRM MK9, permitindo a abertura de chamados, chat em tempo real e anexos privados, sem afetar fluxos homologados.

## 1. Estrutura de Dados (Banco de Dados)

Implementar as tabelas no esquema `public` com RLS e concessões de acesso.

- **Tabelas:**
    - `support_tickets`: Cadastro principal do chamado (protocolo, status, categoria, prioridade, contexto).
    - `support_messages`: Mensagens do chat.
    - `support_attachments`: Metadados de arquivos anexados.
    - `support_ticket_events`: Log de auditoria de todas as mudanças no ticket.
- **Protocolo:** Gerado via RPC no banco: `SUP-YYYYMMDD-XXXXXX`.
- **RBAC:**
    - `Super Admin`: Acesso total.
    - `RH`: Abre chamados e atende categorias específicas.
- **RLS:** Isolamento por `requester_user_id` e permissões de atendimento.

## 2. Backend e Lógica de Negócio

- **Server Functions (`src/lib/support.functions.ts`):**
    - `createTicket`: Criação com validação Zod e geração de protocolo.
    - `getTickets`: Listagem filtrada por perfil e contexto.
    - `sendMessage`: Envio de mensagens com suporte a realtime.
    - `assignTicket`: Lógica de "Assumir chamado" com prevenção de concorrência.
- **Realtime:** Configuração de subscrição Supabase para `support_messages` e `support_tickets`.
- **Storage:** Bucket `support_private` (não público) com RLS para download restrito.

## 3. Interface e UX

- **Nova Rota:** `/suporte` (Protegida).
- **Componentes:**
    - `SupportDashboard`: Lista de chamados com filtros e busca.
    - `NewTicketDialog`: Formulário de abertura com captura de contexto operacional.
    - `SupportChat`: Interface de mensagens com histórico, anexos e indicadores de leitura.
- **Design:** Manter o padrão visual do CRM MK9 (Tailwind + Shadcn).
- **Contexto Operacional:** Helper `openSupportTicket(context)` para integração futura.

## Detalhes Técnicos
- Utilizar `createServerFn` para todas as mutações.
- Garantir `idempotency` nas mutações críticas através de `correlation_id` quando aplicável.
- Sanitização rigorosa de mensagens para evitar XSS (HTML Guard).
- Auditoria total (Audit Trail) para cada alteração de status ou atribuição.

## Etapas de Verificação
- `SUP-001` a `SUP-015`: Testes de criação, persistência, realtime e segurança.
- `tsc --noEmit` e `build` de produção para garantir integridade.
- Relatório de Entrega Obrigatório ao final da etapa.
