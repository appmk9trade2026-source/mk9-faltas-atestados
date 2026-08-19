# Plano: Botão Flutuante Global de Suporte (FAB)

Este plano descreve a implementação de um botão flutuante global (Floating Action Button - FAB) para facilitar o acesso à Central de Suporte, integrado ao `SupportProvider` existente.

## Alterações Técnicas

### 1. Novo Componente: `SupportFAB`
Criar `src/components/support/support-fab.tsx`:
- Botão fixo no canto inferior direito.
- Responsivo: versão compacta/circular em dispositivos móveis.
- Exibe badge de notificações não lidas (opcional, baseado em consulta de tickets).
- Tooltip e acessibilidade (aria-label).

### 2. Comportamento e Navegação
Ao clicar no FAB, abrir um `Popover` (desktop) ou `Drawer` (mobile) com as opções:
- **Abrir Chamado**: Aciona `openSupport()` do `SupportProvider` (reutilizando formulário atual).
- **Reportar Problema desta Tela**: Aciona `openSupport(currentContext)` capturando metadados da rota ativa.
- **Meus Chamados**: Navega para `/suporte`.
- **Base de Conhecimento**: Navega para `/suporte/conhecimento`.

### 3. Integração com Layout Global
Modificar `src/routes/_authenticated/route.tsx`:
- Renderizar o `SupportFAB` dentro do `SupportProvider`, garantindo que esteja disponível em todas as rotas autenticadas.
- Verificar permissões do usuário via `useSession` para decidir a visibilidade (Supervisor, RH, Super Admin).

### 4. Lógica de Notificações
Adicionar função em `src/lib/support.functions.ts` para buscar contagem de tickets ativos/não lidos do usuário logado para alimentar o badge do FAB.

## Detalhes de Design
- Seguir o MK9 Design System.
- Posicionamento com `z-index` elevado, mas respeitando áreas de Safe Zone para não cobrir CTAs críticas (Enviar, Salvar).

## Homologação
- [ ] FAB visível para perfis autorizados.
- [ ] FAB oculto para perfis não autorizados.
- [ ] Clique em "Abrir Chamado" abre o formulário correto.
- [ ] Clique em "Base de Conhecimento" navega corretamente.
- [ ] Responsividade: Drawer em mobile.
- [ ] Acessibilidade: Navegação por teclado.
