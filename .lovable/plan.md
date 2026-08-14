# Plan - Implement Qualidade de Lançamentos (Phase 1)

Implement a new management module for monitoring the quality of absence registrations by supervisors. This phase is purely analytical and read-only, ensuring no disruption to operational flows.

## Proposed Changes

### Database & Backend
- Create a new migration for the analytical source.
- Implement a new `SECURITY INVOKER` RPC `public.rel_qualidade_lancamentos` (or equivalent Server Function) that aggregates:
    - Total registrations.
    - Corrections/Exclusions (inactive status).
    - Grouped by Supervisor and Project.
    - Supports filters: period, company, project, coordination, supervisor.
- Ensure strict RLS and scope validation (Company/Project/Coordination).

### Routing & Navigation
- Create a new route `src/routes/_authenticated/qualidade-lancamentos.tsx`.
- Add "Gestão -> Qualidade de Lançamentos" to `src/components/layout/app-sidebar.tsx` under the "Análises" or "Administração" section.
- Respect RBAC: Only `super_admin`, `compliance`, and `rh` (as per standard management access).

### Frontend Implementation
- **KPI Row**: Total Registrations, Corrections/Exclusions, Success Rate, Correction Rate.
- **Filters**: Responsive filter bar (Period, Company, Project, Coordination, Supervisor).
- **Charts**: A single chart showing the evolution of the correction rate over time.
- **Ranking Table**:
    - Supervisor Ranking (Registrations, Corrections, Rates).
    - Project Ranking (Registrations, Corrections, Rates).
- **Supervisor Detail**: Lateral Drawer showing the list of protocols for the selected supervisor (excluding clinical data/CID).

### Guardrails
- `src/routes/index.tsx` remains a pure redirect.
- Existing operational RPCs (`dashboard_metrics`, `registrar_ausencia_com_colaborador_manual`, etc.) remain untouched.
- Dashboard remains isolated.

## Technical Details
- Use `useSuspenseQuery` for data fetching.
- Backend aggregation to avoid N+1 and frontend heavy lifting.
- Formula implementation: `taxa_correcao = (correcoes / total) * 100`.
- Data classification: Use "NÃO CLASSIFICADAS" for historical records without a specific reason.
