# Pipeline oficial de WhatsApp (MK9)

> Estado: **PRODUÇÃO — validado com 2 mensagens entregues pela Evolution API**
> (provider_message_id persistido). Este documento é a fonte única de verdade
> operacional do pipeline. Alterações no fluxo abaixo exigem revisão desta página.

## Fluxo oficial

```
Lançamento elegível (categoria FALTA ou ATESTADO)
   → UPDATE status = 'LANCADO' na tabela ausencias
   → trigger tg_ausencia_whatsapp_materializar
   → materializar_whatsapp_ausencia(ausencia_id, supervisor_id)
   → INSERT em whatsapp_outbox (status = PENDENTE, proxima_tentativa_em = now())
   → pg_cron (a cada 1 minuto)
   → POST /api/public/hooks/process-whatsapp-outbox   (header apikey)
       → whatsapp_outbox_recuperar_travadas
       → whatsapp_outbox_reservar_lote (FOR UPDATE SKIP LOCKED + provider gate)
       → Evolution API  POST /message/sendText/{instance}
       → whatsapp_outbox_marcar_enviado (grava provider_message_id)
   → webhook /api/public/hooks/evolution-whatsapp-webhook
       → whatsapp_outbox status: ENVIADO → ENTREGUE → LIDA
   → whatsapp_worker_execucoes: métricas por execução
```

## Elegibilidade

- **Categorias:** `FALTA` e `ATESTADO` (via `tipos_ausencia.categoria_ausencia`).
- **Status disparador:** transição para `LANCADO`.
- **Destinatário:** **exclusivamente COLABORADOR**.
  RH e Supervisor **não** recebem mensagem nenhuma neste pipeline.

## Template

- Código: `AUSENCIA_LANCADA_COLABORADOR_V1`
- Variáveis permitidas: `primeiro_nome`, `data_registro`, `empresa`.
- Restrições de conteúdo (LGPD): **nunca** enviar CID, diagnóstico,
  observações internas, anexos ou texto médico. A allow-list do renderizador
  filtra qualquer variável fora dessa lista.

## Idempotência

- Chave: `ausencia:{id}:whatsapp:colaborador:v1`
- Constraint `UNIQUE (idempotency_key)` no `whatsapp_outbox` garante que uma
  segunda materialização retorna `JA_EXISTENTE` sem gerar segundo INSERT.
- `whatsapp_outbox_marcar_enviado` usa `COALESCE` no `provider_message_id`
  para preservar a primeira confirmação do provider.

## Regra da fila (anti-regressão)

- Mensagens **sempre** nascem com `proxima_tentativa_em = now()`.
- **Proibido** usar `'infinity'::timestamptz` como mecanismo de pausa.
  Isso é bloqueado no banco pela constraint
  `whatsapp_outbox_proxima_tentativa_finita_chk`.
- A decisão de enviar/não enviar é do **Worker**, com base em
  `whatsapp_provider_config.enabled` + `modo`.

## Provider

Configuração viva em `whatsapp_provider_config` (singleton):

| Campo                 | Fonte                                        |
| --------------------- | -------------------------------------------- |
| `enabled`             | Painel Admin (`whatsapp_provider_sync`)      |
| `modo`                | `DESATIVADO` / `HOMOLOGACAO` / `PRODUCAO`    |
| `instance_name`       | Painel Admin (deve bater com Evolution)      |
| `webhook_enabled`     | Painel Admin                                 |
| `base_url_public_label` | Rótulo público (nunca o segredo real)      |

Secrets (nunca expostos no frontend):
`EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`,
`EVOLUTION_WEBHOOK_SECRET`, `SUPABASE_PUBLISHABLE_KEY`.

## Lease e recuperação de PROCESSANDO órfão

- `whatsapp_outbox_reservar_lote` marca as linhas como `PROCESSANDO` com
  `worker_id` e `reservado_em` (lease).
- `whatsapp_outbox_recuperar_travadas` roda no início de cada execução do
  worker e devolve para `PENDENTE` qualquer linha `PROCESSANDO` que passou do
  timeout (`WORKER_TIMEOUT`).
- A recuperação **preserva** `provider_message_id`: se já houver
  confirmação do provider a mensagem é considerada entregue, nunca reenviada.

## Observabilidade

- `whatsapp_worker_execucoes` — 1 linha por execução do worker
  (`selecionadas`, `enviadas`, `falhas_temporarias`, `falhas_definitivas`,
  `ignoradas`, `recuperadas`, `inicio`, `fim`, `status`).
- `whatsapp_outbox_eventos` — timeline por mensagem
  (`MATERIALIZADO`, `ENVIO_INICIADO`, `ENVIADO`, `ENTREGUE`, `LIDA`,
  `FALHA_TEMPORARIA`, `FALHA_DEFINITIVA`, `RECUPERADO`).
- Correlation IDs: `ausencia.id` ↔ `outbox.id` ↔ `execucao.execution_id`
  ↔ `provider_message_id` ↔ eventos do webhook.

Nunca são registrados: API key, telefone completo, texto renderizado do
template, CID, diagnóstico, anexos, JWT do usuário.

## Painel administrativo

Rotas em `src/routes/_authenticated/comunicacoes.whatsapp.*.tsx`:

- `configuracao` — estado do provider, teste de conexão, sync com secrets.
- `outbox` — fila e filtros por status/publico/categoria.
- `execucoes` — histórico do worker com KPIs.
- `dead-letter` — mensagens em `FALHOU_DEFINITIVO`.
- `health` — verde/amarelo/vermelho por sinal:
  cron parado > 3 min, PENDENTE elegível > 5 min, fila crescendo,
  PROCESSANDO preso, DEAD_LETTER aumentando.

## Rótulos de status (UI)

| Status DB              | Rótulo UI              |
| ---------------------- | ---------------------- |
| `PENDENTE`             | Aguardando envio       |
| `PROCESSANDO`          | Processando            |
| `ENVIADO`              | Enviado                |
| `ENTREGUE`             | Entregue               |
| `LIDA`                 | Lido                   |
| `FALHOU_TEMPORARIO`    | Tentando novamente     |
| `FALHOU_DEFINITIVO`    | Falha / Dead Letter    |
| `CANCELADO`            | Cancelado              |

Toast de lançamento: **“Lançamento concluído. WhatsApp colocado na fila
para o colaborador.”** — nunca dizer "enviado" antes da resposta do provider.

## Proibições

- Não adicionar Supervisor/RH como destinatário deste pipeline.
- Não usar `service_role` no frontend.
- Não enviar direto pelo frontend (sempre via outbox + worker).
- Não usar `infinity` como pausa.
- Não expor secrets no cliente.
- Não reprocessar mensagens com `provider_message_id` preenchido.
- Não alterar o template sem necessidade funcional.
