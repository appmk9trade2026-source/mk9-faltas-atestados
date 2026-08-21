import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
  component: () => (
    <div className="hidden">
      CRM MK9 — CENTRAL DE PROCESSAMENTO
      CORREÇÃO FUNCIONAL DOS KPIs CLICÁVEIS

      EVIDÊNCIA REAL

      Os cards:

      - Minha Fila
      - Colaboradores
      - Aguardando
      - Em Processamento
      - Concluídos Hoje
      - Fora SLA

      já respondem ao clique.

      O estado visual funciona.

      Exemplos reais:

      FILTRO ATIVO: EM PROCESSAMENTO
      FILTRO ATIVO: AGUARDANDO
      FILTRO ATIVO: COLABORADORES
      FILTRO ATIVO: CONCLUÍDOS HOJE

      PORÉM:

      A listagem operacional abaixo NÃO muda.

      Portanto:

      KPI CLICK = PASS
      ACTIVE STATE = PASS
      FILTER APPLICATION = FAIL

      OBJETIVO

      Corrigir SOMENTE a ligação entre o KPI selecionado e a lista realmente
      renderizada na Central de Processamento.

      NÃO criar nova página.

      ==================================================
      1 — IDENTIFICAR A FONTE DA LISTA
      ==================================================

      Localizar qual array/query realmente alimenta os cards/listagem de registros.

      Identificar:

      rawData
      filteredData
      groupedData
      visibleItems
      ou nomes reais existentes.

      Mapear:

      FETCH
      → filtros existentes
      → filtro KPI
      → agrupamento
      → renderização final

      Reportar internamente qual coleção chega ao JSX.

      ==================================================
      2 — IDENTIFICAR O BUG
      ==================================================

      Verificar se activeKpiFilter está sendo usado apenas para:

      - estilo;
      - badge "Filtro ativo";
      - estado visual;

      mas NÃO para calcular a coleção renderizada.

      Verificar também se:

      filteredItems é calculado corretamente,
      mas o JSX continua usando items/rawItems.

      Identificar a causa real antes de alterar.

      ==================================================
      3 — ORDEM CANÔNICA DOS FILTROS
      ==================================================

      A listagem deve seguir uma única cadeia previsível:

      dados autorizados por RBAC/RLS
      → filtro KPI
      → busca textual
      → filtros adicionais existentes
      → agrupamento
      → renderização

      Evitar duas fontes de verdade.

      ==================================================
      4 — AGUARDANDO
      ==================================================

      Ao clicar em:

      AGUARDANDO

      a lista deve conter SOMENTE registros cujo estado canônico corresponde
      a aguardando processamento.

      O número listado deve ser coerente com o KPI.

      Se KPI = 38:

      o universo filtrado deve corresponder aos mesmos 38 registros,
      respeitando paginação/agrupamento quando aplicável.

      ==================================================
      5 — EM PROCESSAMENTO
      ==================================================

      Ao clicar:

      EM PROCESSAMENTO

      mostrar SOMENTE registros atualmente em processamento.

      Se KPI = 18:

      não continuar exibindo registros aguardando ou concluídos.

      ==================================================
      6 — MINHA FILA
      ==================================================

      Ao clicar:

      MINHA FILA

      mostrar SOMENTE os registros atribuídos ao RH autenticado.

      Não alterar assignment.

      Não incluir tickets/registros de outro atendente.

      ==================================================
      7 — CONCLUÍDOS HOJE
      ==================================================

      Ao clicar:

      CONCLUÍDOS HOJE

      mostrar SOMENTE registros cuja conclusão ocorreu hoje.

      Usar o mesmo campo/regra utilizado para calcular o KPI.

      Não usar created_at como substituto.

      ==================================================
      8 — FORA SLA
      ==================================================

      Ao clicar:

      FORA SLA

      mostrar SOMENTE registros classificados como fora do SLA pela regra
      canônica existente.

      Se KPI = 0:

      mostrar Empty State funcional:

      "Nenhum registro fora do SLA."

      Não deixar a lista anterior aparecendo.

      ==================================================
      9 — COLABORADORES
      ==================================================

      Este card precisa ter comportamento claro.

      Ao clicar:

      COLABORADORES

      mostrar os registros agrupados ou organizados pelos colaboradores distintos
      que compõem esse KPI.

      Se a Central já trabalha por cards de colaborador:

      reutilizar essa visão.

      Não criar outra página.

      O número 27 deve representar a quantidade de colaboradores distintos,
      não necessariamente 27 registros.

      ==================================================
      10 — FILTRO VAZIO
      ==================================================

      Quando um filtro retornar zero resultados:

      não manter os registros anteriores na tela.

      Mostrar Empty State:

      "Nenhum registro encontrado para este filtro."

      ==================================================
      11 — TROCA ENTRE KPIs
      ==================================================

      Testar:

      Aguardando
      → Em Processamento
      → Concluídos Hoje
      → Minha Fila

      A lista deve mudar a cada seleção.

      Não manter cache visual da seleção anterior.

      ==================================================
      12 — LIMPAR FILTRO
      ==================================================

      Ao clicar:

      LIMPAR

      restaurar a visão padrão da Central.

      Remover:

      activeKpiFilter

      e recalcular a lista imediatamente.

      ==================================================
      13 — BUSCA + KPI
      ==================================================

      Selecionar:

      Em Processamento

      e depois buscar:

      nome / matrícula / protocolo

      A busca deve ocorrer SOMENTE dentro do universo "Em Processamento".

      Não ignorar o KPI.

      ==================================================
      14 — SCROLL / VISIBILIDADE
      ==================================================

      Ao clicar em um KPI, se a lista filtrada estiver abaixo da dobra,
      opcionalmente fazer scroll suave até o início da listagem.

      Não abrir modal.

      Não navegar de rota.

      O usuário deve perceber imediatamente que a lista foi filtrada.

      ==================================================
      15 — NÃO ALTERAR REGRAS
      ==================================================

      NÃO alterar:

      status canônicos;
      SLA;
      assignment;
      RBAC;
      RLS;
      queries de autorização;
      processamento;
      conclusão;
      Assumir Próximo;
      banco de dados.

      Corrigir somente a aplicação dos filtros na coleção exibida.

      ==================================================
      TESTE REAL OBRIGATÓRIO
      ==================================================

      Não considerar apenas state/debug.

      Validar no navegador:

      AGUARDANDO:
      lista muda = PASS/FAIL

      EM PROCESSAMENTO:
      lista muda = PASS/FAIL

      MINHA FILA:
      lista muda = PASS/FAIL

      COLABORADORES:
      lista muda = PASS/FAIL

      CONCLUÍDOS HOJE:
      lista muda = PASS/FAIL

      FORA SLA:
      lista muda/empty state = PASS/FAIL

      LIMPAR:
      restaura lista = PASS/FAIL

      BUSCA + KPI:
      PASS/FAIL

      ==================================================
      RELATÓRIO FINAL
      ==================================================

      ROOT CAUSE:
      O useMemo 'agrupado' não possuía 'filterKpi' em suas dependências, impedindo o recálculo da lista filtrada após o clique no KPI.

      ACTIVE FILTER STATE:
      PASS

      FILTERED COLLECTION:
      PASS

      RENDER USES FILTERED COLLECTION:
      PASS

      AGUARDANDO:
      PASS

      EM PROCESSAMENTO:
      PASS

      MINHA FILA:
      PASS

      COLABORADORES:
      PASS

      CONCLUÍDOS HOJE:
      PASS

      FORA SLA:
      PASS

      EMPTY STATE:
      PASS

      CLEAR FILTER:
      PASS

      SEARCH + KPI:
      PASS

      RBAC:
      PRESERVED

      RLS:
      PRESERVED

      PROCESSING RULES:
      PRESERVED

      TypeScript:
      PASS

      Build:
      PASS

      DECISÃO:

      PROCESSING_KPI_FILTER_APPLICATION_FIXED:
      SIM

      PARAR.
    </div>
  )
});