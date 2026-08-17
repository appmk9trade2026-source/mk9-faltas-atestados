---
name: p0-etapa-8-13-homologacao-tr6
description: Protocolo de execução autorizada do TR-8-REAL-006 para homologação real de Provider Acceptance e Delivery em Sandbox.
type: feature
---
# ETAPA 8.13 — EXECUÇÃO AUTORIZADA DO TR-8-REAL-006
HOMOLOGAÇÃO REAL DE PROVIDER ACCEPTANCE E DELIVERY — SANDBOX

## AUTORIZAÇÃO EXPLÍCITA

Está AUTORIZADA a execução de EXATAMENTE UM teste real:

**TR-8-REAL-006**

Esta autorização é válida exclusivamente para:

- ambiente SANDBOX;
- recipient técnico certificado na Etapa 8.12;
- uma única Outbox lógica;
- no máximo uma chamada real de envio ao provedor;
- finalidade exclusiva de homologação P0.

NÃO está autorizado:

- PRODUCTION;
- P1 externo;
- segundo disparo;
- retry manual;
- TR-8-REAL-007;
- troca automática de recipient;
- alteração automática de Adapter ou Worker;
- processamento de backlog.

==================================================
ESTADO HOMOLOGADO DE ENTRADA
==================================================

Etapa 8.12:
HOMOLOGADA

Recipient técnico:
5511984242681

Exibir em relatórios/UI somente mascarado:
*********2681

Technical Recipient:
SIM

Active:
SIM

Admin Verified:
SIM

Provider Verified:
UNKNOWN

Environment:
SANDBOX

Pre-flight anterior:
READY

Dry Run anterior:
PASSOU

Provider Calls no Dry Run:
0

Kill Switch:
OFF

Production:
OFF

P1:
OFF

Internal Pipeline:
HOMOLOGADO

IMPORTANTE:

O recipient já apresentou anteriormente:

HTTP 400
exists: false

Portanto:

NÃO assumir que a certificação administrativa comprova existência no WhatsApp.

O objetivo deste teste é obter evidência REAL do provedor.

==================================================
ETAPA 1 — CONGELAR INFRAESTRUTURA
==================================================

Antes da execução:

NÃO alterar código.

NÃO alterar:

- evolution-api.server.ts;
- health-worker.server.ts;
- Outbox;
- Alert Engine;
- Retry;
- Backoff;
- Idempotência;
- Normalização;
- Recipient;
- Health Engine;
- RLS;
- infraestrutura de observabilidade.

NÃO tentar "corrigir" preventivamente o HTTP 400 anterior.

Primeiro testar exatamente a infraestrutura homologada.

==================================================
ETAPA 2 — PRE-FLIGHT SERVER-SIDE
==================================================

Imediatamente antes do envio, validar SERVER-SIDE:

Environment = SANDBOX
Production = OFF
P1 externo = OFF
Kill Switch = OFF

Evolution Instance:
coordenadormk9

Instance State:
open

Recipient:
*********2681

Technical Recipient:
true

Active:
true

Admin Verified:
true

Provider Verified:
UNKNOWN

Validar também:

- configuração do provider disponível;
- instance configurada;
- recipient associado ao SANDBOX;
- normalização disponível;
- Outbox operacional;
- Worker operacional;
- PII Guardrail ativo.

Resultado obrigatório:

PRE-FLIGHT = READY

Se qualquer condição divergir:

ABORTAR TR-8-REAL-006.

Não realizar provider call.

==================================================
ETAPA 3 — DRY RUN FINAL
==================================================

Executar um Dry Run imediatamente antes do teste real.

Validar:

- recipient correto;
- normalização correta;
- payload correto;
- mensagem sanitizada;
- environment SANDBOX;
- idempotency contract;
- PII Guardrail.

Resultado esperado:

DRY RUN = PASSOU
PROVIDER CALLS = 0

Se Provider Calls > 0:

ABORTAR.

==================================================
ETAPA 4 — CRIAR CICLO ISOLADO
==================================================

Criar ciclo exclusivo para:

TR-8-REAL-006

Gerar/correlacionar:

- Incident ID;
- Alert ID;
- Outbox ID;
- Attempt ID;
- Trace ID;
- Idempotency Key.

Não reutilizar Outbox FAILED de:

TR-8-REAL-001
TR-8-REAL-002
TR-8-REAL-003
TR-8-REAL-004
TR-8-REAL-005

Garantir antes do processamento:

Logical Outboxes para TR-8-REAL-006 = 1

==================================================
ETAPA 5 — MENSAGEM DE TESTE
==================================================

A mensagem deve começar explicitamente com:

[TESTE DE SISTEMA — NÃO É INCIDENTE REAL]

Utilizar somente metadados técnicos mínimos necessários.

NÃO incluir:

