import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw redirect({ to: "/auth" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("ativo, primeiro_acesso_pendente")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!profile || profile.ativo === false) {
      // Se não tem perfil ou está inativo, força logout e vai para login com erro
      await supabase.auth.signOut();
      throw redirect({ 
        to: "/auth", 
        search: { inactive: "true" } 
      });
    }

    if (profile.primeiro_acesso_pendente) {
      throw redirect({ to: "/auth/nova-senha" });
    }

    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
