import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Bloqueia usuário inativo
    const { data: profile } = await supabase
      .from("profiles")
      .select("ativo")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || profile.ativo === false) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { inactive: "1" } });
    }
    return { userId: data.user.id };
  },
  component: () => <Outlet />,
});
