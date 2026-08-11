# Diagnóstico Forense: Incidente Crítico Dashboard (Falha ao Carregar Métricas)

## 1. Localização da Chamada
- **Arquivo**: `src/routes/_authenticated/dashboard.tsx`
- **Função**: `useQuery` (queryKey: `["dashboard-metrics", ...filters]`)
- **Chamada**: `supabase.rpc("dashboard_metrics", { ... filtros ... })`
- **Payload**: Objeto com `_inicio`, `_fim`, e filtros opcionais de empresa, projeto, etc.

## 2. Captura do Erro Real
- **Sintoma UI**: "Falha ao carregar métricas."
- **Erro PostgREST**: Detectado erro de permissão (`permission denied for function dashboard_metrics`).
- **SQLSTATE**: `42501` (Insufficient Privilege).
- **Detalhes**: A migration recente `20260811153749` recriou a função usando `CREATE OR REPLACE`, mas não preservou os GRANTs necessários para os papéis `authenticated` e `anon`.

## 3. Validação de Assinatura
- **OID**: `17947`
- **Assinatura**: `public.dashboard_metrics(_inicio date, _fim date, _empresa_id uuid DEFAULT NULL, _projeto_id uuid DEFAULT NULL, _supervisor text DEFAULT NULL, _tipo tipo_ausencia DEFAULT NULL, _status status_ausencia DEFAULT NULL, _categoria_id uuid DEFAULT NULL)`
- **Segurança**: `SECURITY INVOKER` (default).
- **Problema**: A assinatura está correta, mas a permissão de execução foi perdida.

## 4. Auditoria da Migration Recente
- **Migration**: `20260811153749_40ed3019-b8f5-4bc6-9b8c-eb9a80e2420b.sql`
- **Alteração Crítica**: Introduziu filtro `AND NOT (a.tipo = 'FALTA' AND COALESCE(a.status_justificativa, '') = 'JUSTIFICADA_OCORRENCIA_PONTO')`.
- **Quebra de Contrato**: A chave de retorno para os últimos registros foi alterada de `ultimos` para `ultimos_registros`, o que causaria erro de renderização ou dados vazios no frontend mesmo se a permissão estivesse OK.

## 5. Verificação de Integridade
- **status_justificativa**: Coluna existe e está acessível.
- **Grants**: Confirmado que não há GRANTs ativos para `authenticated` ou `anon` no catálogo.

## 6. Causa Raiz Comprovada
- **Causa Principal**: Perda de GRANTs após `CREATE OR REPLACE` na migration AMBEV (Fase 4).
- **Causa Secundária**: Divergência de contrato no JSON de retorno (`ultimos` vs `ultimos_registros`).

## 7. Classificação
- **CLASSIFICAÇÃO**: **E** (Contrato de retorno alterado) + **F** (GRANT perdido).

## 8. Correção Mínima Recomendada
- **CAUSA**: Perda de permissão e quebra de contrato JSON.
- **CORREÇÃO**: Restaurar GRANTs e reverter nome da chave `ultimos_registros` para `ultimos` no corpo da RPC.
- **MIGRATION NECESSÁRIA**: SIM.
- **FRONTEND PRECISA ALTERAR**: NÃO (se a RPC for corrigida).

---

### RESULTADO
**DIAGNÓSTICO CONCLUÍDO — AGUARDANDO AUTORIZAÇÃO**
Nenhuma alteração de código ou banco foi realizada nesta etapa conforme diretiva de CHANGE BUDGET ZERO.
