## Reestruturação — Dashboard Executivo · Governança · Qualidade

Antes de tocar em ~4.300 linhas de código, quero alinhar o plano. Nada de banco, RLS, RBAC, RPC ou score muda — apenas rearranjo de UI/rotas/queries existentes.

### Estado atual

- `inteligencia.dashboard.tsx` (Dashboard Executivo) — KPIs, evolução, heatmap, rankings, tipos, tendências. Já é o "executivo".
- `inteligencia.governanca.tsx` — 1.590 linhas, **4 abas**: `governanca` (fluxo alertas + SLA + operação), `qualidade` (integridade dos dados + reconciliação), `eficiencia`, `auditoria` + painéis de insights e saúde. É a origem da sobreposição.
- Sidebar aponta para "Governança & Qualidade" (item único).

### Mudanças propostas

**ETAPA 1 — Dashboard Executivo (`inteligencia.dashboard.tsx`)**
- Auditar cabeçalho e remover qualquer bloco operacional/qualidade que tenha vazado (SLA, contadores de alertas, integridade). Preservar KPIs, comparação PoP, evolução, heatmap, distribuição de criticidade, rankings, tipos, tendências, drill-downs.
- Adicionar subtítulo "Visão estratégica do absenteísmo." + navegação lateral para Governança e Qualidade.

**ETAPA 2 — Governança (`inteligencia.governanca.tsx` reescrita como painel operacional)**
- Remover a aba `qualidade` (migrada para nova rota) e os blocos de insights/rankings que duplicam o executivo.
- Reorganizar em 4 seções (tabs ou blocos empilhados com identidade "workflow/timeline"):
  1. **Fluxo dos Alertas** — abertos, em análise, resolvidos, ignorados, reabertos, pendentes.
  2. **SLA** — tempo médio até assumir/resolver, vencidos, backlog, cumprimento.
  3. **Operação** — alertas por RH, supervisor, empresa, projeto, volume por período.
  4. **Auditoria** — últimas alterações, comentários, mudanças de status, histórico resumido.
- Subtítulo "Acompanhamento operacional dos processos e alertas."
- Reutiliza queries já existentes em `buildGovernanca` / `buildAuditoria`.

**ETAPA 3 — Qualidade dos Dados (nova rota `inteligencia.qualidade.tsx`)**
- Nova rota separada (mesmo gate de roles atual da aba qualidade: RH, Compliance, Super Admin; supervisor vê empty state).
- Categorias (cards + listas com badges/checklist):
  - **Cadastros** — colaboradores sem supervisor / empresa / projeto; supervisores sem equipe.
  - **Vínculos** — supervisor inexistente, empresa/projeto inválidos, órfãos.
  - **Importação** — última importação, linhas rejeitadas, erros, divergências.
  - **Reconciliação** — botões "Reconciliar Supervisores" e "Reprocessar por planilha" (já existentes) + histórico das últimas execuções.
  - **Configuração** — configs ausentes/inválidas (a partir de `absenteismo_config` e checks já existentes).
- Reutiliza a `buildQualidade` já implementada; drill-downs para cadastros de colaborador.
- Subtítulo "Monitoramento da integridade e consistência das informações."

**ETAPA 4 — Navegação**
- Adicionar um "IntelligenceNav" compartilhado no topo das 3 telas com links entre Executivo ↔ Governança ↔ Qualidade + subtítulo.
- Atualizar `app-sidebar.tsx`: separar "Governança" e "Qualidade dos Dados" em dois itens (ambos sob "Inteligência").

**ETAPA 5 — Drill-down**
- Cards de qualidade linkam para telas analíticas apropriadas (colaboradores, alertas). Cards de governança linkam para `/inteligencia/alertas?...`.

**ETAPA 6 — UX / identidade**
- Executivo: ícones analíticos (Gauge, TrendingUp), gráficos.
- Governança: ícones de workflow (Timer, Activity, Clock, GitBranch), timeline visual, cards de SLA.
- Qualidade: badges de severidade, listas de inconsistências, checklists, botões de ação corretiva.
- Todos usando tokens MK9 já em `src/styles.css` e `src/lib/mk9-palette.ts`.

**ETAPAS 7-8 — Segurança e testes**
- Zero mudança em RLS/RBAC/score/RPCs/`useSessionScope`.
- Rodar `bun typecheck` e `bun test:unit` (a suíte de rotas em `tests/unit/routes.test.ts` precisará conhecer a nova rota `inteligencia.qualidade`).

### Arquivos afetados

- `src/routes/_authenticated/inteligencia.dashboard.tsx` — remoção de blocos duplicados + subheader/nav.
- `src/routes/_authenticated/inteligencia.governanca.tsx` — reescrita focada em operação (mantendo dataset builders existentes; remover aba qualidade e blocos redundantes).
- `src/routes/_authenticated/inteligencia.qualidade.tsx` — **novo**, extraído do `QualidadeTab` atual + expansão em categorias.
- `src/components/inteligencia/intelligence-nav.tsx` — **novo**, sub-nav compartilhada + subtítulo.
- `src/components/layout/app-sidebar.tsx` — separar itens.
- `tests/unit/routes.test.ts` — registrar a nova rota.

### Pontos que quero confirmar antes de codar

1. **Rota nova "Qualidade dos Dados"**: OK criar `/inteligencia/qualidade` como rota separada (em vez de manter tudo em abas dentro de Governança)? A spec descreve "cada tela" com identidade própria, então assumo que sim.
2. **Aba "Eficiência" e painéis de "Insights Executivos" / "Saúde do Módulo"** hoje dentro de Governança: mover para Dashboard Executivo (Insights) e manter Saúde do Módulo em Governança (é operacional). OK?
3. **Sidebar**: separo "Governança" e "Qualidade dos Dados" em dois itens ou mantenho um único "Governança & Qualidade" que abre a Governança e navega dali? Vou por dois itens separados salvo indicação contrária.

Se essas 3 premissas estiverem OK, executo. Caso contrário, ajuste antes de aprovar.
