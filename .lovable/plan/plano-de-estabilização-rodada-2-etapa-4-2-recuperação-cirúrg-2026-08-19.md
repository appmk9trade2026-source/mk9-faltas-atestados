# Plano de Estabilização: Rodada 2 — Etapa 4.2 (Recuperação Cirúrgica do Baseline — Nova Ausência)

Este plano descreve a execução da **Etapa 4.2**, focada na restauração dos resultados de auditoria para o fluxo `nova_ausencia` após a detecção de um `RESET_ACCIDENTAL`.

## Objetivo
Restaurar a integridade técnica do baseline `RUN-20260819-P0-001-R1` no dashboard de estabilidade, revertendo o `DATA_DRIFT` identificado na Etapa 4.1.

## Fases de Execução

### 1. Backup Forense e Análise
- Consultar registros atuais de `nova_ausencia` para as runs `RUN-20260819-P0-001-R1` e `RUN-20260819-P0-002`.
- Mapear gates `RECOVERABLE` (com evidência histórica inequívoca no baseline).

### 2. Migration de Recuperação Cirúrgica
- Executar `UPDATE` no banco de dados para o fluxo `nova_ausencia` e run `RUN-20260819-P0-002`.
- Restaurar estados `PASS` e evidências baseadas no baseline homologado.
- Registrar evento de auditoria `BASELINE_RECOVERY`.

### 3. Reconciliação e Validação UI
- Verificar se o progresso de "Nova Ausência" retornou a 100% (ou valor calculado real).
- Confirmar que fluxos de `ocorrencia_ponto` e `processamento_interno` não foram afetados.
- Realizar check de build e tipos.

### 4. Relatório Final
- Emitir relatório consolidado em `src/routes/_authenticated/estabilidade.lazy.tsx`.

## Detalhes Técnicos
- **Tabela:** `public.audit_stability_results`
- **Source Baseline:** `RUN-20260819-P0-001-R1`
- **Target Run:** `RUN-20260819-P0-002`
- **Filtro Crítico:** `flow_id = 'nova_ausencia'`
