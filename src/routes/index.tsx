import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    // Restaurando comportamento original: redirecionar para dashboard se logado, ou auth
    const { data: { session } } = await context.supabase.auth.getSession();
    
    if (session) {
      throw redirect({ to: '/dashboard' });
    }
    
    throw redirect({ to: '/auth' });
  },
  component: () => null,
});

