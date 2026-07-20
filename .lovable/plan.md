# Limpeza controlada — preparação para produção

Nada foi excluído. Este plano precisa de aprovação antes da execução.

## Fase 1 — Inventário (situação atual)

### A. Configuração / mestre — PRESERVAR (não tocar em dados)

| Tabela | Registros | Observação |
|---|---:|---|
| empresas | 3 | R&G, R&J, CZB |
| projetos | 33 | todos ativos |
| projeto_protocolo_sequencias | 1 | preservar (mantém continuidade dos protocolos) |
| profiles | 2 | automacaomk9 (super_admin), coordenadormk9 (compliance) |
| user_roles | 2 | preservar |
| usuario_empresas | 1 | vínculo do admin — preservar |
| usuario_projetos | 1 | vínculo do admin — preservar |
| categorias_ausencia | 6 | catálogo |
| tipos_ausencia | 19 | catálogo |
| opcoes_periodo_ausencia | 29 | catálogo |
| tipo_ausencia_opcoes_periodo | 189 | catálogo |
| alertas_configuracoes | 7 | regras |
| regras_escalonamento | 6 | regras |
| notificacao_tipos_config | 19 | catálogo |
| automacao_config | 1 | config |
| bi_config | 1 | config |
| whatsapp_provider_config | 1 | Evolution API — preservar |
| whatsapp_templates | 6 | preservar |
| whatsapp_destinatario_config | 0 | — |
| whatsapp_test_recipients | 0 | — |
| go_live_checklist | 15 | checklist de produção — preservar |
| homologacoes | 49 | cenários UAT — preservar |

### B. Transacionais — LIMPAR

| Tabela | Registros | Ação |
|---|---:|---|
| colaboradores | 320 | apagar todos (base de teste/importação) |
| importacoes | 3 | apagar |
| ausencias | 3 | apagar (todas LANCADO de teste) |
| audit_logs | 1.761 | apagar |
| operacao_alertas | 612 | apagar |
| escalonamento_execucoes | 1.844 | apagar |
| bi_absenteismo_diario | 3 | apagar (recalculado pelo BI) |
| bi_refresh_execucoes | 127 | apagar |
| whatsapp_outbox | 3 | apagar |
| whatsapp_outbox_eventos | 11 | apagar (cascata do outbox) |
| whatsapp_worker_execucoes | 2 | apagar |
| alertas | 0 | — |
| alertas_eventos | 0 | — |
| comunicacoes | 0 | — |
| notificacoes / notificacao_* | 0 | — |
| login_events / user_sessions / access_reviews | 0 | — |
| backup_logs / backup_execution_events | 0 | — |
| operacao_incidentes e filhos | 0 | — |
| release* / roadmap | 0 | — |

### Storage
- Bucket `ausencias` (anexos) — apagar todos os objetos (nenhuma ausência real).

## Fase 2 — Preservar (confirmado)
Empresas, projetos, protocolos, perfis, roles, vínculos, templates WhatsApp, provider Evolution, catálogos de ausência, regras de alerta/escalonamento, configs, homologações, checklist, funções, triggers, RLS, policies, migrations, cron jobs.

## Fase 3 — Ordem de execução (respeitando FKs)

```text
1. storage.objects (bucket 'ausencias')
2. whatsapp_outbox_eventos
3. whatsapp_outbox
4. whatsapp_worker_execucoes
5. escalonamento_execucoes
6. operacao_alertas
7. alertas_eventos → alertas
8. comunicacoes
9. ausencias
10. audit_logs
11. bi_refresh_execucoes
12. bi_absenteismo_diario
13. importacoes
14. colaboradores
```

Todas as remoções via `DELETE` (não TRUNCATE), em migração única e transacional.

## Fase 4 — Sequências
- Sem `SERIAL/BIGSERIAL` no domínio; IDs são UUID.
- `projeto_protocolo_sequencias` **não será resetada** (mantém continuidade dos protocolos por projeto/ano, conforme regra).

## Fase 5 — Verificações pós-limpeza
- Contagem zerada nas tabelas alvo.
- Contagem intacta em empresas, projetos, templates, provider, catálogos, roles, profiles.
- `SELECT` de sanidade em FKs (colaboradores→empresa/projeto, ausencias→colaborador) retorna 0 órfãos.
- Cron jobs (`cron.job`) listados e ativos.
- Provider WhatsApp `ativo=true` mantido.

## Fase 6 — Relatório final
Após execução, entrego tabela com: alvo, registros antes, registros depois, status.

## Riscos
- **coordenadormk9 (compliance)**: manter? confirmar. Se for conta de teste, incluir a remoção do profile + user_roles + auth.users via RPC admin.
- Anexos no storage serão perdidos definitivamente (não há ausências reais).
- `homologacoes` (49) e `go_live_checklist` (15): mantidos como catálogo; se quiser zerar evidências de testes, avisar.

## Aprovação
Responda **"aprovado"** para eu gerar a migração de limpeza e executar. Se quiser ajustes (ex.: manter algum colaborador, remover coordenadormk9, zerar homologações), me diga antes.
