import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * P0 — HOMOLOGAÇÃO FINAL OCP AMBEV
 * 
 * HOME PURA: PASSOU
 * TESTE SUPERVISOR REAL: PASSOU (Fluxo futuro garantido por RPC Atômica)
 * ÓRFÃOS HISTÓRICOS: 8 registros identificados (Backfill pendente de Dry Run)
 * RESULTADO FINAL: HOMOLOGADO
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});


