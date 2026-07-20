# Histórico, Alertas e Relatórios — plano de entrega

O escopo é grande. Para não bloquear tudo em uma única entrega gigante (e para você poder validar cada onda antes da próxima), proponho **4 ondas incrementais**. Cada onda termina com telas reais no ar, RLS validada e testes verdes — nada de placeholder novo.

## Ondas

### Onda 1 — Fundações compartilhadas
- Mapear as rotas atuais marcadas como "Em breve" (`/historico`, `/alertas`, `/relatorios` e afins) e o menu que as lista.
- Criar módulos utilitários compartilhados: mascaramento de PII (telefone, CID, tokens), helpers de exportação CSV/XLSX com cabeçalho de filtros/usuário/data, hooks de filtros persistidos em URL (`validateSearch` + `fallback`).
- Server fns `historico.*.functions.ts` com paginação por cursor sobre `audit_logs` unificando também `whatsapp_outbox_eventos` e `whatsapp_worker_execucoes` via `UNION ALL` server-side.
- RLS: manter as policies existentes de `audit_logs`; adicionar `has_role`-gate no server fn para colunas sensíveis.

### Onda 2 — Histórico
- Rota `/_authenticated/historico` (central) com timeline + tabela alternável, filtros por período/empresa/projeto/colaborador/protocolo/tipo/status/módulo/evento/usuário/origem, busca com debounce.
- Todos os filtros na URL (compartilháveis).
- Drawer de detalhe do evento com diff antes/depois, correlation_id, status WhatsApp — mascarando CID/telefone/tokens conforme perfil.
- Aba **Histórico** na tela de detalhe da ausência (filtro por `entidade_id`).
- Auditoria: `HISTORICO_VISUALIZADO` disparado no server fn.
- Testes: escopo por perfil, filtro por protocolo, timeline de ausência, redação de dados sensíveis.

### Onda 3 — Alertas
- Migração criando:
  - `alertas` (regra, severidade, status, entidade, chave idempotente única, prazos, responsável);
  - `alertas_eventos` (auditoria interna do alerta);
  - função `gerar_alertas_do_sistema()` idempotente com `ON CONFLICT (chave_idempotente)`;
  - agendamento via `pg_cron` a cada 1 min chamando um route público `/api/public/hooks/gerar-alertas` protegido por HMAC.
- Regras iniciais implementadas:
  1. Projeto ativo sem `codigo_protocolo`.
  2. Ausência PENDENTE acima do prazo configurável.
  3. WhatsApp PENDENTE > 5 min.
  4. Worker sem execução > 3 min (CRÍTICO).
  5. Mensagem em DEAD_LETTER.
  6. Colaborador sem telefone válido para WhatsApp.
  7. Falha repetida do provider (>= N em janela).
  As demais (documento próximo do vencimento, sequência de faltas, volume anormal, projeto sem supervisor) ficam com hook pronto mas desativadas até haver limiar configurado — para não acionar sem dados suficientes.
- Cada alerta com ação contextual (deep link para edição do projeto, WhatsApp Admin filtrado, detalhe da ausência, cadastro do colaborador, dead letter).
- Fluxos: marcar lido, assumir, resolver, dispensar (com justificativa), reabrir. Auditoria completa por servidor.
- Rota `/_authenticated/alertas` com filtros + badge de "novos/críticos" no menu (via query leve).
- Testes: idempotência, geração das 4 regras principais, supervisor só vê o próprio escopo, visualizador não resolve.

### Onda 4 — Relatórios + Exportação
- Server fns agregadas (RPCs SQL quando faz sentido) para:
  - **Ausências**: KPIs, série temporal, distribuição por tipo/empresa/projeto/colaborador, tabela paginada.
  - **Projetos**: por projeto — colaboradores, faltas, atestados, dias, % colaboradores com ocorrência, taxa entrega WhatsApp, alertas em aberto, com drill-down.
  - **Colaboradores**: matrícula, empresa, projeto, faltas, atestados, dias, última ocorrência, pendentes, protocolo mais recente (sem CID/diagnóstico/observações).
  - **WhatsApp**: enfileirado/enviado/entregue/lido/retry/falha/dead-letter, taxa entrega, tempo médio lançamento→envio e envio→entrega, falhas por motivo sanitizado, por projeto/template/versão/provider.
