# Plano de Diagnóstico e Correção: Permissões Administrativas

## Problema
O sistema exibe "Falha ao salvar" ao tentar aplicar alterações na matriz de permissões RBAC. O erro é genérico e não indica a causa raiz (RLS, Grant, Trigger ou Constraint).

## Diagnóstico Técnico
1. **Frontend**: `src/routes/_authenticated/administracao.permissoes.tsx` captura erros na mutation `applyRoleMatrix` e exibe um toast genérico.
2. **Camada de Dados**: `src/lib/rbac.ts` chama a RPC `rbac_apply_role_matrix`.
3. **Backend**: A função `public.rbac_apply_role_matrix` é `SECURITY DEFINER` e executa um loop de `INSERT/DELETE` na tabela `public.role_permissions`.
4. **Causa Raiz Identificada**: Divergência entre as colunas da tabela `public.audit_logs` e os comandos `INSERT` dentro da RPC. A RPC tentava inserir em `user_id`, `entidade_id`, `dados_novos`, `dados_antigos`, mas a tabela real possui `usuario_id`, `registro_id`, `antes`, `depois`. Isso causava um erro de coluna inexistente (SQLSTATE 42703) que era mascarado pelo frontend.

## Etapas de Execução

### Etapa 1: Restauração da Home (Guardrail P0)
Confirmado que `src/routes/index.tsx` permanece como um redirecionamento puro para `/dashboard`.

### Etapa 2: Correção da RPC `rbac_apply_role_matrix`
Aplicada migração para corrigir os comandos `INSERT INTO public.audit_logs` na função `public.rbac_apply_role_matrix` para usar os nomes de colunas canônicos:
- `user_id` -> `usuario_id`
- `entidade_id` -> `registro_id`
- `dados_novos` -> `depois`
- `dados_antigos` -> `antes`
- Adição da coluna `sucesso: true` e `observacoes` detalhadas.

### Etapa 3: Melhoria do Feedback no Frontend
Atualizado o handler de erro em `src/routes/_authenticated/administracao.permissoes.tsx` para:
- Logar o erro detalhado no console para depuração forense.
- Exibir a mensagem real retornada pelo banco de dados (ex: "Acesso Negado", "Permissão Crítica") via toast.

### Etapa 4: Validação
- [x] Super Admin altera permissão válida.
- [x] Bloqueio de remoção de permissão crítica do Super Admin.
- [x] Geração correta de logs na tabela `audit_logs`.
- [x] Verificação de integridade da Home (Redirecionamento Puro).

## Entrega Final
- **Causa Raiz**: Erro de mapeamento de colunas na RPC de auditoria.
- **Correção**: Migração SQL + Hardening de Erro no Frontend.
- **Status**: Corrigido e Homologado.
