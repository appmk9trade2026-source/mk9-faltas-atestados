---
title: Fix duplicate supervisor ranking
description: Group dashboard ranking by supervisor_usuario_id instead of text name to prevent duplicates like Jonas Neto Xaropa.
---

# Plan - Fix duplicate supervisor ranking

Fix the "Supervisores que exigem atenção" ranking duplication by grouping by the canonical `supervisor_usuario_id` instead of the text name.

## User Review Required

> [!IMPORTANT]
> This change will consolidate rankings for supervisors who have multiple name variations in the database (e.g., "Jonas Neto Xaropa" and "Jonas Neto Ferreira Xaropa" will become one entry).

- **Jonas Neto Xaropa**: Will be consolidated under "JONAS NETO FERREIRA XAROPA" (45 total occurrences if filtered correctly).
- **Other affected**: Alexandre Freitas da Silva, Luiz Carlos, Fernanda Lorrany, Renan de Souza Lima, etc.
- **Identity logic**: Consolidation happens ONLY when records share the same `supervisor_usuario_id`. Records with `NULL` ID remain grouped by name as "Legacy/Unresolved".

## Technical details

- **File**: `supabase/migrations/20260813155300_fix_dashboard_metrics_grouping.sql` (New migration)
- **Logic change**: 
    1. Update `public.dashboard_metrics` RPC.
    2. Change the `v_top_sup` CTE to group by `supervisor_usuario_id`.
    3. Use a subquery or JOIN with `public.profiles` to resolve the current canonical name for display.
    4. Handle historical records without IDs by grouping them separately or keeping them as-is (as per Etapa 8).
- **Frontend**: No changes needed if the contract (name, total) is maintained, but adding `id` to the return JSON is good practice for future-proofing.

## Ethical and Safety considerations

- Does not delete any data.
- Preserves historical names in the `ausencias` table (only affects the dashboard aggregation).
- No RLS changes.
