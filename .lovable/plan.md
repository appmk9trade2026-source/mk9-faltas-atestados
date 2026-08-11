---
name: Ambev Ocorrência Ponto Phase 1
description: Implementation of Phase 1: Foundation for AMBEV Point Occurrences (DB, RLS, Functions, List UI).
type: feature
---

## Phase 1: Foundation (DB & Logic)

### 1. Database Schema
- Create `public.ocorrencias_ponto` table.
- Create `status_ocorrencia` enum: `PENDENTE`, `APROVADA`, `REPROVADA`, `CANCELADA`.
- Protocol format: `OCP-AMBEV-YYYYMMDD-XXXXXX`.
- Mandatory fields: `empresa_id`, `projeto_id`, `colaborador_id`, `data_ocorrencia`, `motivo`, `justificativa`, `arquivo_url`.
- Integration: Link to `public.ausencias` if applicable (optional, for cases where the occurrence "negates" an existing absence).

### 2. RBAC & RLS
- **Supervisor**: Can create for their subordinates; can view their own creations.
- **Coordenador/RH**: Can create, view all, and Approve/Reprove.
- **Service Role**: Full access.
- RLS Policy: `has_role(auth.uid(), 'rh') OR has_role(auth.uid(), 'coordenador') OR (has_role(auth.uid(), 'supervisor') AND registrado_por = auth.uid())`.

### 3. Server Functions (`src/lib/ocorrencias.functions.ts`)
- `listarOcorrencias`: Fetch with filters (status, date, project).
- `criarOcorrencia`: Validate AMBEV project, check mandatory attachment, generate protocol.
- `processarOcorrencia`: Approve/Reprove logic (Coordenador/RH only).

### 4. UI Components
- `src/routes/_authenticated/ocorrencias-ponto.tsx`: Dashboard with list and "Nova Ocorrência" button.
- Integration in `app-sidebar.tsx` under "Operacional" (Visible only for AMBEV projects context).

### 5. Guardrail P0
- Ensure `src/routes/index.tsx` remains a pure redirect.
