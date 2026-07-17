# CRM MK9 — Suíte de Testes Automatizados (Etapa 16)

## Ferramentas
- **Vitest 4** + **@testing-library/react** — unitários e integração de componentes.
- **jsdom** — DOM em Node para os unitários.
- **Playwright** (via sandbox) — smoke tests e cenários E2E não destrutivos.

## Estrutura
```
tests/
├── setup.ts                       # bootstrap dos unitários
├── unit/
│   ├── routes.test.ts             # ETAPA 1 — todas as rotas críticas registradas
│   ├── sidebar-permissions.test.tsx  # ETAPA 2 — permissões por perfil
│   └── test-guard.test.ts         # guard de ambiente para testes destrutivos
└── smoke/
    └── smoke.mjs                  # ETAPA "smoke" — Playwright, somente leitura
```

## Scripts
| Script          | O que faz                                                              |
| --------------- | ---------------------------------------------------------------------- |
| `bun test`      | Alias de `test:unit`.                                                  |
| `bun test:unit` | Vitest — rotas, sidebar por perfil, guard de ambiente.                 |
| `bun test:smoke`| Playwright — abre rotas públicas + autenticadas (se houver credencial).|
| `bun test:e2e`  | Placeholder para fluxos completos (ver "Pendências" abaixo).           |
| `bun typecheck` | `tsgo --noEmit`.                                                       |
| `bun check`     | typecheck → unit → smoke → build. Executar antes de publicar.          |

## Guard de Produção (`src/lib/test-guard.ts`)
- `assertMutableEnv(url)` **falha hard** contra qualquer host `*.lovable.app` que
  não seja preview (`id-preview--*` ou `*-dev.lovable.app`).
- Todo fluxo destrutivo (Etapa 3 A/B/C/D) deve chamar `assertMutableEnv` antes
  de criar dados.
- Dados de teste devem usar os prefixos `AUTOMATED_TEST_`, `E2E_` ou `TEST_`
  (helper `isTestArtifact`) para permitir filtragem em Auditoria.

## Auditoria
Registros gerados por automação usam a origem lógica `AUTOMATED_TEST`
(constante `AUDIT_ORIGIN`) para que a página `/auditoria` possa filtrá-los.
`audit_logs` permanece imutável — testes nunca deletam registros.

## Segurança
- Nenhuma credencial no repositório: `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` vêm de env.
- `smoke.mjs` filtra do console qualquer linha contendo `access_token`,
  `refresh_token` ou `password` antes de gravar.
- Screenshots ficam em `test-results/smoke/` (não versionado).

## Pendências para validação manual
- **Fluxos E2E completos (A–D)**: dependem de credencial + dataset preview.
  Esqueleto do runner Playwright fica em `tests/smoke/smoke.mjs`; o corpo dos
  fluxos deve ser adicionado após criarmos usuários de teste dedicados no
  ambiente de homologação.
- **Rotas `/sistema/*`**: o backlog cita `/sistema/saude`, `/sistema/documentacao`,
  `/sistema/homologacao`, mas o app hoje usa `/saude`, `/documentacao`,
  `/homologacao`. Os testes cobrem as URLs reais; alinhar a nomenclatura é
  decisão de produto.
- **Cobertura de código**: `@vitest/coverage-v8` não foi mantido para não
  aumentar dependências; reintroduzir se o time exigir relatório de cobertura.
