import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Bloqueia usuário inativo e força troca da senha temporária.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, ativo, primeiro_acesso_pendente")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileErr || !profile || profile.ativo === false) {
      if (import.meta.env.DEV) {
        console.error("Gate de Autenticação Bloqueado:", { profile, profileErr });
      }
      await supabase.auth.signOut();
      throw redirect({ 
        to: "/auth", 
        search: { 
          inactive: profile?.ativo === false ? "1" : undefined,
          error: profileErr ? profileErr.message : (!profile ? "no_profile" : undefined)
        } 
      });
    }

    if (profile.primeiro_acesso_pendente === true) {
      throw redirect({ to: "/auth/nova-senha" });
    }

    return { userId: data.user.id };
  },
  component: () => <Outlet />,
});
