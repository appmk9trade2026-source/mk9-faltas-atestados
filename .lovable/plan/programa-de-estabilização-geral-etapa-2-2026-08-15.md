# Programa de Estabilização Geral — Etapa 2
## Rede de Proteção Contra Regressões

### Status: Etapa 1 Concluída (Inventário da Infraestrutura)

O inventário da infraestrutura de testes foi realizado com sucesso. A stack atual é robusta o suficiente para suportar a suíte de regressão sem a necessidade de instalar novas ferramentas.

#### Inventário:
- **Playwright**: Presente em `tests/smoke/smoke.mjs` (scripts smoke read-only).
- **Testes Unitários**: Presentes em `tests/unit/` (validação de rotas e permissões de sidebar).
- **Testes de Integração**: Presentes em `tests/unit/` (lógica de parsing de componentes).
- **Scripts package.json**: `test`, `test:unit`, `test:smoke`, `test:e2e` (placeholder), `check` (CI baseline).
- **Fixtures**: `tests/setup.ts` configurado.
- **Helpers de Autenticação**: Implementados em `smoke.mjs`; utiliza `TEST_USER_EMAIL` e `TEST_USER_PASSWORD`.
- **Sessões Salvas**: Efêmeras durante a execução dos testes.
- **Usuários de Teste**: Dependem de variáveis de ambiente no ambiente de preview/homologação.
- **Mocks**: `jsdom` configurado para Vitest.
- **Ambiente de Teste**: `vitest.config.ts` e `vite.config.ts` integrados; proteção via `test-guard.ts` ativa.
- **CI/CD**: Script `bun run check` pronto para execução em pipelines.

### Próximos Passos:
- **Etapa 2**: Classificar testes existentes e novos como SAFE READ ou CONTROLLED WRITE.
- **Etapa 3**: Iniciar implementação da cobertura de regressão para o fluxo "Nova Ausência".

---
**Guardrail P0**: `src/routes/index.tsx` permanece como um redirecionamento puro para `/dashboard`. Nenhuma documentação técnica foi inserida na interface pública.
