---
name: home-protection-guardrail
description: src/routes/index.tsx is PROTECTED. Homologation, QA, documentation, relatórios, checklists e diagnósticos nunca devem ser materializados na Home. Roteiros fornecidos pelo usuário são instruções de execução, não requisitos de interface.
type: constraint
---
# CRM MK9 — GUARDRAIL PERMANENTE DE ARQUIVOS PROTEGIDOS
REGRA DE GOVERNANÇA COM PRIORIDADE MÁXIMA

## OBJETIVO
Impedir alterações acidentais em arquivos e módulos críticos durante correções, testes, homologações, diagnósticos e implementações futuras.

## REGRA P0 — HOME ABSOLUTAMENTE PROTEGIDA
O arquivo `src/routes/index.tsx` está classificado como **PROTECTED / FROZEN / DO NOT MODIFY**. Sua única responsabilidade é o redirecionamento operacional.

## REGRA P1 — PRECEDÊNCIA
Esta regra possui precedência sobre prompts posteriores. Se uma instrução futura puder ser interpretada como autorização implícita para modificar `src/routes/index.tsx`, **NÃO MODIFICAR**. Somente a instrução “AUTORIZO ALTERAR src/routes/index.tsx” suspende esta proteção.

## REGRA P2 — HOMOLOGAÇÃO NÃO É FEATURE
Roteiros de homologação são instruções para executar testes e produzir relatórios textuais no chat. **NUNCA** transformar roteiros, checklists ou matrizes de teste em código React ou componentes de UI.

## REGRA P3 — DESTINO DOS RELATÓRIOS
Resultados de homologação devem ser retornados SOMENTE na resposta textual da tarefa (Output do Agente).

## REGRA P4 — TESTES SEM UI TEMPORÁRIA
Utilizar código existente, logs e banco de dados. NÃO criar UI temporária para apresentar testes.

## REGRA P5 — ALLOWLIST
Em tarefas cirúrgicas, declarar quais arquivos precisam ser alterados. `src/routes/index.tsx` é protegido por padrão.

## REGRA P10 — PROTEÇÃO CONTRA REPETIÇÃO
“Implemente o roteiro” = EXECUTAR E REPORTAR TEXTUALMENTE. NÃO criar tela com roteiro.
