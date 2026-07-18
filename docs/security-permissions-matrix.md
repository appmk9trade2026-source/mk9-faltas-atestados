# CRM MK9 — Matriz de Permissões (Etapa 29B)

Estado após o hardening da **Fase B**. Reflete exatamente os `GRANT EXECUTE`
aplicados no banco. Fonte de verdade em runtime:
`SELECT * FROM public.security_functions_inventory();`

## Legenda

| Categoria     | Roles permitidos              | Motivo                                                                                  |
|---------------|-------------------------------|-----------------------------------------------------------------------------------------|
| TRIGGER       | `service_role`                | Executada apenas por triggers de tabela; nunca chamada diretamente pelo cliente.        |
| CRON_ONLY     | `service_role`                | Chamada apenas pelo `pg_cron`; não deve ser exposta ao frontend.                        |
| INTERNAL      | `authenticated`, `service_role` | Helper interno chamado por RLS, triggers ou outras funções SECDEF.                    |
| ADMIN+CRON    | `authenticated`, `service_role` | Também disparada manualmente pela UI administrativa (com validação interna de papel). |
| ADMIN_RPC     | `authenticated`, `service_role` | RPC administrativa consumida pelo frontend; a função valida papel/RLS internamente.   |

Todas as funções listadas são `SECURITY DEFINER` com `SET search_path = public`.
Nenhuma delas é executável por `anon` ou `PUBLIC`.

## Triggers (service_role apenas)

| Função              | Consumidor           |
|---------------------|----------------------|
| `handle_new_user()` | Trigger auth.users   |
| `tg_audit_row()`    | Triggers de auditoria|
| `tg_incidente_notificar()` | Trigger `oa_incidentes` |
| `tg_roadmap_audit()`| Trigger roadmap      |

## CRON_ONLY (service_role apenas)

| Função                              | Consumidor                          |
|-------------------------------------|-------------------------------------|
| `cron_refresh_bi_absenteismo_tick()`| `pg_cron` — refresh BI a cada 30min |
| `cron_run_escalonamentos_tick()`    | `pg_cron` — motor SLA a cada 5min   |

## INTERNAL (authenticated + service_role)

| Função                                                             | Consumidor                                    |
|--------------------------------------------------------------------|-----------------------------------------------|
| `_obs_can_read()`                                                  | Chamada por RPCs de Observabilidade           |
| `has_role(uuid, app_role)`                                         | RLS e RPCs                                    |
| `is_active_user(uuid)`                                             | RLS                                           |
| `log_audit_event(...)`                                             | RPCs de auditoria                             |
| `materializar_notificacao(...)`                                    | Motor V2                                      |
| `materializar_destinatarios(uuid)`                                 | Motor V2 (legado)                             |
| `preferencia_notificacao_efetiva(uuid, notif_tipo, notif_severidade)` | Motor V2                                    |
| `bootstrap_first_super_admin()`                                    | `useSession` no primeiro login                |

## ADMIN + CRON (authenticated + service_role)

| Função                                | Consumidor                                                     |
|---------------------------------------|----------------------------------------------------------------|
| `refresh_bi_absenteismo(text)`        | Botão manual (BI) + `cron_refresh_bi_absenteismo_tick`         |
| `run_escalonamentos(text)`            | Botão manual (Notificações) + `cron_run_escalonamentos_tick`   |
| `processar_escalonamentos_pendentes()`| Ação administrativa                                            |
| `reprocessar_escalonamentos()`        | Ação administrativa                                            |

## ADMIN_RPC (authenticated + service_role)

Toda função abaixo valida papel/permissão internamente antes de retornar dados.

- `acessos_dashboard()`
- `analisar_conflitos_regras_escalonamento()`
- `arquivar_notificacao(uuid)`
- `atualizar_preferencia_notificacao(notif_tipo, boolean, boolean)`
- `automacao_config_atualizar(...)`
- `automacao_status()`
- `bi_analisar_tendencias(jsonb)`
- `bi_detectar_variacoes_atipicas(jsonb)`
- `bi_executivo_consultar(jsonb)`
- `bi_healthcheck()`
- `bi_recorrencia_consultar(jsonb)`
- `contar_notificacoes_nao_lidas()`
- `criar_notificacao(...)`
- `cron_healthcheck()`
- `database_healthcheck()`
- `database_indices_report()`
- `database_performance()`
- `database_slow_queries(integer, integer)`
- `gerar_campanha_revisao(integer)`
- `listar_notificacoes_usuario(notif_status_usuario, integer, integer)`
- `listar_preferencias_notificacao()`
- `marcar_notificacao_como_lida(uuid)`
- `metricas_notificacoes()`
- `notificacoes_motor_healthcheck()`
- `oa_dashboard(uuid)`
- `oa_incidente_transicionar(...)`
- `oa_periodo_encerrar(uuid, text)`
- `oa_periodo_prorrogar(uuid, date, text)`
- `observabilidade_registrar_execucao(text, jsonb)`
- `operacoes_dashboard()`
- `operacoes_health_check()`
- `plataforma_health_score()`
- `registrar_login_event(...)`
- `registrar_solicitacao_backup(text)`
- `restaurar_preferencias_padrao()`
- `revogar_sessao(uuid, text)`
- `roadmap_dashboard()`
- `saude_sistema()`
- `security_functions_inventory()`
- `simular_regras_escalonamento(jsonb)`

## Exceções justificadas

Nenhuma. Zero funções administrativas mantêm `EXECUTE` para `anon` ou `PUBLIC` após a Fase B.