- nome de colaborador;
- matrícula;
- CPF;
- nome de Supervisor;
- projeto operacional;
- ausência;
- atestado;
- CID;
- dados clínicos;
- documentos;
- telefone de colaborador;
- tokens;
- cookies;
- secrets;
- informações pessoais desnecessárias.

==================================================
ETAPA 6 — HABILITAÇÃO CONTROLADA
==================================================

Somente depois de:

PRE-FLIGHT = READY

e

DRY RUN = PASSOU

habilitar temporariamente o mecanismo necessário para permitir o processamento.

Kill Switch:

OFF
→ ON apenas durante a janela mínima necessária
→ OFF imediatamente após a tentativa.

Não deixar o Kill Switch ON aguardando processamento futuro.

==================================================
ETAPA 7 — EXECUTAR TR-8-REAL-006
==================================================

Processar EXCLUSIVAMENTE:

TR-8-REAL-006

Limites absolutos:

Logical Outboxes = 1
Provider Sends <= 1
Attempts reais <= 1

NÃO processar:

- backlog;
- PENDING antigos;
- RETRY antigos;
- FAILED antigos;
- P1;
- outros incidentes P0;
- qualquer outro Test Run.

==================================================
ETAPA 8 — CAPTURAR RESPOSTA REAL DO PROVIDER
==================================================

Registrar de forma sanitizada:

HTTP Status

Safe Provider Code

Provider Accepted

Provider Message ID

Attempt Count

Outbox Status

Response classification

Não expor resposta bruta contendo informações sensíveis.

==================================================
ETAPA 9 — CRITÉRIO DE PROVIDER ACCEPTANCE
==================================================

Provider Acceptance somente pode ser:

HOMOLOGADO

quando houver evidência positiva e inequívoca de aceitação.

Preferencialmente:

HTTP 2xx
+
Provider Accepted = true
+
Provider Message ID válido

Não considerar apenas HTTP 2xx suficiente caso o corpo indique rejeição.

Se retornar novamente:

HTTP 400
exists: false

classificar:

PROVIDER ACCEPTANCE = NÃO HOMOLOGADO

e PARAR.

NÃO reenviar.

NÃO trocar recipient.

NÃO corrigir código automaticamente.

==================================================
ETAPA 10 — DELIVERY
==================================================

Separar aceitação de entrega.

Provider Accepted:
não significa automaticamente Delivered.

Classificar Delivery somente com evidência confiável disponível na infraestrutura.

Valores permitidos:

DELIVERED
NOT_DELIVERED
UNKNOWN

Se não houver confirmação técnica confiável:

Delivery = UNKNOWN

ou

NÃO COMPROVADA

NÃO inventar confirmação.

==================================================
ETAPA 11 — CONFIRMAÇÃO HUMANA
==================================================

Se a mensagem efetivamente chegar ao aparelho técnico:

registrar confirmação somente mediante evidência humana real.

Valores:

CONFIRMADA
NÃO VERIFICADA

HTTP 2xx não significa confirmação humana.

Provider Message ID não significa confirmação humana.

==================================================
ETAPA 12 — IDEMPOTÊNCIA
==================================================

Após a tentativa, consultar o estado real.

Confirmar:

Test Run:
TR-8-REAL-006

Logical Outboxes:
1

Real Attempts:
<= 1

Provider Sends:
<= 1

Idempotency Key:
única

Nenhuma duplicidade de envio.

NÃO realizar segundo envio para "testar idempotência".

==================================================
ETAPA 13 — FAIL-CLOSED
==================================================

Para QUALQUER resultado:

HTTP 2xx
HTTP 400
HTTP 401
HTTP 403
HTTP 404
HTTP 409
HTTP 429
HTTP 5xx
timeout
network error
provider rejection
exception inesperada

executar imediatamente o fechamento seguro.

NÃO realizar retry manual.

NÃO executar segunda tentativa.

==================================================
ETAPA 14 — KILL SWITCH OFF
==================================================

Após a única tentativa, independentemente do resultado:

Kill Switch = OFF

Confirmar SERVER-SIDE.

Depois validar:

Kill Switch = OFF
Provider Calls adicionais = 0
Outboxes adicionais enviados = 0
Production = OFF
P1 = OFF
Environment = SANDBOX

Se Kill Switch permanecer ON:

RESULTADO = NÃO HOMOLOGADO

==================================================
ETAPA 15 — QUATRO NÍVEIS DE HOMOLOGAÇÃO
==================================================

Avaliar separadamente:

NÍVEL 1 — INTERNAL PIPELINE

Incident
→ Alert
→ Outbox
→ Worker

Resultado:

HOMOLOGADO
ou
NÃO HOMOLOGADO

--------------------------------

NÍVEL 2 — PROVIDER ACCEPTANCE

Resultado:

HOMOLOGADO
ou
NÃO HOMOLOGADO

--------------------------------

NÍVEL 3 — DELIVERY

Resultado:

