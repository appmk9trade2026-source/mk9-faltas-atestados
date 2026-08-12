# Plan - Management Action Plan Evolution (Phase 1)

Evolve the "Management Action Plan" (Plano de Ação Gerencial) form to support operational hierarchy (Project -> Supervisor -> Colaborador), add a "Success Indicator" field, and enhance AI suggestions and validations.

## User Review Required

> [!IMPORTANT]
> - A database migration is required to add `indicador_sucesso` and `supervisor_usuario_id` columns to `public.planos_acao`.
> - A new target type `SUPERVISOR` will be added to the `tipo_alvo_plano` enum.

## Proposed Changes

### Database & Backend

#### [Migration] Schema Extension
- Add `SUPERVISOR` to `public.tipo_alvo_plano` enum.
- Add `indicador_sucesso` (text, not null) to `public.planos_acao`.
- Add `supervisor_usuario_id` (uuid, references profiles(id), nullable) to `public.planos_acao`.
- Update `planos_acao_projeto_alvo_check` to handle the new hierarchy rules.

#### [Server Functions] src/lib/planos-acao.functions.ts
- Update `planoAcaoSchema` and `PlanoAcaoInput` to include new fields.
- Harder server-side validation for hierarchy (ensure supervisor belongs to project, etc.).
- Update `listarPlanosAcao` and `obterPlanoAcao` to fetch supervisor names.

### Frontend & UI

#### [Hook] src/hooks/use-supervisores.ts
- Create a new hook to fetch supervisors by project using the existing `get_supervisores_projeto` RPC.

#### [Page/Modal] src/routes/_authenticated/planos-acao.tsx
- **Target Type Selection:** Add "Supervisor" option.
- **Conditional Fields:** Implement visibility logic:
    - `PROJETO`: Only Project.
    - `SUPERVISOR`: Project + Supervisor.
    - `COLABORADOR`: Project + Supervisor + Colaborador.
- **Hierarchy Logic:** Selecting a project filters supervisors; selecting a supervisor filters colaboradores (using `_supervisor_id` in `get_colaboradores_ativos`).
- **New Field:** Add "Indicador de Sucesso" with placeholder.
- **AI Enhancement:** Update `handleGenerateAI` to include the new field in suggestions.
- **Validations:** Add date check (Prazo >= Início) and per-type required fields.
- **RBAC:** Auto-fill and lock supervisor field for users with `supervisor` role.

## Technical Details

### SQL Migration
```sql
ALTER TYPE public.tipo_alvo_plano ADD VALUE IF NOT EXISTS 'SUPERVISOR';

ALTER TABLE public.planos_acao 
ADD COLUMN indicador_sucesso text,
ADD COLUMN supervisor_usuario_id uuid REFERENCES public.profiles(id);

-- Migration logic for existing records
UPDATE public.planos_acao SET indicador_sucesso = 'Definido na implantação' WHERE indicador_sucesso IS NULL;
ALTER TABLE public.planos_acao ALTER COLUMN indicador_sucesso SET NOT NULL;

-- Update constraints
ALTER TABLE public.planos_acao DROP CONSTRAINT IF EXISTS planos_acao_projeto_alvo_check;
ALTER TABLE public.planos_acao ADD CONSTRAINT planos_acao_projeto_alvo_check 
CHECK (
  (tipo_alvo = 'PROJETO' AND supervisor_usuario_id IS NULL AND colaborador_id IS NULL) OR
  (tipo_alvo = 'SUPERVISOR' AND supervisor_usuario_id IS NOT NULL AND colaborador_id IS NULL) OR
  (tipo_alvo = 'COLABORADOR' AND supervisor_usuario_id IS NOT NULL AND colaborador_id IS NOT NULL)
);
```

### AI Prompt Update
- Extend prompt to request "indicador_sucesso" in JSON response.
- Update `gerarSugestaoPlanoAcao` schema.
