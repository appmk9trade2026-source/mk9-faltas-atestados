# Plano de Ação: Correção do Trigger de Duplicidade (P0)

Este plano visa corrigir a falha de integridade onde registros cancelados ou excluídos da tabela `public.ausencias` bloqueiam novos lançamentos devido a uma ambiguidade na função de verificação de duplicidade utilizada pelo banco de dados.

## Diagnóstico Confirmado
- Existem dois overloads da função `public.ausencia_duplicada_existente`.
- O overload de **9 parâmetros** (que suporta horários) é o utilizado pelo trigger `trg_ausencias_bloqueia_duplicidade`.
- Este overload **não possui** o filtro de `status` e `status_documental`, considerando registros `CANCELADO` e `EXCLUIDO` como conflitos ativos.

## Etapas de Execução

### 1. Preparação da Migration
- Criar uma migration SQL para atualizar a função `public.ausencia_duplicada_existente` (versão de 9 parâmetros).
- Inserir explicitamente os filtros de elegibilidade:
  ```sql
  AND a.status NOT IN ('CANCELADO', 'SUBSTITUIDA')
  AND (a.status_documental IS NULL OR a.status_documental != 'EXCLUIDO')
  ```

### 2. Aplicação da Correção
- Executar a migration no banco de dados.
- Garantir que a assinatura, owner e permissões sejam preservados.

### 3. Validação Forense (Caso AMBEVASD5-20260811-000046)
- Executar a função manualmente com os parâmetros do protocolo 000046.
- Confirmar que o resultado agora é **vazio** (ignorado).

### 4. Teste de Integridade do Trigger
- Tentar realizar um `INSERT` simulado em uma transação para o mesmo período do protocolo 000046.
- Validar que o trigger **permite** a inserção.
- Validar que um registro **ATIVO** continua sendo **bloqueado**.

### 5. Verificação de Regressão
- Confirmar que a RPC `detectar_conflitos_ausencia` e o frontend da "Nova Ausência" permanecem operacionais sem alterações diretas.
- Validar o redirecionamento da Home conforme Guardrail P0.

## Detalhes Técnicos
- **Função:** `public.ausencia_duplicada_existente` (9 params).
- **Trigger:** `tg_ausencias_bloqueia_duplicidade` (função do trigger).
- **Segurança:** A alteração mantém o `SECURITY DEFINER` e `search_path`.
