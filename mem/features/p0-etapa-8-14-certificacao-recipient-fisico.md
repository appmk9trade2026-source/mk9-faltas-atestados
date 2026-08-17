---
name: p0-etapa-8-14-certificacao-recipient-fisico
description: Protocolo de substituição e certificação de recipient físico real pós-falha do TR-8-REAL-006.
type: feature
---
# ETAPA 8.14 — SUBSTITUIÇÃO E CERTIFICAÇÃO DE RECIPIENT FÍSICO REAL
PRÉ-REQUISITO PARA NOVO TESTE P0

## CONTEXTO

TR-8-REAL-006 foi executado em SANDBOX.

**Resultado:**
- Internal Pipeline = HOMOLOGADO
- Provider Acceptance = NÃO HOMOLOGADO
- HTTP = 400
- Safe Provider Result = exists:false
- Delivery = NOT_DELIVERED

Infrastructure P0 = CERTIFICADA
Canal externo = BLOQUEADO
Kill Switch = OFF
Production = OFF

**DECISÃO:**
1. NÃO reutilizar o recipient rejeitado em outro teste real.
2. NÃO executar TR-8-REAL-007 nesta etapa.

## OBJETIVO
Substituir o recipient técnico rejeitado por um número físico REAL, controlado pela equipe responsável pela homologação, com WhatsApp ativo confirmado diretamente no aparelho.

**Esta etapa NÃO possui envio real.**

---

## 1 — CONGELAR INFRAESTRUTURA
NÃO alterar:
- evolution-api.server.ts
- health-worker.server.ts
- Outbox
- Alert Engine
- Retry
- Backoff
- Idempotência
- normalização
- Health Engine
- RLS
- observabilidade.

A infraestrutura já está homologada. Não tentar corrigir código para resolver exists:false.

---

## 2 — CLASSIFICAR RECIPIENT REJEITADO
Localizar o recipient utilizado no TR-8-REAL-006.
Registrar administrativamente: **Provider Acceptance = REJECTED**.
Motivo seguro: **RECIPIENT_NOT_FOUND_BY_PROVIDER**.
Desativá-lo para NOVOS testes P0: **active = false**.
Preservar registro, audit trail e histórico. NÃO executar DELETE físico.

---

## 3 — NOVO RECIPIENT FÍSICO
Cadastrar um NOVO número exclusivamente técnico.
REQUISITOS:
- Controlado pela equipe responsável.
- Não pertencer a colaborador/promotor.
- Não utilizar telefone operacional obtido do CRM.
- Possuir WhatsApp ativo confirmado no aparelho.
- Autorizado explicitamente.

---

## 4 — VALIDAÇÃO HUMANA ANTES DO CADASTRO
Exigir confirmação administrativa explícita: "Este número possui WhatsApp ativo e o aparelho está disponível para receber a mensagem de homologação."
Registrar: `admin_verified = true`.

---

## 5 — NORMALIZAÇÃO
Validar o novo número pelo contrato já homologado (+55 XX XXXXX-XXXX -> 55XXXXXXXXXXX).
Resultado: **FORMAT_VALID = true**.

---

## 6 — ESTADOS DE CERTIFICAÇÃO
- **ADMIN_VERIFIED = true**
- **PROVIDER_VERIFIED = UNKNOWN**
- **DELIVERY_VERIFIED = false/UNKNOWN**

---

## 7 — PRE-FLIGHT (SERVER-SIDE)
Validar:
- Environment = SANDBOX
- Production = OFF
- P1 = OFF
- Kill Switch = OFF
- Novo Recipient (active=true, test_recipient=true, admin_verified=true)
- Recipient antigo (active=false)

---

## 8 — DRY RUN
Executar Dry Run.
Obrigatório: **Dry Run = PASSOU**, **Provider Calls = 0**.

---

## 9 — ZERO PROVIDER CALLS
ESTA ETAPA NÃO AUTORIZA ENVIO.
Confirmar: **Provider Sends = 0**.

---

## 10 — CRITÉRIO PARA PRÓXIMO TESTE
PRONTO PARA TR-8-REAL-007 = **SIM** quando todos os pré-requisitos técnicos e administrativos acima forem atendidos.

---

## RELATÓRIO FINAL OBRIGATÓRIO

**ETAPA 8.14 — CERTIFICAÇÃO DE RECIPIENT FÍSICO**

**RECIPIENT ANTERIOR**
- Recipient: *********2681
- TR-8-REAL-006: HTTP 400 / exists:false
- Active: NÃO
- Preservado para auditoria: SIM

**NOVO RECIPIENT**
- Recipient: [A definir/Cadastrar]
- Technical Recipient: SIM
- WhatsApp ativo confirmado no aparelho: SIM
- Active: SIM
- Admin Verified: SIM
- Provider Verified: UNKNOWN
- Format Valid: SIM
- Environment: SANDBOX

**PRE-FLIGHT**
- Resultado: READY
- Kill Switch: OFF
- Production: OFF

**DRY RUN**
- Resultado: PASSOU
- Provider Calls: 0

**SEGURANÇA**
- Provider Sends nesta etapa: 0
- Envio real realizado: NÃO

**RESULTADO**
- INFRAESTRUTURA P0: CERTIFICADA
- RECIPIENT ANTERIOR: RETIRADO
- NOVO RECIPIENT: CERTIFICADO
- PRONTO PARA TR-8-REAL-007: SIM
- GO-LIVE: NÃO AUTORIZADO
