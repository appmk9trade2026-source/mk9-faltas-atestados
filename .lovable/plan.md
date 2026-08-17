# Plano: P0 — Diagnóstico e Correção do Crash em /saude-sistema

## Problema
A rota `/saude-sistema` apresentava um crash fatal (Error Boundary) logo após o carregamento. O erro no console indicava uma violação das "Rules of Hooks" do React: "Rendered more hooks than during the previous render".

## Causa Raiz
A função `SaudeSistemaPage` continha lógica de proteção que retornava prematuramente (`return null` ou `<Navigate />`) baseada no estado de carregamento da sessão. No entanto, diversos hooks `useState` e `useQuery` estavam declarados **após** esse retorno condicional. No React, o número e a ordem dos hooks devem ser idênticos em todas as renderizações.

## Diagnóstico Realizado
1. **Mint de Sessão:** Realizado login via sandbox com o usuário Super Admin `automacaomk9@gmail.com`.
2. **Reprodução:** Script Playwright confirmou o erro de hooks no console.
3. **Análise de Código:** Identificada a quebra da regra de hooks no arquivo `src/routes/saude-sistema.tsx`.

## Ações Executadas
- [x] **Correção Cirúrgica de Hooks:** Movidos os hooks `useState`, `useQueryClient`, `useQuery` e `useMutation` para o topo da função `SaudeSistemaPage`.
- [x] **Proteção de Queries:** Adicionada a propriedade `enabled: !loading && isSuperAdmin` em todas as queries para evitar execuções desnecessárias ou sem permissão antes da hidratação da sessão.
- [x] **Validação Forense:** Script Playwright confirmou que a página agora carrega corretamente (`Status 200`) sem erros de console.

## Próximos Passos
- Monitorar a telemetria do painel de saúde para confirmar a recepção de dados reais.
- Prosseguir com a Etapa 8.14 (Certificação de novo Recipient Físico) assim que os dados estiverem disponíveis.

---
**Protocolo:** P0-HEALTH-CRASH-FIX-20260816-001
**Status:** Homologado em Sandbox.