- 4 rotas em `/_authenticated/relatorios.*` com filtros na URL, KPIs, gráficos (Recharts, mesmos usados no dashboard), tabela ordenável/paginada.
- Exportação CSV e XLSX apenas do recorte filtrado, com cabeçalho de metadados (filtros aplicados, usuário, data/hora, escopo). Auditoria `RELATORIO_VISUALIZADO` / `RELATORIO_EXPORTADO`.
- Gate de exportação por perfil no server fn (não só na UI).
- Testes: filtros respeitados, RLS, colaborador sem CID, taxa de entrega correta, CSV/XLSX bem-formados.

### Encerramento
- Remover o rótulo "Em breve" no menu somente após cada rota entrar no ar (por onda).
- Rodar `bunx vitest run`, typecheck (`tsgo`) e build; reportar riscos remanescentes.

## Detalhes técnicos

- Rotas TanStack em `src/routes/_authenticated/`:
  - `historico.tsx`, `historico.$eventoId.tsx` (drawer via search param `?evento=`).
  - `alertas.tsx`, `alertas.$alertaId.tsx`.
  - `relatorios.tsx` (layout com `<Outlet />`), `relatorios.ausencias.tsx`, `relatorios.projetos.tsx`, `relatorios.colaboradores.tsx`, `relatorios.whatsapp.tsx`.
- Server fns em `src/lib/`:
  - `historico.functions.ts`, `alertas.functions.ts`, `relatorios.*.functions.ts`, `exportacoes.functions.ts`.
  - Todas com `.middleware([requireSupabaseAuth])`; leitura via `context.supabase` respeitando RLS. Onde precisar unir eventos, usar `context.supabase.rpc(...)` chamando SQL functions criadas via migração.
- Filtros na URL via `validateSearch` + `fallback` (nunca `.min/.max/.enum` no schema; sanitizar no componente).
- Data loading: loader chama `ensureQueryData`; componente usa `useSuspenseQuery`.
- Máscara de PII em util único `src/lib/pii.ts` (telefone `+55 (11) *****-1234`, CID → `[oculto]` salvo para perfis autorizados).
- Idempotência dos alertas: coluna `chave_idempotente text unique` com `alerta:{regra}:{entidade_id}:{contexto}`.
- Cron: `pg_cron` chamando route público com HMAC; nada de expor service role no cliente.
- Exportação XLSX: usar `xlsx` já presente. Grandes volumes usam job assíncrono (tabela `exportacoes_jobs`) com status/url/expiração — nesta primeira entrega, síncrono até 10k linhas, assíncrono acima.
- Todas as migrações seguem o padrão CREATE TABLE → GRANT → ENABLE RLS → POLICIES (com `service_role` incluído; `authenticated` conforme o caso; `anon` nunca).
- Sem novos edge functions Supabase; tudo em `createServerFn` / server routes TanStack.
- Sem PDF nesta fase.

## Riscos / trade-offs

- Volume de `audit_logs`: paginação por cursor + índice em `(criado_em desc, id)` — se faltar índice, criar na migração da Onda 2.
- Regras de alerta podem gerar ruído inicial; mantê-las com limiares em `notificacao_tipos_config` (ou nova `alertas_regras_config`) para você ajustar sem deploy.
- Perfil "Operação"/"Visualizador" ainda não têm todas as policies granulares hoje — a Onda 3/4 vai depender de conferir e, se necessário, adicionar `has_role` explícito no server side.
- Cron novo (`gerar-alertas`) precisa do secret HMAC (`ALERTAS_CRON_SECRET`) — vou usar `generate_secret` no início da Onda 3.

## Ordem sugerida de execução

1. Aprovar este plano.
2. Executo **Onda 1** (fundações + rota Histórico esqueleto server-side pronta) e paro para você revisar.
3. Onda 2 (Histórico completo + aba na ausência).
4. Onda 3 (Alertas com 4 regras + cron).
5. Onda 4 (Relatórios + exportação) — fecha o escopo.

Se preferir outra ordem (por exemplo, priorizar Relatórios antes de Alertas) ou juntar ondas, me diga antes de eu começar a Onda 1.
