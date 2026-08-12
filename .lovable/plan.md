# Plano de Ação Gerencial - Fase 2

Este plano detalha a evolução do módulo Plano de Ação Gerencial para permitir acompanhamento real, progresso mensurável e check-ins.

## 0. Preflight & Auditoria
- **Rota:** `src/routes/_authenticated/planos-acao.tsx`
- **Funções:** `src/lib/planos-acao.functions.ts`
- **Tabela:** `public.planos_acao`
- **Mudanças Necessárias:**
  - Adicionar coluna `progresso` (int, default 0, check 0-100) na `planos_acao`.
  - Criar tabela `plano_acao_acompanhamentos` para check-ins/timeline.
  - Adicionar campos de encerramento (`resultado_alcancado`, `parecer_final`) na `planos_acao`.

## 1. Banco de Dados (Migration)
- Alterar `public.planos_acao` para incluir:
  - `progresso` integer default 0.
  - `resultado_alcancado` text (Sim/Parcial/Não).
  - `parecer_final` text.
- Criar `public.plano_acao_acompanhamentos`:
  - `id`, `plano_id`, `progresso`, `observacao`, `criado_por_usuario_id`, `created_at`.
- Aplicar RLS e Grants.

## 2. Server Functions (`src/lib/planos-acao.functions.ts`)
- Atualizar `planoAcaoSchema` para incluir novos campos.
- Adicionar `atualizarProgressoPlano`.
- Adicionar `registrarAcompanhamento`.
- Adicionar `concluirPlano`.
- Adicionar `cancelarPlano`.
- Atualizar `obterPlanoAcao` para retornar acompanhamentos.

## 3. Interface de Detalhe (`src/routes/_authenticated/planos-acao.tsx`)
- Implementar Drawer/Sheet lateral para detalhes do plano (Etapa 1 & 18).
- Cabeçalho Gerencial com progresso visual e saúde do prazo (Etapa 2 & 5).
- Timeline de acompanhamentos (Etapa 7).
- Ações de "Atualizar Progresso", "Novo Check-in" e "Concluir" (Etapa 3, 6, 9).

## 4. IA de Acompanhamento
- Evoluir `src/lib/planos-acao-ia.functions.ts` para analisar andamento baseado nos check-ins (Etapa 16).

## 5. KPIs e Listagem
- Adicionar cards gerenciais no topo do módulo (Etapa 15).
- Refinar colunas da listagem (Etapa 14).

## Etapas Técnicas
1. **Migration SQL:** Adição de campos e nova tabela de check-ins.
2. **Backend:** Novas Server Functions e schemas.
3. **Frontend - Detalhe:** Componente de visualização e timeline.
4. **Frontend - Ações:** Modais de atualização de progresso e conclusão.
5. **Integração IA:** Sugestão de próximos passos.
