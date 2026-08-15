# Plan - Etapa 8.8: Homologação TR-8-REAL-004

Execução controlada do quarto teste real de notificações P0 em ambiente Sandbox, validando o fluxo ponta a ponta após verificação administrativa.

## User Review Required

> [!IMPORTANT]
> A autorização é restrita ao TR-8-REAL-004 em SANDBOX. O Kill Switch deve ser desligado imediatamente após o envio.

- O destinatário técnico (Matrícula 2504) será o único alvo.
- Nenhuma PII será enviada ou registrada.

## Proposed Changes

### Infrastructure & Security (Server-side)
- Garantir `environment = 'SANDBOX'` e `kill_switch_enabled = false` no início.
- Validar `admin_verified = true` para o destinatário alvo.
- Criar novos registros de `Incident`, `Alert` e `Outbox` específicos para o `TR-8-REAL-004`.

### Execution (Worker & API)
- Realizar Dry Run final com payload sanitizado.
- Habilitar Kill Switch temporariamente.
- Processar apenas o ID do `TR-8-REAL-004`.
- Capturar resposta da Evolution API (HTTP 2xx + Message ID).
- Desativar Kill Switch imediatamente.

### Monitoring & Audit
- Registrar logs forenses de aceitação do provedor.
- Verificar status de `DELIVERED` via webhook da Evolution API (se disponível).
- Coletar confirmação humana do recebimento.

## Technical Details

- **Filtro do Worker**: Ajustar `src/lib/health-worker.server.ts` para processar apenas o `trace_id` do teste durante a janela de execução.
- **Sanitização**: Manter o `PII Guardrail` ativo, removendo nomes e matrículas da mensagem final.
- **Database**: Utilizar `supabaseAdmin` para bypass de RLS apenas na criação controlada do fixture de teste.

## Strategy & Verification

### Dry Run
1. Executar script de auditoria pré-voo.
2. Confirmar `READY` na UI de Saúde do Sistema.

### Execution
1. Acionamento manual do worker para o registro específico.
2. Monitoramento de logs em tempo real.

### Post-Mortem
1. Gerar relatório técnico conforme template fornecido pelo usuário.
2. Validar que nenhuma regressão ocorreu nos módulos de Ausência ou Dashboard.
