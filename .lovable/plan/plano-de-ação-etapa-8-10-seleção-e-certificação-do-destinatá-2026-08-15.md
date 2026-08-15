# Plano de Ação — Etapa 8.10: Seleção e Certificação do Destinatário Técnico

Este plano estabelece o protocolo para cadastrar e certificar um novo destinatário estritamente técnico para o TR-8-REAL-005, com base na confirmação externa de conta WhatsApp ativa, mantendo a infraestrutura P0 intacta.

## Objetivos
- Selecionar um destinatário técnico independente (sem vínculo com matrículas operacionais).
- Exigir confirmação externa (WhatsApp ativo) devido à ausência de endpoint de check na Evolution v2.3.7.
- Realizar a certificação administrativa (Admin Verification) com auditoria completa.
- Executar Pre-flight e Dry Run para validar a prontidão para o TR-8-REAL-005 (sem disparos reais).

## Etapas de Execução

### 1. Governança e Segurança
- Confirmar `Environment = SANDBOX` e `Kill Switch = OFF`.
- **Proibição**: Provedor Send Calls = 0. Não executar TR-8-REAL-005 nesta etapa.

### 2. Cadastro e Certificação do Recipient
- Desativar o destinatário anterior (`eligible_for_test = false`) se aplicável.
- Cadastrar o novo destinatário técnico via script/função administrativa.
- Executar `adminVerifyRecipient` com justificativa técnica: "WhatsApp confirmado externamente pelo Super Admin para homologação do canal Evolution v2.3.7".
- Registrar `trace_id` e `verification_method = ADMIN_MANUAL`.

### 3. Validação de Prontidão (Pre-flight)
- Executar `validateNotificationGoLive` e confirmar estado `READY`.
- Verificar se o novo recipient está marcado como `is_test_recipient = true` e `admin_verified = true`.

### 4. Simulação Técnica (Dry Run)
- Executar o Worker em modo `dryRun = true`.
- Auditar logs e `operational_notification_outbox` para garantir:
  - Destinatário correto e normalizado (apenas dígitos).
  - Payload sanitizado (PII Guardrail).
  - Idempotency key gerada corretamente.

### 5. Gestão de Memória
- Atualizar `mem://index.md` com a nova feature memory: `p0-etapa-8-10-certificacao-recipient.md`.
- Criar `mem://features/p0-etapa-8-10-certificacao-recipient.md` com o relatório final da certificação.

## Detalhes Técnicos
- **Script de Preparação**: `/tmp/browser/prepare_recipient_tr5.ts`.
- **PII Guardrail**: Confirmar que nenhum dado sensível (Nome, CPF, Projeto) vaza para o log ou payload.
- **Fail-Closed**: Manter o bloqueio se qualquer parâmetro de segurança for violado.

## Verificação
- O sucesso é atingido quando o sistema reporta `PRONTO PARA TR-8-REAL-005 = SIM` no relatório forense, sem ter realizado nenhuma chamada de envio ao provedor.
