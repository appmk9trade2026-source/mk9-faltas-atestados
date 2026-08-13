# CRM MK9 — CENTRAL DE PROCESSAMENTO — CORREÇÃO DO DRAWER “VER LANÇAMENTOS”

## Resumo
Correção da divergência entre a contagem de pendências do card agrupado e a listagem exibida no Drawer (lateral) da Central de Processamento. Implementação de exibição clara do tipo/motivo da ausência em cada registro e garantia de ordenação cronológica.

## Diagnóstico
- **Causa da Divergência:** O card agrupa por `colaborador_id (ou matricula) + projeto_id`. O Drawer utiliza a mesma lista em memória (`agrupado`), mas pode haver inconsistência se a `chave` de busca no Drawer não refletir exatamente a lógica do `agrupado.map`.
- **Tipo/Motivo:** O Drawer atualmente exibe `item.tipo`, que pode ser o código ou label genérico. É necessário garantir que mostre `tipo_ausencia_nome` ou o motivo manual.
- **Paginado/Limit:** A consulta `ausenciasQ` traz todos os registros não processados, mas o `agrupado` faz o filtro em memória. Não há `limit` explícito no código, sugerindo que a falha é no filtro da chave de busca ao abrir o Drawer.

## Plano de Ação

### Fase 1: Padronização da Chave de Agrupamento
1. Uniformizar a geração da `chave` no `useMemo` de agrupamento e no componente `Sheet` do Drawer.
2. Garantir que `colaborador_id` seja a chave primária de vínculo, caindo para `matricula` apenas em registros manuais/orfãos.

### Fase 2: Correção do Drawer (Detail View)
1. Ajustar a query de filtragem dentro do `Sheet` para capturar todos os itens que pertencem ao mesmo grupo (`colaborador + projeto`).
2. Implementar a ordenação `ASC` (mais antiga primeiro) na listagem do Drawer para alinhar com o SLA exibido no card.
3. Garantir que ao clicar em "Ver lançamentos", o estado `registroSelecionado` aponte para o item mais antigo (primeiro da fila do grupo) por padrão, mas liste todos os outros.

### Fase 3: UX do Item (Motivo da Ausência)
1. Modificar o layout do item no Drawer para exibir:
   - **Badge de Tipo:** (ex: FALTA INJUSTIFICADA, ATESTADO MÉDICO).
   - **Datas:** Período completo.
   - **Protocolo:** Link ou badge.
2. Distinguir visualmente o registro que está sendo "visualizado" no Painel 360 do restante da lista.

### Fase 4: Verificação
1. Testar caso Rogean (5 pendências): Validar se os 5 registros aparecem no Drawer.
2. Testar caso Gabriella (2 atestados): Validar se os tipos específicos aparecem.
3. Verificar persistência de Guardrail P0 (Home = Redirect).

## Detalhes Técnicos
- Arquivo principal: `src/routes/_authenticated/processamento.tsx`.
- Dependência: `src/components/processamento/painel-360.tsx` (exibição do detalhe).
- RN: Manter agrupamento por `colaborador_id + projeto_id`.
- Ordenação: `sort((a, b) => new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime())`.
