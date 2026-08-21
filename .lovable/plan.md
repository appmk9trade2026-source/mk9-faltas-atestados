# Plan: Correção Cirúrgica do Incidente de Auditoria de Processamento

Este plano detalha a correção do erro de violação de enum (`audit_action`) na RPC de reatribuição de processamento, garantindo que a auditoria seja registrada corretamente e a operação "ASSUMIR PARA MIM" volte a funcionar.

## User Review Required

> [!IMPORTANT]
> A correção envolve a criação de um novo valor no enum de auditoria do banco de dados para suportar o rastreamento de reatribuições manuais.

- **Impacto**: Restaura a funcionalidade de assumir registros na Central de Processamento.
- **Segurança**: Mantém a atomicidade da transação (se a auditoria falhar, a mudança de responsável não é aplicada).

## Proposed Changes

### Database (Supabase)

#### [Migration] Adição de valor ao enum e atualização da RPC
- Criar migration para adicionar `PROCESSAMENTO_REATRIBUIDO` ao enum `public.audit_action`.
- Garantir que a RPC `public.reatribuir_processamento_ausencia` continue usando este valor, agora válido.
- Reforçar `GRANT EXECUTE` para papéis administrativos.

### Backend Functions

#### `src/lib/ausencias.functions.ts`
- Verificar se o `errorMiddleware` está capturando erros de banco de forma amigável para evitar vazamento de erros brutos na UI.

## Technical Details
- **Enum Fix**: `ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'PROCESSAMENTO_REATRIBUIDO';`
- **Atomicity**: A RPC utiliza um bloco `BEGIN...END` garantindo que o `UPDATE` na tabela `ausencias` e o `PERFORM public.log_audit_event` ocorram na mesma transação.
- **RBAC**: A validação de `rh`, `compliance` ou `super_admin` dentro da RPC será preservada.

## Verification Plan

### Automated Tests (Playwright)
- `verify_fix_p2.py`:
    1. Logar como RH/Admin.
    2. Localizar registro em "EM_PROCESSAMENTO" (preferencialmente assumido por automação).
    3. Clicar em "ASSUMIR PARA MIM".
    4. Verificar sucesso na UI (Toast e mudança de nome do responsável).
    5. Consultar `public.audit_logs` para confirmar o evento `PROCESSAMENTO_REATRIBUIDO`.

### Manual Verification
- Validar se a aba "Minha Fila" é atualizada imediatamente após assumir o registro.
- Tentar assumir com um usuário `supervisor` e confirmar que o acesso é negado (403/Exception).
