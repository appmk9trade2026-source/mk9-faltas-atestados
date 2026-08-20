import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({
      to: '/dashboard',
    });
  },
  component: () => (
    <div className="p-8 font-mono text-xs whitespace-pre-wrap">
      CRM MK9 — CENTRAL DE SUPORTE
      PARTE 5A — CORREÇÃO CIRÚRGICA DA VISIBILIDADE DO RH

      PARTE 5A — RH TICKET VISIBILITY

      ROOT CAUSE:
      A política de RLS "Users can view their own tickets" na tabela support_tickets restringia o RH apenas a tickets onde ele era o atendente atribuído (assigned_user_id = auth.uid()). Como os novos chamados nascem sem atendente (NULL), o RH não os visualizava.

      POLICY BEFORE:
      ((auth.uid() = requester_user_id) OR has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'rh'::app_role) AND (assigned_user_id = auth.uid())))

      CORRECTION:
      Adicionada a condição (assigned_user_id IS NULL) para o papel 'rh', permitindo a visualização da fila de entrada.
      Nova política:
      ((auth.uid() = requester_user_id) OR has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'rh'::app_role) AND (assigned_user_id = auth.uid() OR assigned_user_id IS NULL)))

      RLS DISABLED: NÃO
      USING TRUE: NÃO
      SERVICE ROLE: NÃO

      RH AUTHORIZED TICKET: PASS
      SUPERVISOR OWN TICKET: PASS
      SUPERVISOR CROSS-TICKET: BLOCKED
      UNAUTHORIZED USER: BLOCKED

      RLS: PASS
      RBAC: PASS

      ASSIGN TICKET: NOT_TESTED
      SEND MESSAGE: NOT_TESTED
      RESOLVE TICKET: NOT_TESTED

      TypeScript: PASS
      Build: PASS

      DECISÃO:

      RH_QUEUE_VISIBILITY_FIXED: SIM
      READY_FOR_ASSIGNTICKET_FIX: SIM

      PARAR.
    </div>
  ),
});
