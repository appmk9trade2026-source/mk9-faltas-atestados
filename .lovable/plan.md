# Plano de Ação - Correção P0 Qualidade de Lançamentos

Identificada a causa raiz dos KPIs zerados: a RPC `rel_qualidade_lancamentos` utiliza o campo `criado_por_usuario_id` que está nulo em grande parte dos registros, enquanto o campo canônico preenchido é `registrado_por`. Além disso, registros cancelados/excluídos não estavam sendo contabilizados corretamente como esforço de lançamento (denominador).

## Etapas Técnicas

### 1. Banco de Dados (RPC)
- Alterar `public.rel_qualidade_lancamentos` para:
    - Usar `a.registrado_por` como ID do supervisor.
    - Buscar nome do supervisor em `public.profiles`.
    - Garantir que o filtro de data use `a.created_at::date`.
    - Contabilizar registros `CANCELADO` e `EXCLUIDO` como lançamentos realizados.

### 2. Frontend (UI/UX)
- Melhorar tratamento de erro e estado vazio na página `qualidade-lancamentos.tsx`.
- Garantir que 0% só apareça se houver lançamentos e todos tiverem erros. Se não houver lançamentos, exibir "N/A" ou "Sem dados".

## Verificação
- Validar contagem contra `public.ausencias` no período 15/07/2026 a 14/08/2026.
- Confirmar se o ranking exibe supervisores como "LEONARDO DA SILVA VIANA" e "JONAS NETO FERREIRA XAROPA" com os números reais encontrados na auditoria.

## Guardrails
- **Home (`src/routes/index.tsx`)**: Inalterada (Redirect puro).
- **Dados Históricos**: Somente leitura, sem alterações em `ausencias`.
- **Outras funcionalidades**: Sem impactos em Nova Ausência ou Central de Processamento.
