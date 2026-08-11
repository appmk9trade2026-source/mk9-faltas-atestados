# Plan - AMBEV Point Occurrence: Manual Entry

Permit registration of AMBEV Point Occurrences for collaborators not found in the master list, preserving the existing Project -> Supervisor hierarchy without modifying master records.

## User Review Required

> [!IMPORTANT]
> - The manual entry will **not** create a master collaborator record to avoid duplication and data inconsistency.
> - A migration is required to add `manual_matricula`, `manual_nome`, and `colaborador_manual` fields to `public.ocorrencias_ponto`.

## Proposed Changes

### Database (Lovable Cloud)
- **Migration**: Add auditing fields to `public.ocorrencias_ponto`:
    - `colaborador_manual` (boolean, default false)
    - `manual_matricula` (text, nullable)
    - `manual_nome` (text, nullable)
- **Grants**: Ensure `authenticated` role can update these new fields.

### Backend (Server Functions)
- **Schema Update**: Modify `ocorrenciaPontoSchema` in `src/lib/ocorrencias.functions.ts` to support manual entry fields.
- **Logic Hardening**: 
    - In `criarOcorrencia`, if manual mode is used, validate the registration number (matrícula) against the master database.
    - If the collaborator exists in the master list and is compatible, block manual entry and suggest using the existing record.
    - If the collaborator exists but in a different project/supervisor, allow manual entry but preserve the mismatch evidence (do not update master).
    - If the collaborator is truly not found, allow manual entry.
- **Audit**: Update the audit log to include `OCORRENCIA_PONTO_MANUAL_CRIADA` event.

### Frontend (UI/UX)
- **Form Enhancement**: In `src/routes/_authenticated/ocorrencias-ponto.tsx`:
    - Add "Don't see the collaborator? [Enter Manually]" toggle below the collaborator select.
    - Implement manual mode fields: Matrícula and Full Name.
    - Ensure mandatory evidence upload remains active for manual mode.
- **Visual Feedback**:
    - Add a `MANUAL` badge in the occurrence history table for records created via manual entry.
    - Display a helpful message if a registration number is found in the master database during manual entry.

## Technical Details
- **Allowlist**: 
    - `src/lib/ocorrencias.functions.ts`
    - `src/routes/_authenticated/ocorrencias-ponto.tsx`
    - `supabase/migrations/` (new migration)
- **Safety**: No changes to `get_colaboradores_ativos` or master collaborator records.
- **Validation**: Server-side enforcement of AMBEV project restriction for manual mode.

## Constraints Verification
- [x] Home route `src/routes/index.tsx` is NOT modified.
- [x] No new Roadmap or internal documentation files created.
- [x] Internal processing logic for existing records is preserved.
- [x] Build passes before and after changes.
