---
name: crm-mk9-stabilization-manifest
description: Manifest of the General Stabilization Program and Regression Hardening stages.
type: reference
---
# CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO GERAL
MODO: FREEZE DE FEATURES + REGRESSION HARDENING

## OBJETIVO
Reduzir drasticamente a recorrência de erros no sistema e impedir que correções em um módulo provoquem regressões em outro.
A prioridade agora NÃO é adicionar novas funcionalidades.
A prioridade é: ESTABILIDADE, PREVISIBILIDADE, RASTREABILIDADE, NÃO REGRESSÃO.

## ESTRUTURA DO PROGRAMA

### FASE 0 — CONGELAMENTO TEMPORÁRIO
- NÃO implementar novas features.
- NÃO refatorar módulos grandes.
- NÃO alterar RPCs críticas sem bug reproduzido.
- NÃO alterar RLS/RBAC preventivamente.
- NÃO alterar src/routes/index.tsx (Guardrail P0).
- Somente correções de bugs reproduzíveis.

### FASE 1 — MAPA DE MÓDULOS CRÍTICOS
1. Login / sessão
2. Dashboard
3. Nova Ausência
4. Busca por matrícula
5. Duplicidade
6. Atestado + upload
7. /ausencias
8. Central de Processamento
9. Ocorrências de Ponto AMBEV
10. Relatórios
11. Qualidade de Lançamentos
12. Retificação
13. Plano de Ação
14. Permissões / RBAC
15. WhatsApp
16. Home redirect (Guardrail P0)

### FASE 2 — BASELINE CANÔNICO
Execução de smoke tests para todos os módulos e registro de status PASSOU/FALHOU.
O resultado vira o baseline oficial de não-regressão.

### FASE 3 — AUTOMATIZAÇÃO (PLAYWRIGHT)
Prioridade: Nova Ausência, Duplicidade, Atestado+Anexo, Central e Dashboard.

### FASE 4 — TESTES DE CONTRATO RPC
Evitar regressões de assinatura, overload ambíguo e GRANT EXECUTE.
RPCs prioritárias: detectar_conflitos_ausencia, dashboard_metrics, rel_faltas, rel_atestados.

### FASE 5 — OBSERVABILIDADE
Padronização de logs server-side com trace_id, user_id e contexto da falha.

### FASE 6 — ERROR BOUNDARIES
Tratamento explícito de estados LOADING, EMPTY e ERROR. Nunca skeleton infinito.

### FASE 7 — REGRA DE CHANGE BUDGET
Correções devem declarar escopo antes da execução. Se tocar em >3 módulos críticos, reavaliar.

### FASE 16 — GUARDRAILS (ESTRITOS)
- src/routes/index.tsx permanece REDIRECIONAMENTO PURO.
- Sem alterações em WhatsApp/OCP/Central sem incidente reproduzido.
- Sem uso de service_role no frontend.
- Buckets de storage permanecem privados.
