# Plano de Implementação — Central de Processamento Agrupada

Implementar o agrupamento visual de pendências por colaborador na Central de Processamento para melhorar a produtividade operacional.

## Alterações Técnicas

### 1. Backend (Server Functions)
- **`getCentralProcessamentoKpis`**: Adicionar contagem de colaboradores (cards agrupados) aos KPIs sem alterar o significado dos contadores de ocorrências existentes.
- **`iniciarProcessamentoGrupo` (Nova)**: Criar função para assumir múltiplas ausências de um colaborador/projeto simultaneamente de forma segura.

### 2. Frontend (UI/UX)
- **`processamento.tsx`**:
    - Implementar lógica de agrupamento no `useMemo` (`colaborador_id` + `projeto_id`).
    - Adicionar filtros por quantidade de pendências.
    - Atualizar contadores de topo.
- **`ProcessamentoCard`**:
    - Novo layout focado no colaborador.
    - Exibição de contadores internos (X faltas, Y atestados).
    - Status de SLA baseado na ocorrência mais antiga.
- **`Painel360` (Drawer)**:
    - Adicionar lista de pendências do grupo.
    - Permitir alternar entre ocorrências para processamento individual sem fechar o drawer.

### 3. Concorrência
- Garantir que "Assumir Grupo" respeite registros que já possam ter sido capturados por outros analistas.

## User Review Required
- [ ] O botão "Assumir Próximo" deve priorizar o grupo com o registro mais antigo, correto?

## Technical Details
- Agrupamento no frontend usando `lodash/groupBy` ou Map nativo.
- Preservação da auditoria individual por `ausencia_id`.
- Sem alterações em tabelas físicas ou RLS.
