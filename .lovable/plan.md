
## Diagnóstico

O envio nunca acontece porque **o worker nunca é acionado**. Toda a pipeline já está pronta e correta:

- ✅ Ao clicar "Reenviar", `reenviarBoasVindasWhatsapp` chama `materializar_whatsapp_usuario_boas_vindas`, que normaliza o telefone (SQL `normalizar_telefone_whatsapp` — valida E.164 e transforma `61983111405` em `+5561983111405`), calcula hash, escolhe template `USUARIO_CRIADO_V1`, gera `idempotency_key = usuario:<id>:boas_vindas:v1` e insere na `whatsapp_outbox` com `status=PENDENTE`.
- ✅ Existe rota `POST /api/public/hooks/process-whatsapp-outbox` com autenticação por `WHATSAPP_WORKER_SECRET`, reserva de lote, retry/backoff exponencial (30s→1h, max 5 tentativas), classificação temporária/definitiva, chamada à Evolution API e registro em `whatsapp_worker_execucoes`.
- ✅ `whatsapp_provider_config` está `enabled=true, modo=PRODUCAO`, com `EVOLUTION_BASE_URL/API_KEY/INSTANCE_NAME` presentes.
- ❌ **Nenhum `cron.schedule` aponta para essa rota** — `whatsapp_worker_execucoes` tem 0 linhas históricas. Registro do usuário está preso em `PENDENTE` desde 16:04 sem qualquer tentativa.
- ⚠️ Toast atual diz "enfileirado" (correto), mas o badge mostra "Pendente" em amber sem timestamp de última tentativa nem ação de reprocessar, e não há visão administrativa da falha.

## Escopo da correção

### 1. Disparar o worker (correção do bug real)

Migração criando dois `cron.schedule` com `net.http_post` para o endpoint público, usando `apikey` da anon key (padrão documentado):

- `whatsapp_outbox_worker_tick` — a cada 1 minuto, dispara o worker (envia `x-worker-secret` também para satisfazer a verificação da rota).
- `whatsapp_outbox_worker_recover` — a cada 5 minutos, redundância para recuperar itens presos.

Como `WHATSAPP_WORKER_SECRET` já existe, o header vai como literal na chamada (padrão `net.http_post`; o segredo já está no ambiente do worker, não é criado novo). Se o secret precisar ser lido a partir do banco, uso `current_setting` ou embuto o valor via `secrets--fetch_secrets` → `set_secret` numa `pg_settings` per-database (evito isso; prefiro passar direto no header do net.http_post).

### 2. Timeout operacional + estados adicionais

Sem alterar o enum `whatsapp_status` (que já tem `PENDENTE, PROCESSANDO, ENVIADO, FALHOU_TEMPORARIO, FALHOU_DEFINITIVO, CANCELADO`), derivo estados de apresentação no servidor:

- `NAO_ENVIADO` — sem registro na outbox.
- `PENDENTE` — na fila, < 5 min desde `created_at`.
- `ATRASADO` — `PENDENTE` há > 5 min (sinaliza worker não rodou).
- `PROCESSANDO`, `FALHOU_TEMPORARIO`, `FALHOU_DEFINITIVO`, `ENVIADO`, `CANCELADO` — vindos do enum.
- `NUMERO_INVALIDO` — quando `materializar_whatsapp_usuario_boas_vindas` retorna `motivo_invalido` (já emitido pela SQL, hoje só surge como erro genérico no toast). Passa a bloquear a criação da outbox e retorna código estruturado.

Não altero a lógica do worker; apenas leituras/derivações.

### 3. `listarStatusBoasVindas` — mais campos

Passa a expor: `tentativas`, `max_tentativas`, `proxima_tentativa_em`, `created_at`, `enviado_em`, `provider_message_id`, `ultimo_erro_codigo`, `ultimo_erro_resumido`, e um `status_derivado` calculado no servidor incluindo `ATRASADO`.

### 4. Server function nova: `reprocessarConviteWhatsapp`

- Restrita a Super Admin.
- Se a última outbox está em `FALHOU_DEFINITIVO/CANCELADO`: gera nova versão (bump `v1→v2` no `idempotency_key`) via `materializar_whatsapp_usuario_boas_vindas`, preservando linhas antigas para histórico.
- Se está em `PENDENTE/ATRASADO`: apenas reseta `proxima_tentativa_em=now(), locked_at=null` (não zera tentativas), disparando o worker imediatamente na próxima tick.
- Nunca sobrescreve linhas antigas nem apaga eventos.
- Registra em `audit_logs` com ação `WHATSAPP_CONVITE_REPROCESSADO`.

