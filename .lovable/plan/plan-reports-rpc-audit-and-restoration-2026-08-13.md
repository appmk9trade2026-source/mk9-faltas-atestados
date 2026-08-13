# Plan - Reports RPC Audit and Restoration

Forensic audit and surgical fix for `rel_atestados` (missing/cache signature mismatch) and `rel_faltas` (relation error due to CTE scope).

## User Review Required

> [!IMPORTANT]
> The current `rel_atestados` RPC lacks the `_is_export` parameter expected by the frontend, causing a 404/Schema Cache error. `rel_faltas` contains a logic bug where a CTE (`filtered_faltas`) is referenced outside its valid SQL scope.

- **RBAC**: Both functions will be hardened to respect user roles (`super_admin`, `rh`, `coordenador`, `supervisor`) instead of relying solely on RLS, which can be inconsistent for complex aggregation RPCs.
- **AMBEV Rules**: Point occurrences marked as `JUSTIFICADA_OCORRENCIA_PONTO` will be excluded from operational absenteísmo rankings per canonical business rules.

## Proposed Changes

### Database (Supabase)

- **RPC `rel_atestados`**: Refactor signature to add `_is_export` and implement internal role-based filtering.
- **RPC `rel_faltas`**: Fix scope error by consolidating the `filtered_faltas` CTE usage into a single return object.
- **Permissions**: Explicitly `GRANT EXECUTE` to `authenticated` role.
- **Cache**: Trigger `NOTIFY pgrst, 'reload schema'` to propagate signature changes.

### Frontend

- **Verification**: Confirm `src/routes/_authenticated/relatorios.tsx` caller matches the new canonical signatures.
- **SEO/Head**: Ensure proper metadata for the reports route.

## Technical Details

- **rel_atestados signature**: `(date, date, uuid, uuid, boolean)`
- **rel_faltas signature**: `(date, date, uuid, uuid, boolean)`
- **Guardrail P0**: `src/routes/index.tsx` will remain a pure redirect. No changes to Dashboard or Ocorrências logic.

## Verification Plan

1. **Direct SQL Test**: Execute both RPCs via SQL Editor with real UUIDs and dates.
2. **PostgREST Test**: Call RPCs via `supabase.rpc` to confirm HTTP 200 and schema cache reload.
3. **Frontend Test**: Generate "Atestados" and "Faltas" reports in the preview as Super Admin.
4. **Export Test**: Verify Excel/CSV export triggers the `_is_export` flag correctly.
