# Módulo Inteligência de Absenteísmo — Entrega fatiada

Vou entregar por etapas, cada uma testável e reversível. Esta primeira entrega cobre **Etapa 1 + fundação de navegação**. As etapas 2 a 9 virão nas próximas rodadas, cada uma validada por você antes da próxima.

## Regras invariantes (valem para todas as etapas)

- **Nunca** alterar RLS, RBAC ou matriz de permissões existentes.
- Todas as novas RPCs em `SECURITY INVOKER` — os rankings herdam automaticamente o escopo do Supervisor (`supervisor_usuario_id = auth.uid()`), RH/Compliance/Super Admin/Visualizador seguem regras atuais.
- CID nunca aparece para papéis não autorizados (respeitando policy atual de `ausencias`).
- Nada de indicador punitivo: sempre taxa/média proporcional, nunca só absoluto.
- Zero regressão: não altero tabelas ou funções existentes; apenas adiciono.

## Entrega 1 (esta rodada) — Fundação + Etapa 1

### Backend

Nova tabela `public.absenteismo_config` (singleton, Super Admin edita):
- pesos por tipo base: `peso_falta`, `peso_atestado`, `peso_declaracao`, `peso_acidente_trabalho`, `peso_acidente_trajeto`, `peso_suspensao`, `peso_outros`
- `peso_dia_perdido` (multiplicado por dias)
- `peso_reincidencia` (bônus quando 3+ ocorrências em 30d)
- `janela_dias` (padrão 90)
- limiares: `limiar_atencao`, `limiar_alta`, `limiar_critica`
- audit trigger + `updated_at`
- RLS: SELECT para authenticated, UPDATE só Super Admin
- Seed inicial com os padrões abaixo

Padrões iniciais sugeridos (editáveis pela UI depois):
```
falta=3, atestado=1, declaracao=1, suspensao=4,
acidente_trabalho=6, acidente_trajeto=4, outros=1,
peso_dia_perdido=0.5, peso_reincidencia=3, janela=90d
limiares: <5 Baixa, 5–10 Atenção, 11–20 Alta, >20 Crítica
```

Nova RPC `public.calcular_score_colaborador(_colaborador_id uuid, _janela_dias int default null)`:
- `SECURITY INVOKER` — só retorna se o caller enxerga o colaborador via RLS
- lê config, agrega ausências na janela, devolve `{ score numeric, nivel text, breakdown jsonb, ultima_ocorrencia timestamptz }`

Nova RPC `public.calcular_score_colaboradores_lote(_empresa_id uuid?, _projeto_id uuid?)`:
- devolve `SETOF` com score de cada colaborador visível ao caller (batch para o ranking futuro)

### Frontend

Nova entrada de menu **"Inteligência"** com sub-rotas (só as duas primeiras já ativas nesta rodada; demais renderizam placeholder até implementarem):

```
/inteligencia                → redireciona para /inteligencia/colaboradores
/inteligencia/configuracao   → UI de pesos/limiares (Super Admin)
/inteligencia/colaboradores  → placeholder (Etapa 2)
/inteligencia/supervisores   → placeholder (Etapa 3)
/inteligencia/executivo      → placeholder (Etapa 4)
/inteligencia/alertas        → placeholder (Etapa 5)
```

- Sidebar: novo item com ícone `Brain` / `Activity`, visível para roles que já veem BI/Dashboard (Super Admin, RH, Compliance, Supervisor). Sub-item "Configuração" só para Super Admin.
- Tela **Configuração**: form com sliders/inputs para cada peso, janela, e 3 limiares; preview do card de níveis (Baixa/Atenção/Alta/Crítica) com cores oficiais 🟢🟡🟠🔴.
- Badge/utilitário reutilizável `<CriticidadeBadge nivel="..." />` para as próximas etapas.

### Testes

- RPC de score retorna zero quando não há ausências.
- Supervisor sem colaborador → RPC lote devolve vazio.
- Alteração de peso na config muda o score no próximo cálculo.

## Etapas seguintes (rodadas futuras, uma por vez)

- **Etapa 2** — Ranking de Colaboradores com filtros/ordenação + badge de criticidade.
- **Etapa 3** — Ranking de Supervisores com métricas proporcionais e SLA.
- **Etapa 4** — Dashboard Executivo com widgets Top 10 e evolução 12 meses.
- **Etapa 5** — Alertas inteligentes com limiares parametrizáveis.
- **Etapa 6** — Aba Análise no perfil do colaborador.
- **Etapa 7** — Inteligência executiva (Top Empresas/Projetos/CID/crescimento).
- **Etapas 8+9** — Auditoria final de RLS por rota + otimização (materialized view só se medir gargalo real).

## O que NÃO vou fazer

- Não crio ranking punitivo nem exposição de dados que fujam da RLS.
- Não toco em `ausencias`, `colaboradores`, `user_roles`, ou qualquer policy existente.
- Não crio materialized view agora — só se a Etapa 4 mostrar necessidade real.
- Não exponho CID em rankings; se aparecer, filtro pela mesma regra da tela atual.

Confirma que posso executar **Entrega 1** exatamente assim?
