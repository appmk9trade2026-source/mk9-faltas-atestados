import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/suporte/incidentes')({
  component: () => null, // Lazy loaded
});
