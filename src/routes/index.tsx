import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * GUARDRAIL P0: PROTEÇÃO DA HOME
 * 
 * Este arquivo foi restaurado para redirecionamento puro.
 * Conflito P0 (Protocolo AMBEVASD4-20260812-000008) corrigido no banco.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});
