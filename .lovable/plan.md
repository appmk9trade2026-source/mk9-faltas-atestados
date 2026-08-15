# Plano de Estabilização — Etapa 2.1: Auditoria e Homologação da Rede de Regressão

Este plano visa consolidar os resultados da Etapa 2, auditando a cobertura real e documentando as limitações de infraestrutura (E2E) para garantir a integridade do CRM MK9 antes da Etapa 3.

## Auditoria de Testes (95 Testes)

- **Total:** 95 testes passando.
- **Categorização:**
    - **Safe-Read (95):** Validações de rotas, permissões de sidebar (RBAC), contratos de RPC e metadados de storage.
    - **Controlled-Write (0):** Preparado (`nova-ausencia.e2e.ts`), mas pendente de execução.
    - **Contract (13):** `rpc-contracts`, `storage-contract`, `module-contracts`, `duplicidade-contract`.
    - **E2E:** 0 executados (bloqueados por infraestrutura).

## Matriz de Cobertura Real

| MÓDULO | CONTRACT | INTEGRATION | E2E | STATUS |
| :--- | :--- | :--- | :--- | :--- |
| Nova Ausência | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Busca de Matrícula | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Duplicidade | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Atestados | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Upload/Storage | PASSOU | N/A | NÃO EXECUTADO | INFRA PENDENTE |
| /ausencias | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Central de Processamento | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Dashboard | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Relatórios | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Permissões/RBAC | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Qualidade de Lançamentos | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| OCP AMBEV | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |
| Retificação | PASSOU | N/A | NÃO EXECUTADO | CONTRACT OK |

## Auditoria Forense P0 (Duplicidade e Anexos)

### Duplicidade
- **Ativo + Sobreposição:** Bloqueio confirmado via DDL/Trigger audit.
- **Cancelado/Excluído:** Não bloqueio confirmado via contract tests.
- **Detectar Conflitos RPC:** Assinatura de 9 parâmetros validada.

### Anexos
- **Bucket 'atestados':** Existe e é privado (metadata audit).
- **Visibilidade Supervisor:** Função `atestado_path_visivel_para` validada.
- **Órfãos:** 90 registros mapeados para saneamento futuro.

## Impedimentos E2E (Sandbox Infra)
- **Erro:** `exitCode=127` (Missing `libglib-2.0.so.0`).
- **Navegador:** Chromium Headless Shell.
- **Causa Raiz:** Limitação de bibliotecas do sistema operacional no ambiente sandbox da Lovable.
- **Classificação:** INFRAESTRUTURA DE TESTE — NÃO É BUG DO CRM.

## Próximos Passos
1. **Documentação:** Salvar este relatório em `mem://reference/stabilization-stage2-1.md`.
2. **Preservação:** Manter `src/routes/index.tsx` como redirecionamento puro (Guardrail P0).
3. **Homologação:** Etapa 2 considerada "CONTRACT BASELINE HOMOLOGADO".

---
**NÃO iniciar Etapa 3 automaticamente.**
**NÃO alterar regras de negócio ou realizar refatorações.**
