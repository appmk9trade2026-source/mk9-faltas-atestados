# Plano de Estabilização: Correção UX - Categorias de Chamado por Perfil

Este plano visa corrigir a experiência do usuário (UX) e a governança de acesso no formulário de chamados da Central de Suporte, garantindo que as categorias exibidas e permitidas estejam alinhadas ao perfil do colaborador (Supervisor vs. RH/Admin), tanto na interface quanto no servidor.

## Alterações Técnicas

### 1. Definições de Categorias (Lógica de Negócio)
Criar uma fonte única de verdade para as categorias de suporte em `src/lib/support.functions.ts`.
- **Valores Canônicos:** `AUSENCIA`, `RETIFICACAO`, `OCORRENCIA_PONTO`, `PROCESSAMENTO_INTERNO`, `ACESSO_PERMISSAO`, `ERRO_SISTEMA`, `DUVIDA_ORIENTACAO`, `OUTRO`.
- **Labels:** Mapeamento de labels simplificados para usuários (ex: `AUSENCIA` -> "Problema com Ausência").
- **Matriz de Acesso:** Função `getAvailableCategories(role)` que retorna as categorias permitidas por perfil.

### 2. Validação Server-Side
Atualizar a `createServerFn` `createTicket` em `src/lib/support.functions.ts`:
- Validar se a categoria enviada é permitida para o `requester_role` do usuário autenticado.
- Rejeitar (throw 403/Error) se um Supervisor tentar enviar `PROCESSAMENTO_INTERNO`.

### 3. Interface do Formulário (UI)
Refatorar `src/components/support/novo-chamado-dialog.tsx`:
- Utilizar `useSession` para obter o perfil do usuário.
- Filtrar o `Select` de categorias dinamicamente com base no perfil.
- Implementar preenchimento automático (contextual) a partir de `suggestedCategory` mapeando os fluxos operacionais para as novas labels.

### 4. Suporte Contextual
Ajustar `src/components/support/support-help-button.tsx` e componentes operacionais para enviar o contexto correto:
- Mapear fluxos como "Nova Ausência" para a categoria sugerida `AUSENCIA`.

### 5. Preservação de Dados Históricos
- Garantir que a exibição de tickets antigos continue funcionando através do mapeamento de labels, mesmo para categorias legíveis por humanos que já estejam no banco (ex: "Problema em Ausência").

## Technical Details

- **Zod Schema:** Atualizar o schema de validação para incluir `DUVIDA_ORIENTACAO` e as novas definições.
- **RBAC:** Utilizar a tabela `user_roles` e a função `has_role` (já existente no banco) para validações seguras.
- **Labels dinâmicas:** O componente `TicketDetailsDrawer` e a lista de tickets devem converter o valor canônico no label correto para exibição.

## User Review Required

> [!IMPORTANT]
> A categoria "Processamento Interno" será removida da visão de Supervisor, mas mantida para RH e Super Admin. As labels serão alteradas para uma linguagem mais simples (ex: "Problema com..." em vez de apenas o nome do fluxo). Nenhuma migração de banco de dados é necessária, pois trabalharemos com mapeamento de labels sobre os valores existentes.

## Checklist de Homologação

- [ ] Login como Supervisor: "Processamento Interno" oculto.
- [ ] Login como RH: Todas as categorias visíveis.
- [ ] Chamado contextual (botão ajuda): Categoria preenchida automaticamente.
- [ ] Validação server-side: Tentativa de bypass por Supervisor bloqueada.
- [ ] Compatibilidade: Tickets antigos abrem normalmente.
- [ ] Build e Types: `tsc --noEmit` PASS.
