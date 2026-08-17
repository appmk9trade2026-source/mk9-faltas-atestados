# Plano de Execução Autorizada — TR-8-REAL-006

Este plano detalha a execução do sexto teste real (TR-8-REAL-006) em ambiente de Sandbox, seguindo a autorização explícita para homologação de aceitação do provedor e entrega.

## User Review Required

> [!IMPORTANT]
> A execução do TR-8-REAL-006 está autorizada apenas sob as condições estritas listadas abaixo. A infraestrutura de P0 de Nova Ausência está congelada e não deve ser alterada durante este processo.

## Proposed Changes

### 1. Documentação da Autorização
- Registro do protocolo de autorização na memória do projeto (`mem://features/p0-etapa-8-13-homologacao-tr6.md`).
- Atualização do índice de memórias para incluir a Etapa 8.13.

### 2. Preparação Técnica (Pre-flight)
- Validação server-side do ambiente (SANDBOX = ON, PRODUCTION = OFF, P1 = OFF, Kill Switch = OFF).
- Verificação do estado da instância Evolution (`open`).
- Confirmação do destinatário técnico certificado (`*********2681`).

### 3. Dry Run Final
- Execução de um ciclo de processamento simulado (Dry Run) para validar normalização, payload e PII Guardrail.
- Verificação de Provider Calls = 0.

### 4. Execução do TR-8-REAL-006
- Criação de ciclo isolado (Incident ID, Alert ID, Outbox ID exclusivo).
- Habilitação temporária do Kill Switch para permitir o envio real único.
- Captura sanitizada da resposta do provedor (HTTP Status, Safe Provider Code).
- Restauração imediata de Kill Switch = OFF.

### 5. Auditoria e Homologação
- Avaliação dos 4 níveis de homologação: Internal Pipeline, Provider Acceptance, Delivery e Human Confirmation.
- Geração do relatório final obrigatório.

## Technical Details

- **Environment**: SANDBOX
- **Recipient ID**: `e0e56aca-be8c-45dd-9908-31d1e22114ef` (Matrícula 2504)
- **PII Guardrail**: Ativo (Redação de dados sensíveis em logs e mensagens)
- **Fail-Closed**: Garantia de interrupção em qualquer erro sem retry automático.

## Verificação
- O sucesso será confirmado pela aceitação inequívoca do provedor (HTTP 2xx + Provider Accepted = true) e evidência técnica de entrega, seguida pela desativação imediata da janela de execução.
