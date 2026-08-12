# CRM MK9 — CORREÇÃO FUNCIONAL: PLANO DE AÇÃO GERENCIAL — SUPERVISOR NO FORMULÁRIO

Correção cirúrgica para restaurar a hierarquia operacional (Projeto → Supervisor → Colaborador) no modal de "Novo Plano de Ação Gerencial", garantindo que o campo Supervisor apareça corretamente e filtre os dependentes sem reintroduzir erros de ambiguidade (HTTP 300).

## Etapas de Implementação

1. **Interface do Formulário (`src/routes/_authenticated/planos-acao.tsx`)**:
   - Ajustar o select "Tipo de Alvo" para garantir a opção "Supervisor".
   - Reposicionar o campo "Supervisor" entre "Projeto" e "Colaborador".
   - Ajustar o layout desktop para 2 colunas:
     - Linha 1: Tipo de Alvo | Projeto
     - Linha 2: Supervisor | Colaborador (ou vazio se alvo for Supervisor)
   - Implementar limpeza de dependências (Se Projeto muda → limpa Sup/Colab; Se Supervisor muda → limpa Colab).
   - Implementar auto-preenchimento e bloqueio do campo Supervisor para usuários com role `supervisor`.

2. **Lógica de Seletores**:
   - Garantir que a lista de Supervisores seja carregada ao selecionar um Projeto (usando `useSupervisoresPorProjeto`).
   - Garantir que a lista de Colaboradores seja filtrada pelo Supervisor selecionado (usando `useColaboradoresAtivos` com a assinatura canônica de 4 parâmetros).

3. **Validação de Negócio (`src/lib/planos-acao.functions.ts`)**:
   - Refinar a validação server-side no `criarPlanoAcao` para os diferentes tipos de alvo.
   - Garantir que `indicador_sucesso` e a hierarquia (Supervisor pertence ao Projeto, Colaborador ao Supervisor) sejam validados rigorosamente.

4. **IA (`src/lib/planos-acao-ia.functions.ts`)**:
   - Adaptar o contexto da IA para incluir o nome do Supervisor quando disponível.

## Detalhes Técnicos

- **Componente**: `PlanosAcaoPage` em `src/routes/_authenticated/planos-acao.tsx`.
- **Hooks**: `useSupervisoresPorProjeto` (filtros por projeto) e `useColaboradoresAtivos` (filtros por empresa, projeto, supervisor e busca).
- **RPC**: Chamadas explícitas para `get_supervisores_projeto` e `get_colaboradores_ativos` (assinatura de 4 parâmetros).
- **Guardrails**: Nenhuma alteração na Home, BI, Dashboard ou Ocorrências AMBEV. Foco exclusivo na correção do modal de Planos de Ação.