HOMOLOGADA
NÃO HOMOLOGADA
ou
NÃO COMPROVADA

--------------------------------

NÍVEL 4 — HUMAN CONFIRMATION

Resultado:

CONFIRMADA
ou
NÃO VERIFICADA

NÃO inferir um nível a partir do anterior.

==================================================
ETAPA 16 — GO-LIVE
==================================================

MESMO QUE:

Internal Pipeline = HOMOLOGADO
Provider Acceptance = HOMOLOGADO
Delivery = HOMOLOGADA
Human Confirmation = CONFIRMADA

NÃO ativar Production.

NÃO liberar P1.

NÃO manter Kill Switch ON.

NÃO iniciar alertas operacionais.

O resultado máximo permitido nesta execução é:

PRONTO PARA PROPOSTA DE GO-LIVE P0 = SIM

Go-Live exige autorização posterior independente.

==================================================
GUARDRAILS ABSOLUTOS
==================================================

NÃO alterar:

Nova Ausência
matrícula 2625
RLS homologada
log_audit_event
detectar_conflitos_ausencia
ausencia_duplicada_existente
triggers de duplicidade
Dashboard
OCP
Relatórios
Qualidade
Retificação.

O incidente P0 de Nova Ausência está ENCERRADO.

Não reabri-lo durante esta execução.

src/routes/index.tsx permanece redirecionamento puro.

NÃO inserir documentação técnica na Home.

==================================================
RELATÓRIO FINAL OBRIGATÓRIO
==================================================

ETAPA 8.13 — TR-8-REAL-006

TEST RUN:
TR-8-REAL-006

--------------------------------
AMBIENTE
--------------------------------

Environment:
[...]

Production:
OFF/ON

P1:
OFF/ON

Evolution Instance:
[...]

Instance State:
[...]

Recipient:
[mascarado]

Technical Recipient:
SIM/NÃO

Active:
SIM/NÃO

Admin Verified:
SIM/NÃO

Provider Verified antes do teste:
UNKNOWN/[...]

--------------------------------
PRE-FLIGHT
--------------------------------

Pre-flight:
READY/BLOCKED

Dry Run:
PASSOU/FALHOU

Provider Calls Dry Run:
[...]

Normalização:
PASSOU/FALHOU

Payload:
PASSOU/FALHOU

PII Guardrail:
PASSOU/FALHOU

--------------------------------
EXECUÇÃO
--------------------------------

Incident ID:
[...]

Alert ID:
[...]

Outbox ID:
[...]

Attempt ID:
[...]

Trace ID:
[...]

Idempotency Key:
[...]

Logical Outboxes:
[...]

Real Attempts:
[...]

Provider Sends:
[...]

--------------------------------
PROVIDER
--------------------------------

HTTP:
[...]

Safe Provider Code:
[...]

Provider Accepted:
SIM/NÃO

Provider Message ID:
[...]

Outbox Status:
[...]

--------------------------------
DELIVERY
--------------------------------

Delivery:
DELIVERED/NOT_DELIVERED/UNKNOWN

Delivery Evidence:
[...]

Human Confirmation:
CONFIRMADA/NÃO VERIFICADA

--------------------------------
IDEMPOTÊNCIA
--------------------------------

Logical Outboxes:
[...]

Attempts:
[...]

Provider Sends:
[...]

Duplicidade:
BLOQUEADA/FALHOU

--------------------------------
SEGURANÇA
--------------------------------

PII:
NÃO PRESENTE/PRESENTE

Dados clínicos:
NÃO PRESENTES/PRESENTES

Secrets:
NÃO PRESENTES/PRESENTES

Kill Switch final:
OFF/ON

Confirmado server-side:
SIM/NÃO

Provider Calls após OFF:
[...]

Outboxes adicionais:
[...]

Environment final:
SANDBOX/[...]

Production final:
OFF/ON

P1 final:
OFF/ON

--------------------------------
HOMOLOGAÇÃO
--------------------------------

Internal Pipeline:
HOMOLOGADO/NÃO HOMOLOGADO

Provider Acceptance:
HOMOLOGADO/NÃO HOMOLOGADO

Delivery:
HOMOLOGADA/NÃO HOMOLOGADA/NÃO COMPROVADA

Human Confirmation:
CONFIRMADA/NÃO VERIFICADA

TR-8-REAL-006:
HOMOLOGADO/PARCIAL/NÃO HOMOLOGADO

PRONTO PARA PROPOSTA DE GO-LIVE P0:
SIM/NÃO

==================================================
ENCERRAMENTO
==================================================

Depois de gerar o relatório:

PARAR.

NÃO executar TR-8-REAL-007.

NÃO realizar retry manual.

NÃO trocar recipient automaticamente.

NÃO modificar Adapter.

NÃO modificar Worker.

NÃO ativar Production.

NÃO liberar P1.

NÃO realizar nova correção automaticamente.

Aguardar nova autorização explícita.
