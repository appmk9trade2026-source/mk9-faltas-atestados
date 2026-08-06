import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/')({
  loader: async () => {
    // Restaurando comportamento original: redirecionar para dashboard se logado, ou auth
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      throw redirect({ to: '/dashboard' });
    }
    
    throw redirect({ to: '/auth' });
  },
  component: () => null,
});