### 5. UI — `WhatsappStatusCell` e diálogo de detalhes

- Badge por estado real (cores distintas para `ATRASADO`, `FALHOU_TEMPORARIO`, `FALHOU_DEFINITIVO`, `NUMERO_INVALIDO`).
- Timestamp da última transição (`enviado_em ?? proxima_tentativa_em ?? created_at`).
- Botão "Ver detalhes" (Super Admin) abre `Dialog` com: status interno, tentativas/max, próxima tentativa, provider_message_id, código+mensagem sanitizada do último erro, telefone mascarado, template, criado em.
- Botão "Tentar novamente" (Super Admin) chama `reprocessarConviteWhatsapp`.
- Toasts:
  - Sucesso do enqueue → "Convite enfileirado para envio." (troca do texto atual).
  - Reprocessar sucesso → "Reprocessamento solicitado."
  - `NUMERO_INVALIDO` → "Telefone inválido para WhatsApp. Corrija o cadastro antes de reenviar."

### 6. Verificação pós-migração

- Confirmar `SELECT * FROM whatsapp_worker_execucoes ORDER BY inicio DESC LIMIT 5` mostra execuções após ~1 min.
- Confirmar linha `61983111405` transiciona `PENDENTE → PROCESSANDO → ENVIADO` com `provider_message_id` preenchido.
- Se Evolution retornar erro, ver `ultimo_erro_resumido` no diálogo administrativo.

## Fora de escopo

- Não altero RLS, RBAC, enum `whatsapp_status`, template `USUARIO_CRIADO_V1`, lógica interna do worker, normalização SQL, criptografia de telefone.
- Não crio novo secret; reuso `WHATSAPP_WORKER_SECRET` já existente.
- Não gravo senha temporária em log nem no payload (o template já usa `{{bloco_senha}}` só quando explicitamente passado pela materialização, e o fluxo de reenvio não repassa senha).
- Webhook de entrega/leitura (LIDA/ENTREGUE) fica como está — o backend já suporta, mas a implementação de webhook do provedor é uma etapa separada.

## Detalhes técnicos

**Arquivos editados**

- `supabase/migrations/<novo>.sql` — agenda dois `cron.schedule` chamando `net.http_post` com headers `apikey: <anon>` e `x-worker-secret: <valor>`; adiciona ação `WHATSAPP_CONVITE_REPROCESSADO` ao enum `audit_action`.
- `src/lib/usuarios.functions.ts` — enriquece `listarStatusBoasVindas` (colunas extras + `status_derivado`); trata `motivo_invalido` do `materializar_...` em `reenviarBoasVindasWhatsapp` retornando `NUMERO_INVALIDO`; nova server function `reprocessarConviteWhatsapp`.
- `src/routes/_authenticated/usuarios.tsx` — atualiza `WhatsappStatusCell` (badge por estado real + timestamp), adiciona botão "Ver detalhes" + `Dialog` administrativo, ação "Tentar novamente", ajusta toasts.

**Fluxo de estados**

```text
                ┌────────────────────────────────┐
click Reenviar  │ NUMERO_INVALIDO (erro imediato)│
     │          └────────────────────────────────┘
     ▼
[insert outbox] ──► PENDENTE ──►(cron 1min tick)──► PROCESSANDO ──► ENVIADO
                       │                                │
                       │(>5min sem tick)                ├──► FALHOU_TEMPORARIO ──(backoff)──► PROCESSANDO
                       ▼                                │
                    ATRASADO (UI-derived)               └──► FALHOU_DEFINITIVO (max_tentativas ou erro 4xx)
```

**Idempotência preservada**

- Reenvio comum: `usuario:<id>:boas_vindas:v1` (renomeia a linha antiga com sufixo `:reenviada:<ts>` — já implementado).
- Reprocessar após `FALHOU_DEFINITIVO`: nova versão `:v2`, `:v3`, ... para preservar histórico e permitir novo insert.
- Reprocessar `PENDENTE/ATRASADO`: só reseta `proxima_tentativa_em`/`locked_at`, sem novo insert (evita duplicação em clique duplo).
