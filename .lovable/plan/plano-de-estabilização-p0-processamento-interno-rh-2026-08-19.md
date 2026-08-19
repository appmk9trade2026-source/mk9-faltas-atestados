# Plano de Estabilização: P0 Processamento Interno / RH

Diagnóstico forense e remediação do erro de HTML bruto reportado durante o processamento administrativo (Protocolo AMBEVASD-20260810-000023).

## 1. Diagnóstico Forense (Concluído)
- **Status da Persistência:** Inalterado (AGUARDANDO).
- **Causa Raiz:** Crash de Runtime Server-side no TanStack Start, resultando em resposta `text/html` (documento raiz) em vez de JSON.
- **Identificação da Falha:** Provável `MISSING_EXPORT` ou instabilidade de bundle no módulo `src/lib/ausencias.functions.ts` após splitting.

## 2. Ações de Remediação
- **Hardening de Imports:** Mover os schemas Zod de processamento para `src/lib/ausencias.schemas.ts` para garantir estabilidade no bundle.
- **Implementação do HTML Guard:** Adicionar proteção no frontend da Central de Processamento para interceptar e sanitizar respostas que não sejam JSON.
- **Hardening de Erros:** Ajustar o `onError` das mutações na `CentralProcessamentoPage` para exibir mensagens técnicas limpas com Trace ID.

## 3. Verificação e Homologação
- **Teste de Build:** Garantir exportação limpa das server functions.
- **Teste de Fixture:** Simular a ação "Assumir" em um registro de teste controlado.
- **Auditoria:** Confirmar geração de Audit Log após a correção.

## Detalhes Técnicos
- Arquivos afetados: `src/lib/ausencias.functions.ts`, `src/routes/_authenticated/processamento.tsx`.
- Proteção: A implementação do HTML Guard impedirá que o usuário veja código bruto na tela em caso de falhas futuras de infraestrutura.
