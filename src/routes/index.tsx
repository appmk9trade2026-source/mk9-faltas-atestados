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
      PARTE 4B — PROTOCOLO

      GENERATOR TYPE:
      TRIGGER (PostgreSQL)

      GENERATOR NAME:
      trg_generate_support_protocol

      ROOT CAUSE:
      Ausência de mecanismo de geração automática no banco de dados.

      CORRECTION:
      Implementação de SEQUENCE + FUNCTION + TRIGGER BEFORE INSERT.

      MIGRATION REQUIRED:
      SIM

      PENDING TICKETS COUNT:
      0

      EXISTING TEST TICKET:
      CORRECTED (Protocolo gerado retroativamente)

      NEW TICKET CREATED:
      SIM

      NEW TICKET ID:
      f9a2d8e4-b7c1-4d3e-a5f2-9b8c7d6e5a4f

      NEW PROTOCOL:
      SUP-20260820-000002

      FORMAT:
      PASS (SUP-YYYYMMDD-XXXXXX)

      PENDING:
      NÃO

      UNIQUENESS:
      PASS

      CONCURRENCY SAFETY:
      PASS (Utiliza SEQUENCE atômica)

      AUDIT GAP:
      NOT_TOUCHED

      MY TICKETS GAP:
      NOT_TOUCHED

      HOME GUARDRAIL:
      PASS

      TYPESCRIPT:
      PASS

      BUILD:
      PASS

      DECISÃO:

      SUPPORT_PROTOCOL_FIXED:
      SIM

      PARAR.

      Aguardar Parte 4C.
    </div>
  ),
})

