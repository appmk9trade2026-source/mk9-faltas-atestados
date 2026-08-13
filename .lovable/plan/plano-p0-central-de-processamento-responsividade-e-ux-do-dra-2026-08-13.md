# Plano P0 — Central de Processamento: Responsividade e UX do Drawer

O objetivo é transformar o Drawer de processamento em uma área de trabalho eficiente em duas colunas (Desktop), garantindo legibilidade em zoom 100% (1366px+) e adaptabilidade total em Mobile/Tablet.

## Etapas de Implementação

### 1. Hardening do Componente Drawer (Sheet)
- Ajustar `src/routes/_authenticated/processamento.tsx` para usar largura responsiva no `SheetContent`.
- **Desktop:** `w-[min(1100px,92vw)]` (aumentando a área útil).
- **Mobile/Tablet:** Manter comportamento nativo de tela cheia ou largura total.

### 2. Layout em Duas Colunas (Desktop)
- Reestruturar o conteúdo do `SheetContent` em um grid:
  - **Coluna Esquerda (Lista):** ~300px, fixa. Contém todos os lançamentos do grupo.
  - **Coluna Direita (Detalhe):** Flex-1. Contém o `Painel360` e ações de processamento.
- Adicionar scroll independente para ambas as colunas.

### 3. Refatoração do `Painel360` (Detalhes)
- Remover o header interno redundante do `Painel360` ou integrá-lo ao cabeçalho fixo do Drawer.
- Garantir que o `Painel360` não cause scroll na página inteira.

### 4. Navegação e Estados
- Manter o estado `registroSelecionado` para controlar o conteúdo da coluna direita.
- Destacar o item ativo na lista lateral.
- Adicionar navegação Mobile (Tabs ou visualização condicional) para alternar entre "Lista" e "Detalhes".

### 5. Header e Footer Fixos
- Fixar o nome do colaborador e matrícula no topo do Drawer.
- Garantir que as ações de processamento (iniciar/concluir) estejam sempre acessíveis (sticky footer).

## Detalhes Técnicos

### Estrutura Visual Desktop
```text
┌──────────────────────────────────────────────────────────────┐
│ [Header Fixo: Colaborador + Matrícula]                     X │
├─────────────────┬────────────────────────────────────────────┤
│ [Lista Scroll]  │ [Painel360 Detail Scroll]                 │
│                 │                                            │
│ Item 1 (Ativo)  │ - Dados da Ausência                       │
│ Item 2          │ - Documentos                              │
│ Item 3          │ - Processamento (Ações)                   │
└─────────────────┴────────────────────────────────────────────┘
```

### Breakpoints
- `lg` (1024px+): Duas colunas.
- `md` (768px - 1023px): Coluna única com lista no topo ou navegação simplificada.
- `sm` (<768px): Tela cheia (100vw/100vh) com foco no detalhe após seleção.

## Invariantes
- **Guardrail P0:** `src/routes/index.tsx` permanece um redirecionamento puro.
- **Funcionalidade:** Sem alteração em RPCs, RLS, ou lógica de agrupamento.
- **Tipo Canônico:** Preservar a exibição destacada do tipo de ausência corrigida anteriormente.
