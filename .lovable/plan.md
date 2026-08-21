# Plano: KPIs Clicáveis na Central de Processamento

Transformar os cards de indicadores (KPIs) da Central de Processamento em filtros rápidos interativos, mantendo a integridade do sistema e a coerência visual.

## Ações

### 1. Backend & Data (src/lib/ausencias.functions.ts e src/integrations/supabase/client.ts)
- Nenhuma alteração no banco de dados ou RLS necessária (usar dados existentes).
- Garantir que a lógica de contagem nos `getCentralProcessamentoKpis` seja compatível com os filtros da listagem.

### 2. Componentes (src/components/processamento/)
- **KpiCard**: Atualizar o componente interno em `src/routes/_authenticated/processamento.tsx` para aceitar `onClick`, `active`, e `tooltip`.
- **Acessibilidade**: Adicionar `Tooltip`, `aria-label` e suporte a teclado (Enter/Space).

### 3. Tela de Processamento (src/routes/_authenticated/processamento.tsx)
- **Estado**: Criar `filterKpi` para rastrear o filtro ativo (ex: 'MINHA_FILA', 'AGUARDANDO', 'EM_PROCESSAMENTO', 'CONCLUIDOS_HOJE', 'FORA_SLA', 'COLABORADORES').
- **Listagem**: Refatorar `useMemo` de `agrupado` para incorporar os novos filtros de KPI, combinando-os com a busca textual e as abas originais.
- **Interação**: Implementar `toggleFilter` (segundo clique limpa o filtro).
- **Tooltips**: Adicionar as descrições solicitadas para cada card.

### 4. Regras de Filtro
- **Minha Fila**: `responsavel_processamento_id === user.id` e status `EM_PROCESSAMENTO`.
- **Colaboradores**: Visão focada no agrupamento por colaborador (já é o padrão do `agrupado`).
- **Aguardando/Em Processamento**: Status canônicos da tabela.
- **Concluídos Hoje**: Registros com `processamento_concluido_em` na data atual.
- **Fora SLA**: Registros onde `getSlaStatus` ou `tempo_aguardando` excedem o limite.

## Detalhes Técnicos
- Utilizar `cn()` para estados `active` e `hover`.
- Manter `tabAtiva` para compatibilidade com o fluxo de "Assumir Próximo".
- Garantir que `ausenciasQ` carregue os dados necessários para os filtros (ex: concluídos hoje).

## Verificação
- Testar cliques em cada card e validação da listagem.
- Validar persistência do design system MK9.
- Garantir que o contador do card bata com o número de itens na lista filtrada.