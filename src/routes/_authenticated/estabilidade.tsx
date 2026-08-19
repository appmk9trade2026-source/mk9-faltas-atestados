import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/_authenticated/estabilidade')({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: '/auth',
        search: { 
          // @ts-ignore
          redirect: location.href 
        },
      });
    }

    const { data: isSuperAdmin } = await supabase.rpc('has_role', {
      _user_id: session.user.id,
      _role: 'super_admin'
    });

    if (!isSuperAdmin) {
      throw redirect({
        to: '/dashboard',
      });
    }
  },
})

