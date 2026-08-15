# Plano de Implementação - Etapa 6: Alertas Inteligentes P0/P1

Implementação da engine de decisão de alertas com deduplicação, cooldown e escalonamento técnico.

## User Review Required

> [!IMPORTANT]
> A rota `/` (`src/routes/index.tsx`) será mantida como um redirecionamento puro para `/dashboard`, respeitando o **Guardrail P0**. A documentação técnica da Etapa 6 será mantida apenas em memória e logs.

## Proposta Técnica

### 1. Banco de Dados (PostgreSQL)
*   Criar tabela `public.operational_alerts` para persistência das decisões de alerta.
*   Campos: `id`, `incident_id` (FK), `fingerprint`, `severity`, `status` (PENDING, SUPPRESSED, READY, ESCALATED, CLOSED), `decision_reason`, `last_alerted_at`, `alert_count`, `escalation_level`.
*   Políticas de RLS: Acesso restrito a `super_admin` e `service_role`.

### 2. Engine de Decisão (`src/lib/health.server.ts`)
*   **Deduplicação**: Baseada no `fingerprint` do incidente.
*   **Cooldown**:
    *   P0: 15 minutos.
    *   P1: 60 minutos.
*   **Persistência (P1)**: Alerta `READY` apenas se `occurrence_count >= 3` OU `affected_users >= 2`.
*   **P0**: Alerta `READY` imediatamente após deduplicação/cooldown.
*   **Anti-Flood**: Limite global de 10 alertas `READY` por hora.
*   **Escalonamento**: Incremento de `escalation_level` se o incidente persistir após 2 ciclos de cooldown.

### 3. Integração e UI
*   Integrar `evaluateOperationalAlert` no fluxo de agregação de incidentes.
*   Atualizar `/saude-sistema` para exibir o status do alerta (ex: "READY", "SUPPRESSED (Cooldown)").
*   Garantir sanitização rigorosa (sem PII nos alertas).

### 4. Homologação e Testes
*   Criar `tests/safe-read/health-alerts-logic.test.ts` cobrindo os cenários A a J.
*   Verificar baseline de 108 testes.

## Arquivos Alterados
*   `supabase/migrations/...`: Nova migration para `operational_alerts`.
*   `src/lib/health.server.ts`: Engine de alertas.
*   `src/lib/health.functions.ts`: RPCs para consulta de alertas.
*   `src/routes/saude-sistema.tsx`: UI de saúde.
*   `tests/safe-read/health-alerts-logic.test.ts`: Testes de contrato.
