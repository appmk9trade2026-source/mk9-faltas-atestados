# FASE 5 — Painel Administrativo do WhatsApp

Módulo somente-leitura para monitorar a mensageria. Nenhuma migration de estrutura existente será alterada; nenhum payload bruto, telefone completo, mensagem, CID ou documento será exposto.

## Arquitetura

- Rota pai: `src/routes/_authenticated/comunicacoes.whatsapp.tsx` (layout com subnav + `<Outlet />`).
- Sub-rotas (leaves):
  - `comunicacoes.whatsapp.index.tsx` → Dashboard
  - `comunicacoes.whatsapp.outbox.tsx` → Outbox
  - `comunicacoes.whatsapp.dead-letter.tsx` → Dead Letter
  - `comunicacoes.whatsapp.execucoes.tsx` → Execuções do Worker
  - `comunicacoes.whatsapp.health.tsx` → Health Check
  - `comunicacoes.whatsapp.configuracao.tsx` → Configuração (read-only)
- Timeline: Drawer (`Sheet`) reutilizado a partir da Outbox e Dead Letter, não uma rota.
- Item adicionado ao `app-sidebar` visível para `super_admin`, `compliance` e `rh`.

## Camada de dados (server functions, sem alterar workers/webhook)

Novo arquivo `src/lib/whatsapp-admin.functions.ts` com `createServerFn` + `requireSupabaseAuth`. Cada handler:
1. Verifica papel do usuário via `has_role` (bloqueia supervisor).
2. Se RH, restringe consultas às `empresa_id` autorizadas.
3. Executa leituras via `context.supabase` (RLS aplicada).
4. Máscara de telefone e sanitização de metadata acontecem no servidor antes de retornar.

Funções:
- `getWhatsappKpis(filters)` — agrega contagens e tempos médios (SQL `count(*) filter`, `avg(extract(epoch ...))`).
- `listOutbox({ filters, sort, page, pageSize })` — paginação server-side com `range()` + `count: 'exact'`.
- `getOutboxTimeline(outboxId)` — junta `whatsapp_outbox` + `whatsapp_outbox_eventos` ordenados por `created_at`.
- `listDeadLetter({ filters, page })` — mesmo shape do Outbox, filtro fixo `status = 'FALHOU_DEFINITIVO'`.
- `requeueDeadLetter(outboxId)` — restrito a `super_admin`; UPDATE `status='PENDENTE'`, `tentativas=0`, `proxima_tentativa_em=now()`; grava `audit_logs` e evento append-only `REENFILEIRADO_ADMIN`.
- `listWorkerExecucoes({ filters, page })` + `exportWorkerExecucoesCsv(filters)`.
- `getHealthCheck()` — computa: última execução < 5 min? provider habilitado? cron ativo? mensagens travadas (`PROCESSANDO > 10 min`)? Dead-letter últimas 24h? Retorna cores verde/amarelo/vermelho.
- `getProviderConfig()` — SELECT read-only mascarando `api_key`.
- `exportOutboxCsv(filters)` / `exportOutboxXlsx(filters)` — colunas seguras apenas; nunca telefone completo, mensagem, payload, CID.

Sanitização usa `src/lib/whatsapp-sanitize.ts` (novo, com `maskPhone`, `sanitizeMetadata` filtrando chaves proibidas — reaproveita padrão da Fase 4).

## Auditoria

Ações registradas em `audit_logs` via server function:
- `WHATSAPP_DEAD_LETTER_VISUALIZADA` (uma vez por sessão, debounced)
- `WHATSAPP_REENFILEIRADO`
- `WHATSAPP_EXPORT_OUTBOX`
- `WHATSAPP_EXPORT_EXECUCOES`

Novos valores adicionados ao enum `audit_action` em uma migration mínima e isolada (única mudança de schema).

## UI

- Componentes reutilizados: `Card`, `Table`, `Sheet`, `Badge`, `Skeleton`, `Select`, `Input`, `Popover` (date range), `Tabs` (subnav interna).
- Cards KPI com ícone, valor, delta opcional e cor semântica via tokens (`--primary`, `--destructive`, `--success` já existentes).
- Timeline vertical em `src/components/whatsapp/timeline.tsx` (ícones por evento, metadata em `<pre>` sanitizada).
- Badge de status em `src/components/whatsapp/status-badge.tsx` mapeando os 8 status.
- Empty states + Skeleton em cada tabela; auto-refresh opcional (Switch de 30s) no Dashboard e Health.
- Responsivo (grid `md:grid-cols-2 lg:grid-cols-4`); tabelas com scroll horizontal em mobile.
- Filtros persistidos como search params (`validateSearch` com Zod) — bookmarkable.

## Permissões / RLS

- Sidebar filtra o item para `super_admin | compliance | rh`.
- Cada server function chama `assertWhatsappAdminAccess(context, { requireSuperAdmin? })`.
- Para RH, aplica `IN (empresas_autorizadas)` derivado de `user_roles`/`profiles` (usa padrão já existente no projeto).
- Botão "Reenfileirar" só aparece para `super_admin` e handler valida novamente.

## Exportação

`xlsx` já é dependência do projeto. CSV gerado com `Blob`. Colunas seguras: status, datas, empresa, projeto, colaborador (nome + matrícula), template, telefone mascarado, tentativas, provider_message_id, worker_id.

## Testes

`tests/unit/whatsapp-sanitize.test.ts` — máscara de telefone, remoção de chaves sensíveis, precedência de status já testada na Fase 4 (não repetir).
`tests/unit/whatsapp-admin-permissions.test.ts` — helper `assertWhatsappAdminAccess` (super_admin ok, supervisor bloqueado, rh restrito a empresas).

## Arquivos criados

```text
src/routes/_authenticated/comunicacoes.whatsapp.tsx           (layout + subnav)
src/routes/_authenticated/comunicacoes.whatsapp.index.tsx     (Dashboard)
src/routes/_authenticated/comunicacoes.whatsapp.outbox.tsx
src/routes/_authenticated/comunicacoes.whatsapp.dead-letter.tsx
src/routes/_authenticated/comunicacoes.whatsapp.execucoes.tsx
src/routes/_authenticated/comunicacoes.whatsapp.health.tsx
src/routes/_authenticated/comunicacoes.whatsapp.configuracao.tsx
src/lib/whatsapp-admin.functions.ts
src/lib/whatsapp-sanitize.ts
src/components/whatsapp/status-badge.tsx
src/components/whatsapp/timeline.tsx
src/components/whatsapp/kpi-card.tsx
src/components/whatsapp/outbox-drawer.tsx
tests/unit/whatsapp-sanitize.test.ts
tests/unit/whatsapp-admin-permissions.test.ts
```

## Arquivos alterados

- `src/components/app-sidebar.tsx` — novo item de menu.
- Migration única: adicionar valores ao enum `audit_action` (`WHATSAPP_DEAD_LETTER_VISUALIZADA`, `WHATSAPP_REENFILEIRADO`, `WHATSAPP_EXPORT_OUTBOX`, `WHATSAPP_EXPORT_EXECUCOES`).

## Fora de escopo

Worker, webhook, integração Evolution, motor de notificações, alterações em qualquer tabela existente, criação de novas tabelas, edição/exclusão de mensagens.
