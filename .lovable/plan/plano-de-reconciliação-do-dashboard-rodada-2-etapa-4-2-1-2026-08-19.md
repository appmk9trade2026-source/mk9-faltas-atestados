# Plano de Reconciliação do Dashboard: Rodada 2 — Etapa 4.2.1

Este plano visa corrigir a divergência visual no dashboard `/estabilidade`, onde o fluxo **Nova Ausência** exibe 0% de progresso apesar da recuperação técnica dos dados realizada na Etapa 4.2.

## Objetivo
Identificar e corrigir a causa raiz da discrepância entre os dados no banco de dados (`audit_stability_results`) e a exibição no frontend, garantindo que o progresso e o status derivem corretamente dos 11 gates homologados.

## Fases de Execução

### 1. Diagnóstico Forense (Etapa 1-3)
- **Comparação Real:** Confrontar os 10 registros `PASS` e 1 `NOT_TESTED` (total 11) encontrados no banco contra a lista de 14 gates definidos no frontend (`GATES` array em `estabilidade.lazy.tsx`).
- **Causa Raiz Provável:** `QUERY_FILTER` ou `FLOW_KEY_MISMATCH` (especificamente, a contagem de gates esperados no frontend vs. gates presentes no banco).
- **Inspeção de `getFlowStats`:** Verificar como a função calcula o percentual quando o banco tem menos registros do que a lista estática `GATES`.

### 2. Correção Cirúrgica (Etapa 4)
- **Ajuste de Mapeamento:** Garantir que o frontend reconheça os gates persistidos e não penalize o progresso por gates inexistentes no banco para aquele fluxo específico, se for o caso.
- **Sincronização de Enums:** Verificar se os gates no banco (` gate_id`) batem exatamente com os nomes no array `GATES`.

### 3. Validação e Não Regressão (Etapa 5-7)
- **Smoke Test:** Recarregar a página e confirmar `Progresso: 100%` (ou valor real baseado nos 11 gates).
- **Integridade:** Confirmar que Ocorrência e Processamento mantêm seus estados (GAP P2 preservado).
- **Build:** Executar `tsc --noEmit` para garantir integridade de tipos.

## Restrições
- NÃO hardcodar "100%" ou "HOMOLOGADA".
- NÃO alterar lógica de negócio de Ausências.
- NÃO realizar resets globais.
