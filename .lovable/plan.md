# Plano de Homologação — Etapa 3.1: Observabilidade

## 1. Validar Correlação do Trace ID
Confirmar a invariável: **Uma Operação = Um Trace ID**.
Evidência: Capturar logs de uma única tentativa de `Nova Ausência` e validar que `RESOLVE_COLABORADOR`, `CHECK_CONFLICT` e `CREATE_ABSENCE` compartilham o mesmo `trace_id`.

## 2. Teste Controlado — Nova Ausência
Provocar erro de validação (ex: matrícula inexistente) e confirmar:
- Trace ID gerado e retornado à UI.
- Log persistido no `audit_logs` com estágios corretos.
- Sanitização de dados sensíveis aplicada.

## 3. Teste Controlado — Dashboard
Simular falha na captura de métricas e validar:
- Toast de erro exibe Trace ID abreviado.
- Log persistido com categoria `DATABASE` ou `RPC_CONTRACT`.
- Ausência de "skeleton infinito".

## 4. Teste Controlado — Permissões
Validar erro no fluxo RBAC:
- Log persistido com `trace_id`.
- Erro técnico sanitizado.
- Matriz real preservada.

## 5. Busca por Trace ID
Testar a RPC `searchByTraceId`:
- Super Admin: Acesso permitido aos detalhes técnicos.
- Supervisor: Acesso bloqueado (via RLS/Política).

## 6. Auditoria de Sanitização
Inspecionar `audit_logs` para garantir ausência de:
- Tokens de acesso/refresh.
- Cookies.
- Senhas.
- Dados clínicos (CID).
- Stack traces ou SQL bruto.

## 7. Regressão Obrigatória
Executar suíte de testes (Vitest):
- Baseline: 95 testes passando.
- Novos testes: Geração, Reutilização, Persistência e Sanitização do Trace ID.

## Guardrails
- `src/routes/index.tsx` permanece um redirecionamento puro (P0).
- Nenhuma feature de negócio ou refatoração funcional permitida nesta etapa.
