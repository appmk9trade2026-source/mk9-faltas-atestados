# CRM MK9 — Incidente P0 de Integridade: Busca por Matrícula

Este plano estabelece a correção cirúrgica para o erro de identificação na busca automática de colaboradores, garantindo que a resolução de identidade por matrícula utilize apenas matches exatos e proteções contra race conditions e corrupção de estado.

## 1. Diagnóstico e Auditoria
- **Caso Real:** Confirmado no banco que Lucas (28) está sendo retornado indevidamente para a busca "286".
- **Origem provável:** A query no frontend ou a RPC no backend está utilizando `ILIKE` ou `contains` em vez de igualdade estrita (`eq`).
- **Race Condition:** O fato de 28 aparecer quando 286 foi digitado sugere que a resposta da requisição anterior ("28") chegou após a de "286" e sobrescreveu o estado.

## 2. Correção no Frontend (`src/routes/_authenticated/nova-ausencia.tsx`)
- **Match Exato na Busca:** Alterar o `searchMatricula` para garantir que apenas registros com a matrícula idêntica à entrada (após trim/normalização) sejam considerados.
- **Proteção contra Race Condition:** Implementar um controle (ex: `ref` com o valor da última busca) para que respostas de requisições obsoletas sejam descartadas.
- **TanStack Query Refactoring:** Garantir que a `queryKey` inclua a matrícula específica para isolar o cache.
- **Seleção de Múltiplos Vínculos:** Ajustar o modal para nunca selecionar o primeiro resultado automaticamente se houver ambiguidade.

## 3. Hardening no Backend (`src/lib/ausencias.functions.ts`)
- **Identity Verification:** No handler de `createAusencia`, adicionar uma verificação final: se o `colaborador_id` foi informado, sua matrícula no banco deve coincidir com a matrícula informada no payload (regra de integridade).
- **Bloqueio de Inconsistência:** Se houver divergência, o lançamento deve ser bloqueado com erro `CONFLICT`.

## 4. Auditoria Histórica
- Realizar uma consulta apenas leitura para identificar lançamentos onde a matrícula do `colaborador_id` difere da matrícula informada durante o lançamento (se capturada no log/payload manual).

## Detalhes Técnicos
- **Normalização:** Utilizar uma função única `normalizeMatricula` para garantir consistência entre input e storage.
- **Integridade:** `matricula_payload === colaborador_storage.matricula`.
