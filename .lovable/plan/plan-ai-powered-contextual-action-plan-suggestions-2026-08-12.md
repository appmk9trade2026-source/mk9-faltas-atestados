# Plan: AI-Powered Contextual Action Plan Suggestions

Implement a server-side context gathering and AI integration to provide realistic, data-driven suggestions for Management Action Plans (Goal, Indicator, Actions) based on the target's operational history.

## User Review Required

> [!IMPORTANT]
> - The AI will process aggregated metrics (counts of absences/faults, trends, recurrence patterns).
> - **Privacy Guardrail:** Personal health data (diagnoses, medical documents, CIDs) is strictly excluded from AI prompts.
> - **Human-in-the-Loop:** Suggestions are pre-filled in the form and remain fully editable. The user must review and confirm before saving.

## Proposed Changes

### Backend & Logic

#### [Action Plan Functions] `src/lib/planos-acao.functions.ts`
- Create `obterContextoOperacionalIA` server function:
    - Determine target scope: Project (all), Supervisor (team), or Colaborador (individual).
    - Query `ausencias` table for the last 30/60 days.
    - Aggregate metrics: Total absences, Unjustified faults, weekday distribution, recurrence.
    - Query `planos_acao` for previous plans to capture historical effectiveness.
- Create `sugerirPlanoComIA` server function:
    - Sanitize context (remove PII/medical data).
    - Construct a structured prompt for Gemini.
    - Parse AI response into `meta`, `indicador`, `acoes`, and `prazo_sugerido_dias`.

### Frontend & UI

#### [Action Plan Page] `src/routes/_authenticated/planos-acao.tsx`
- Update the "Novo Plano" modal:
    - Add "✨ Sugerir com IA" button next to key fields or in the header.
    - Implement a loading state: "Analisando histórico operacional...".
    - Add a confirmation dialog if fields are already partially filled.
    - Map AI response to form fields (`meta`, `indicador_sucesso`, `acao_proposta`).
    - Add a disclaimer note: "✨ Sugestão baseada no histórico operacional — revise antes de criar o plano."

### Security & Governance

#### [Guardrail P0] `src/routes/index.tsx`
- Ensure the home route remains a pure redirect. The roadmap text provided by the user is a specification for implementation, not content to be rendered on the Home page.

## Technical Details

- **AI Model:** Gemini 2.0 Flash (via Lovable AI Gateway).
- **Data Privacy:** Server-side filtering of `motivo`, `observacoes_medicas`, and `documento_url` before sending data to the AI.
- **Aggregates:** Use PostgreSQL `COUNT`, `SUM`, and date truncations for trend analysis.
- **RBAC:** Scope data fetching to the authenticated user's permissions (managed via `context.supabase`).

## Verification Plan

### Automated Tests
- Run `vitest` on `obterContextoOperacionalIA` to verify PII scrubbing.
- Mock AI responses to verify form mapping in `planos-acao.tsx`.

### Manual Homologation
1. Open "Novo Plano".
2. Select a Project with known history.
3. Click "Sugerir com IA".
4. Verify the "Meta" is SMART (e.g., "Reduzir faltas de X para Y").
5. Verify "Indicador" is measurable.
6. Verify no medical data was leaked in the process.
