# Plano de Diagnóstico e Correção Forense — Incidente P0/P1 Retificação

Este plano visa diagnosticar e corrigir cirurgicamente a falha de retificação reportada no protocolo **AMBEVASD5-20260818-000068**, onde o fluxo de Meio Período (Horas) falha no ambiente real apesar da homologação anterior.

## Diagnóstico Técnico Realizado

1.  **RPC `retificar_ausencia`**:
    *   **Assinatura Real**: Possui os parâmetros `p_horario_inicio` e `p_horario_fim` do tipo `text`.
    *   **Lógica Interna**: A RPC valida a presença desses campos para `MEIO_PERIODO` e tenta realizar o `UPDATE`.
2.  **Tabela `ausencias`**:
    *   Possui colunas `horario_inicio` e `horario_fim` do tipo `time without time zone`.
3.  **Tabela `ausencia_retificacoes`**:
    *   **GAP IDENTIFICADO**: Não possui colunas para armazenar os horários (anterior e novo). O `INSERT` na tabela de histórico provavelmente está falhando ou omitindo esses dados.
4.  **Zod Server-side**:
    *   `src/lib/retificacao.functions.ts` usa regex `/^\d{2}:\d{2}(:\d{2})?$/`.
    *   O PostgreSQL `time` aceita `HH:MM` ou `HH:MM:SS`.
5.  **Causa Raiz Provável**:
    *   Inconsistência na tabela `ausencia_retificacoes` (falta de colunas de horário) OU
    *   A RPC tenta inserir horários na tabela de histórico em colunas inexistentes OU
    *   Conflito de tipos entre `text` (parâmetro) e `time` (coluna) se o cast implícito falhar ou se houver um trigger de validação rígido.

## Etapas de Execução

### 1. Investigação de Erro e Schema (Imediato)
*   Tentar capturar o erro exato da RPC via `supabase--read_query` simulando a chamada.
*   Verificar triggers na tabela `ausencia_retificacoes`.
*   Confirmar se a RPC `retificar_ausencia` tenta popular o histórico com horários.

### 2. Migration de Correção (Banco de Dados)
*   Adicionar colunas `horario_inicio_anterior`, `horario_inicio_novo`, `horario_fim_anterior`, `horario_fim_novo` na tabela `public.ausencia_retificacoes`.
*   Ajustar a RPC `public.retificar_ausencia` para:
    *   Persistir os horários no histórico (`ausencia_retificacoes`).
    *   Garantir o cast explícito de `text` para `time` (`p_horario_inicio::time`).
    *   Tratar o `correlation_id` para observabilidade.

### 3. Hardening do Backend (TypeScript)
*   Sincronizar `src/lib/retificacao.functions.ts` se houver mudança de tipos.
*   Garantir que o `mapRetificacaoError` capture e logue (no console do servidor) o erro real antes de sanitizar para o usuário.

### 4. Hardening da UI
*   Melhorar o `RetificarAusenciaDialog.tsx` para garantir que o payload enviado seja exatamente o que o Zod espera.
*   Garantir que o toast de erro não oculte informações críticas para o diagnóstico (como o safe code ou trace id).

### 5. Validação Forense (Teste Real)
*   Executar o caso `AMBEVASD5-20260818-000068` (ou equivalente controlado).
*   Verificar persistência em `ausencias` e `ausencia_retificacoes`.

## Guardrails
*   NÃO alterar `src/routes/index.tsx`.
*   NÃO remover RLS/RBAC.
*   Preservar integridade do bucket privado.
