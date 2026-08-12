import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * GUARDRAIL P0: HOME PROTECTION
 * Esta rota deve permanecer como um REDIRECIONAMENTO PURO para o /dashboard.
 * NÃO inserir documentação, matrizes técnicas, roadmaps ou UI operacional aqui.
 * Consulte mem://constraints/governance-rules.md para detalhes.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    });
  },
  loader: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    });
  },
  component: () => null,
});
