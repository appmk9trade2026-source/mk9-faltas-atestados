import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    })
  },
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre-wrap leading-relaxed max-w-4xl mx-auto bg-white dark:bg-slate-950 min-h-screen">
      CRM MK9 — CENTRAL DE SUPORTE
      PARTE 5/5 — HOMOLOGAÇÃO E2E FINAL

      RELATÓRIO DE HOMOLOGAÇÃO E2E — PARCIAL (BLOQUEIO)

      TICKET: c8df1e91-5f0d-4b90-ae41-4c4c5ba7066d
      PROTOCOL: SUP-20260820-000003
      SUPERVISOR OWN TICKET: PASS

      --------------------------------
      RH
      --------------------------------

      Ticket Visible: FAIL
      Assign Ticket: FAIL (AUTH_DRIFT)
      Assign Audit: FAIL
      Send Message: FAIL (AUTH_DRIFT)

      --------------------------------
      DIAGNÓSTICO DE BLOQUEIO
      --------------------------------

      1. RH_TICKET_VISIBLE = FAIL
         Root Cause: RLS "Users can view their own tickets" restringe RH apenas a tickets já atribuídos.
         Tickets novos (NULL assigned_user_id) são invisíveis para a fila do RH.

      2. AUTH DRIFT DETECTADO
         As seguintes funções falharam nos testes de isolamento:
         - assignTicket
         - sendMessage
         - resolveTicket
         - reopenTicket
         - getAgentMetrics

      3. SCHEMA CACHE / JOIN ISSUES
         O PostgREST falhou em realizar join automático com 'profiles'.
         Implementado fallback manual em getTickets.

      --------------------------------
      ESTADO FINAL DO E2E
      --------------------------------

      SUPPORT_E2E_READY: NÃO
      READY_FOR_CONTROLLED_REAL_USE: NÃO

      P0: RH não vê chamados novos (RLS).
      P1: Auth Drift em funções críticas de atendimento.

      PARAR.

    </div>
  ),
})
