import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/_authenticated/suporte')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw redirect({
        to: '/auth',
      });
    }
    
    // RBAC check - Super Admin, RH ou Compliance (Investigadores Técnicos)
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);
      
    const allowedRoles = ['super_admin', 'rh', 'compliance', 'coordenador', 'supervisor', 'operacao'];
    const hasAccess = roles?.some(r => allowedRoles.includes(r.role));
    
    if (!hasAccess) {
      throw redirect({
        to: '/dashboard',
      });
    }
  },
  component: () => <Outlet />
});
