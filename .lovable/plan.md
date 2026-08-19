# Plano de Auditoria Forense Real — Rodada 2 — Etapa 3A

Este plano descreve a execução técnica dos testes de processamento interno para validar a integridade do fluxo de RH.

## Objetivo
Certificar a robustez do processamento de ausências (Central de Processamento), com foco em concorrência, idempotência e integridade server-side.

## Etapas de Execução

### 1. Descoberta do Contrato Real (Discovery)
Mapear a infraestrutura técnica atual:
- **Tabela:** `ausencias`
- **Campos Críticos:** `status_processamento`, `responsavel_processamento_id`, `processamento_iniciado_em`.
- **Server Functions:** `iniciarProcessamentoAdm`, `concluirProcessamentoAdm` em `src/lib/ausencias.functions.ts`.
- **Segurança:** RLS na tabela `ausencias` e RBAC via `requirePermission`.

### 2. Bateria de Testes Operacionais (RH-PROC-001 → 016)

#### RH-PROC-001: Happy Path
- **Cenário:** RH assume e conclui um item elegível.
- **Evidência:** Auditoria `log_audit_event` e transição de status no banco.

#### RH-PROC-002: Concorrência Real (P0)
- **Cenário:** Dois usuários RH tentam assumir o MESMO registro simultaneamente.
- **Validação:** Garantir que apenas um vença e o banco não permita `multiple owners`.
- **Ação:** Script Playwright simulando concorrência HTTP.

#### RH-PROC-004/007: Lost Response & Idempotency
- **Cenário:** Simular falha de rede após o `COMMIT` no banco.
- **Validação:** O retry deve reconhecer o estado anterior e não duplicar a mutação.

#### RH-PROC-011: Proteção de Perfil
- **Cenário:** Supervisor tentando acessar as server functions de processamento.
- **Esperado:** Bloqueio `SERVER-SIDE BLOCKED` via guards.

### 3. Persistência e Regressão
- Atualizar `audit_stability_results` com as evidências coletadas.
- Executar `tsc` e build para garantir que o baseline de "Nova Ausência" permanece íntegro.

## Detalhes Técnicos
- **Audit Run ID:** `RUN-20260819-P0-002`
- **Ambiente:** Sandbox Lovable com fixtures técnicas.
- **Ferramentas:** Playwright (simulação), SQL (inspeção de banco), Logs (auditoria).
