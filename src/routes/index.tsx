import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO GERAL
 * ETAPA 2 — REDE DE PROTEÇÃO CONTRA REGRESSÕES
 * MODO: FREEZE DE FEATURES + REGRESSION HARDENING
 * 
 * OBJETIVO: Reduzir drasticamente a recorrência de erros no sistema.
 * 
 * GUARDRAIL P0: Este arquivo é PROTEGIDO. A Home permanece um redirecionamento puro.
 * Documentação técnica e roteiros residem apenas em mem:// ou logs de auditoria.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});

