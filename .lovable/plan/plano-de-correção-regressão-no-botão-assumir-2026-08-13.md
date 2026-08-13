# Plano de Correção: Regressão no Botão "Assumir"

Corrigir a falha onde clicar em "Assumir" na Central de Processamento faz o grupo desaparecer da fila em vez de movê-lo para o estado de processamento ativo do usuário.

## Diagnóstico
O problema ocorre porque:
1.  **Filtro da Query**: A query principal em `src/routes/_authenticated/processamento.tsx` filtra apenas por `status_processamento != 'PROCESSADO'`.
2.  **Lógica de Agrupamento**: O `useMemo` agrupa os registros por Colaborador + Projeto, mas não diferencia entre itens "Aguardando" e "Em Processamento".
3.  **Comportamento Operacional**: O botão "Assumir" chama a RPC `iniciar_processamento_ausencia`, que muda o status para `EM_PROCESSAMENTO`. 
4.  **Causa da Regressão**: Após o "Assumir", a lista é recarregada. Se o registro ainda está lá mas não é exibido ou o card de grupo desaparece, é provável que a UI esteja exibindo apenas o backlog ou que a lógica de "Minha Fila" não esteja integrada à visualização principal de cards.

## Ações

### 1. Servidor e RPC
- Auditar a RPC `iniciar_processamento_ausencia` para garantir que ela não está marcando o item como `PROCESSADO` prematuramente (verificado: ela marca como `EM_PROCESSAMENTO`).

### 2. Frontend: `src/routes/_authenticated/processamento.tsx`
- **Integrar Abas**: Criar um sistema de abas ou filtros visuais para separar "Fila Geral" (Aguardando) de "Minha Fila" (Em Processamento).
- **Badge de Estado**: Adicionar no card de grupo um indicador visual quando o grupo contém itens assumidos pelo usuário atual.
- **Persistência do Card**: Garantir que o card do grupo permaneça visível enquanto houver pendências não concluídas, mudando o botão de "Assumir" para "Continuar" se o usuário for o dono.
- **KPIs em Tempo Real**: Validar se a contagem do KPI "Minha Fila" reflete imediatamente a mudança após o claim.

### 3. UX do Drawer
- Garantir que ao abrir o Drawer de um grupo já assumido, o usuário possa processar os itens individualmente sem fechar o contexto do grupo.

## Verificação
- Teste com grupo de 1 item: Clicar "Assumir" -> Card deve mudar para "Em Processamento" -> KPI "Minha Fila" incrementa.
- Teste com grupo de 5 itens: Clicar "Assumir" -> Todos os 5 itens do grupo devem ser atribuídos -> Card continua visível com opção de "Continuar".
- Teste de concorrência: Validar toast de erro se outro analista assumir o grupo no mesmo instante.
