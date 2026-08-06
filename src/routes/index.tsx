import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw redirect({ to: "/auth" });
    }

    // Usamos maybeSingle() e tratamos explicitamente o erro de permissão (RLS)
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, ativo, primeiro_acesso_pendente")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !profile || profile.ativo === false) {
      // Se houver erro de RLS (error), perfil ausente (!profile) ou inativo (false),
      // forçamos o logout para limpar o estado e redirecionamos para login.
      await supabase.auth.signOut();
      
      const searchParams: Record<string, string> = {};
      if (profile?.ativo === false) searchParams.inactive = "true";
      else if (error) searchParams.error = "db_error";
      else searchParams.error = "no_profile";

      throw redirect({ 
        to: "/auth", 
        search: searchParams
      });
    }

    if (profile.primeiro_acesso_pendente) {
      throw redirect({ to: "/auth/nova-senha" });
    }

    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
