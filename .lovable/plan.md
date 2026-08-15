# Programa de Estabilização Geral — Etapa 2
## Implementação da Rede de Proteção

### Etapa 2 — Classificação de Testes
Vou estruturar a pasta `tests/` para refletir a classificação:
- `tests/safe-read/`: Smoke tests e validações estáticas (Rotas, Sidebar).
- `tests/controlled-write/`: Testes que realizam mutações (Nova Ausência, Duplicidade).

### Etapa 3 — Regressão P0: Nova Ausência
Vou implementar `tests/controlled-write/nova-ausencia.e2e.mjs` utilizando Playwright.
**Cenários:**
1. **FALTA**: Lançamento com sucesso de uma falta.
2. **ATESTADO**: Lançamento com sucesso de um atestado (com upload).
3. **VALIDAÇÃO**: Verificação de campos obrigatórios e feedback de erro.

### Etapa 4 — Regressão Crítica de Duplicidade
Vou implementar `tests/controlled-write/duplicidade.e2e.mjs`.
**Cenários:**
1. **ATIVO**: Deve bloquear duplicidade real.
2. **CANCELADO/EXCLUIDO**: Deve permitir novo lançamento no mesmo período.
3. **OUTRO COLABORADOR**: Deve permitir lançamento no mesmo período.

### Etapa 5 — Teste de Contrato RPC
Vou implementar `tests/safe-read/rpc-contracts.test.ts` (Vitest) para auditar `detectar_conflitos_ausencia` e `dashboard_metrics`.

---
**Critérios de Segurança:**
- Utilização de `assertMutableEnv`.
- Prefixos `TEST_E2E_` em todos os registros.
- Limpeza de dados de teste (exclusão lógica/cancelamento) após a execução.
