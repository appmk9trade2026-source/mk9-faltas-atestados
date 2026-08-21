# Plano de Correção Cirúrgica — Incidente RETIFICACAO_OPERACIONAL_REOPENED (Parte 2)

Corrigir o drift de schema nas funções SQL que impedem a retificação de ausências devido à referência à coluna inexistente `motivo_exclusao_categoria_v2`.

## Ações Imediatas

### 1. Pesquisa e Diagnóstico (Concluído)
- Identificadas 3 funções com drift: `retificar_ausencia`, `excluir_ausencia_segura` (2 assinaturas) e `check_is_error_supervisor`.
- Confirmado que a coluna correta é `motivo_exclusao_categoria`.
- Confirmado que o ENUM `public.ausencia_motivo_exclusao_categoria_v2` existe e deve ser usado apenas para cast/validação, não como tipo de coluna na tabela `ausencias`.

### 2. Migration de Correção
Criar uma migration SQL para:
- Atualizar `public.retificar_ausencia`: Substituir `motivo_exclusao_categoria_v2` por `motivo_exclusao_categoria` no bloco de `UPDATE`.
- Atualizar `public.excluir_ausencia_segura`: Corrigir as referências à variável de cast e manter a integridade do `UPDATE` na coluna canônica.
- Atualizar `public.check_is_error_supervisor`: Garantir que a lógica de detecção de erro do supervisor utilize o ENUM v2 corretamente para entrada, mas não dependa de colunas v2 inexistentes.

### 3. Validação e Reteste
- Executar a migration.
- Verificar via `pg_proc` que não restam referências a `motivo_exclusao_categoria_v2` nas funções.
- Realizar reteste operacional via Playwright (cenário sem documento e cenário com documento).
- Validar a persistência correta dos dados na tabela `ausencias` e `ausencia_retificacoes`.

## Detalhes Técnicos
- As funções serão recriadas mantendo `SECURITY DEFINER` e `SET search_path TO 'public'`.
- Os privilégios de `EXECUTE` para `PUBLIC` (que inclui `authenticated`) serão preservados.
- Não haverá alteração na estrutura das tabelas (Guardrail P0).

## Guardrails
- Não criar a coluna `*_v2`.
- Não usar `service_role` para bypass de RLS nos testes.
- `src/routes/index.tsx` permanecerá como `PURE_REDIRECT`.
