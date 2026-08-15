# Plano de Ação — Etapa 8.11: TR-8-REAL-005

Este plano estabelece o protocolo de autorização e execução do quinto teste real (TR-8-REAL-005) em ambiente de SANDBOX, focado na homologação final do canal de notificações P0.

## Objetivos
- Comprovar o fluxo completo: Incident → Alert → Outbox → Worker → Evolution API → Aceite do Provedor.
- Validar a entrega e confirmação humana no novo destinatário técnico certificado.
- Garantir o isolamento absoluto de dados PII (PII Guardrail) e a eficácia do Kill Switch.

## Etapas de Execução

### 1. Gate Pré-Execução e Dry Run
- **Confirmação**: Environment = SANDBOX, Kill Switch = OFF, Recipient = técnico certificado (admin_verified).
- **Dry Run**: Executar Worker em modo dry run para validar payload, normalização e idempotência sem disparos reais.
- **Autorização**: Se Dry Run = PASSOU e Pre-flight = READY, prosseguir para o Test Run.

### 2. Execução do TR-8-REAL-005
- **Gatilho**: Habilitar temporariamente o Kill Switch com justificativa auditável.
- **Processamento**: Processar exclusivamente o Outbox lógico vinculado ao TR-8-REAL-005.
- **Isolamento**: Proibido processar qualquer outro item pendente (P1 ou P0 antigos).

### 3. Monitoramento e Homologação
- **Aceite**: Capturar `provider_message_id` e HTTP 2xx como evidência de homologação do provedor.
- **Entrega**: Registrar entrega e confirmação humana conforme evidência técnica e física.
- **Finalização**: Restaurar Kill Switch = OFF imediatamente após a tentativa.

### 4. Relatório e Governança
- **Auditoria**: Gerar relatório forense detalhado (PRÉ-TESTE, TEST RUN, PROVIDER, SEGURANÇA, PÓS-TESTE).
- **Memória**: Atualizar `mem://index.md` e criar `mem://features/p0-etapa-8-11-homologacao-tr5.md`.

## Detalhes Técnicos
- **Recipient ID**: Usar identificador técnico canônico (mascarado: *********2681).
- **Sanitização**: Mensagem estritamente técnica "[TESTE DE SISTEMA — NÃO É INCIDENTE REAL]".
- **Fail-Closed**: Bloqueio total se houver regressão ou violação de parâmetros de segurança.

## Verificação Final
- O sucesso é definido pelo Aceite do Provedor (Nível 2) e, idealmente, pela Confirmação Humana (Nível 4).
- **Importante**: Sucesso neste teste NÃO autoriza Production; o Go-Live P0 requer autorização separada.
