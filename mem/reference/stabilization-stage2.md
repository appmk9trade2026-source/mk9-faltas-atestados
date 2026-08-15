---
name: crm-mk9-stabilization-stage2
description: Detailed roadmap for Stage 2 of the Stabilization Program - Regression Protection.
type: reference
---
# CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO GERAL
## ETAPA 2 — REDE DE PROTEÇÃO CONTRA REGRESSÕES

### CONTEXTO
A Etapa 1 do Programa de Estabilização Geral já foi concluída.
O baseline atual do sistema foi estabelecido.
Também foi encerrado e homologado o incidente P0 de falso conflito de duplicidade envolvendo a matrícula 2625.

### REGRA DE NEGÓCIO HOMOLOGADA:
- Registro ATIVO com sobreposição real → DEVE BLOQUEAR.
- Registro CANCELADO → NÃO DEVE BLOQUEAR.
- Registro EXCLUIDO → NÃO DEVE BLOQUEAR.
- Registro SUBSTITUIDO/SUBSTITUIDA → NÃO DEVE BLOQUEAR.

### OBJETIVO
Implementar e executar uma suíte de regressão dos fluxos críticos do CRM MK9.
A prioridade é: PROTEGER O QUE JÁ FUNCIONA.

### ESTRUTURA DA ETAPA 2
1. **ETAPA 1 — INVENTÁRIO DA INFRAESTRUTURA DE TESTES**: Auditar infra atual (Playwright, Vitest, scripts, etc.).
2. **ETAPA 2 — SEPARAR TESTES DE LEITURA E ESCRITA**: Classificar como SAFE READ ou CONTROLLED WRITE.
3. **ETAPA 3 — REGRESSÃO P0: NOVA AUSÊNCIA**: Cobertura permanente para /nova-ausencia.
4. **ETAPA 4 — REGRESSÃO CRÍTICA DE DUPLICIDADE**: Testar os 6 cenários de duplicidade (Ativo, Cancelado, Excluído, etc.).
5. **ETAPA 5 — TESTE DE CONTRATO DAS FUNÇÕES DE DUPLICIDADE**: Impedir regressão de overload de RPC.
6. **ETAPA 6 — ANEXOS / STORAGE**: Garantir que novos órfãos = 0.
7. **ETAPA 7 — AUSÊNCIAS**: Testar visualização e filtros em /ausencias.
8. **ETAPA 8 — CENTRAL DE PROCESSAMENTO**: Validar contagem de pendências vs Drawer.
9. **ETAPA 9 — DASHBOARD**: Smoke test para dashboard_metrics e proteção contra regressão de GROUP BY.
10. **ETAPA 10 — PERMISSÕES / RBAC**: Teste de contrato para rbac_apply_role_matrix.
11. **ETAPA 11 — QUALIDADE DE LANÇAMENTOS**: Smoke test para rel_qualidade_lancamentos.
12. **ETAPA 12 — OCP AMBEV**: Validar vínculo atômico OCP -> Ausência.
13. **ETAPA 13 — RETIFICAÇÃO**: Validar histórico e auditoria.
14. **ETAPA 14 — RELATÓRIOS**: Smoke tests para rel_faltas e rel_atestados.
15. **ETAPA 15 — MATRIZ DE PERFIS**: Validar fluxos com perfis Super Admin, Coordenador, Supervisor e RH.
16. **ETAPA 16 — TESTES DE ERROS**: Testar caminhos de falha (matrícula inexistente, permissão negada, etc.).
17. **ETAPA 17 — ZERO ALTERAÇÃO FUNCIONAL DESNECESSÁRIA**: Proteção contra "scope creep" técnico.
18. **ETAPA 18 — GUARDRAIL HOME**: src/routes/index.tsx deve ser REDIRECT PASSOU.
19. **ETAPA 19 — UI DOS TESTES**: Infra de testes externa ao CRM.
20. **ETAPA 20 — EXECUÇÃO COMPLETA**: Relatório final de homologação.
