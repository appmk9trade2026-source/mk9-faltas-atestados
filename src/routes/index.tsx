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
      PARTE 4C — AUDITORIA

      AUDIT INSERT POLICY:
      SIM (Implementada: "Users can create audit events for their own tickets")

      ROOT CAUSE:
      Bloqueio de RLS. A tabela support_ticket_events possuía RLS habilitado mas nenhuma política de INSERT para 'authenticated', além de falta de GRANTs explícitos.

      CORRECTION:
      Execução de GRANT SELECT, INSERT e criação de políticas de RLS escopadas para o criador do ticket e administradores.

      RLS MODIFIED:
      SIM

      RLS PRESERVED:
      SIM (Restrito a TICKET_CREATED para o próprio autor)

      SERVICE ROLE USED:
      NÃO

      TEST TICKET:
      c8df1e91-5f0d-4b90-ae41-4c4c5ba7066d

      PROTOCOL:
      SUP-20260820-000003

      TICKET_CREATED EVENT:
      PASS

      AUDIT COUNT:
      1

      ACTOR MATCH:
      PASS (55933680-b1c4-4ac4-b87b-77b83501e977)

      TICKET MATCH:
      PASS

      DUPLICATE EVENT:
      NÃO

      TICKETS WITHOUT CREATED EVENT:
      2 (Protocolos SUP-000001 e SUP-000002)

      BACKFILL EXECUTED:
      NÃO

      GETTICKETS:
      NOT_TOUCHED

      MY TICKETS GAP:
      OPEN

      TYPESCRIPT:
      PASS

      BUILD:
      PASS

      DECISÃO:

      SUPPORT_AUDIT_FIXED:
      SIM

      PARAR.

      Aguardar Parte 4D.
    </div>
  ),
})


