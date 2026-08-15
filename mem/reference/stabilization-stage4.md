---
name: Stage 4 - Saúde Operacional
description: Roadmap para detecção proativa de incidentes e health checks.
type: reference
---

# CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO GERAL
## ETAPA 4 — SAÚDE OPERACIONAL, HEALTH CHECKS E DETECÇÃO PROATIVA DE INCIDENTES

### CONTEXTO
O Programa de Estabilização já possui:
- ETAPA 2: baseline canônico de regressão; contratos críticos protegidos.
- ETAPA 3: observabilidade homologada; Trace ID; logs estruturados; sanitização server-side; Nova Ausência instrumentada; Dashboard instrumentado; Permissões/RBAC instrumentado.

**Baseline atual:** 98 testes passando.
A Etapa 4 NÃO deve alterar regras de negócio.

### OBJETIVO
Criar uma camada de Saúde Operacional capaz de responder:
1. O sistema está saudável?
2. Qual módulo está degradando?
3. Existem erros repetitivos?
4. O problema é isolado ou sistêmico?
5. Quando começou?
6. Quantos usuários/operações foram afetados?
7. Qual Trace ID pode ser usado para investigação?
8. O problema continua ocorrendo ou já cessou?

### PRINCÍPIO
**OBSERVAR → AGREGAR → CLASSIFICAR → DETECTAR → REGISTRAR INCIDENTE**
(NÃO: OBSERVAR → ALTERAR REGRA DE NEGÓCIO AUTOMATICAMENTE)

[...]
*Nota: O conteúdo completo do roteiro da Etapa 4 foi arquivado nesta memória para consulta técnica, mantendo a Home como redirecionamento puro.*
