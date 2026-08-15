import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * CRM MK9 — PROGRAMA DE ESTABILIZAÇÃO GERAL
 * ETAPA 4 — SAÚDE OPERACIONAL, HEALTH CHECKS E DETECÇÃO PROATIVA DE INCIDENTES
 * MODO: FREEZE DE FEATURES + REGRESSION HARDENING
 * 
 * OBJETIVO: Criar uma camada de saúde operacional capaz de detectar incidentes sem alterar regras de negócio.
 * 
 * GUARDRAIL P0: Este arquivo é PROTEGIDO. A Home permanece um redirecionamento puro.
 * Documentação técnica e roteiros residem apenas em mem:// ou logs de auditoria.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});

