# Plano de Reconciliação Forense - Rodada 2 Etapa 4.1

Este plano visa diagnosticar a inconsistência no painel `/estabilidade`, onde o fluxo "Nova Ausência" apresenta 0% de progresso, apesar da homologação prévia.

## Etapa 1: Diagnóstico de Dados Reais
- **Ação:** Consultar o banco de dados `audit_stability_results` para extrair o estado bruto do fluxo `nova_ausencia`.
- **Objetivo:** Verificar se os registros de `PASS` existem e qual seu `trace_id` ou data de atualização.

## Etapa 2: Auditoria de Baseline e Drift
- **Ação:** Verificar se houve reset acidental de portões durante a Etapa 3/4.
- **Objetivo:** Confirmar a integridade do baseline `RUN-20260819-P0-001-R1`.

## Etapa 3: Investigação de Lógica de UI
- **Ação:** Analisar `src/routes/_authenticated/estabilidade.lazy.tsx` para entender como o cálculo de progresso é realizado.
- **Filtros:** Verificar se a query está filtrando apenas por um `trace_id` específico que não contempla o baseline da Nova Ausência.

## Etapa 4: Relatório de Reconciliação
- **Ação:** Atualizar o terminal do relatório final na UI com o diagnóstico forense completo.
- **Resultado:** Indicar a causa raiz (Ex: `QUERY_FILTER` ou `DATA_DRIFT`) e a correção necessária sem implementá-la ainda.

## Detalhes Técnicos
- Utilização de `supabase--read_query` para auditoria DB.
- Inspeção manual da lógica de `getFlowStats` no componente React.
- **Restrição:** Nenhuma alteração de código operacional ou reset de dados.
