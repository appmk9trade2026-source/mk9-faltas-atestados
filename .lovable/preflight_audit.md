# OCORRÊNCIA AMBEV — FASE 4: PREFLIGHT AUDIT

## 1. public.rel_absenteismo
- **Assinatura:** `(_inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL, _supervisor text DEFAULT NULL)`
- **Filtros atuais:** `a.status_documental = 'ATIVO'` e período `data_inicio <= _fim AND a.data_fim >= _inicio`.
- **Totalizadores:** `total_faltas` (count `tipo = 'FALTA'`), `total_atestados`, `total_ocorrencias` (count all), `total_dias`.
- **Rankings:** Por projeto e por colaborador (baseado em `total_ocorrencias`).
- **Status Documental:** Filtra por `ATIVO`.
- **Status Justificativa:** Atualmente ignorado (não consta na query).
- **RBAC:** Implementado via `auth.uid()` e roles (`super_admin`, `rh`, `coordenador`, `supervisor`).

**Blocos a mudar:**
- CTE `filtered_ausencias`: Adicionar `AND COALESCE(a.status_justificativa, '') <> 'JUSTIFICADA_OCORRENCIA_PONTO'` para KPIs e Rankings operacionais.

## 2. public.rel_faltas
- **Assinatura:** `(_inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL, _is_export boolean DEFAULT false)`
- **Filtros atuais:** `a.status_documental = 'ATIVO'` e `(t.codigo IN ('FALTA_JUSTIFICADA', 'FALTA_INJUSTIFICADA') OR a.tipo = 'FALTA')`.
- **Totalizadores:** `justificadas` (baseado em `tipo_codigo = 'FALTA_JUSTIFICADA'`) e `injustificadas`.
- **Rankings:** Por projeto e colaborador.
- **Status Justificativa:** Ignorado na lógica de contabilização de "injustificadas".

**Blocos a mudar:**
- KPIs `injustificadas`: Excluir `JUSTIFICADA_OCORRENCIA_PONTO` do total de injustificadas.
- KPI `justificadas_ambev`: Adicionar novo contador para `JUSTIFICADA_OCORRENCIA_PONTO` (opcional/desejável).
- Rankings: Ajustar para que faltas justificadas AMBEV não pesem como faltas operacionais (injustificadas).
