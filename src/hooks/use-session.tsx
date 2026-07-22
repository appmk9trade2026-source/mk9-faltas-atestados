import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

let bootstrapAttempted = false;
async function tryBootstrapSuperAdmin(): Promise<boolean> {
  if (bootstrapAttempted) return false;
  bootstrapAttempted = true;
  try {
    const { data, error } = await supabase.rpc("bootstrap_first_super_admin");
    if (error) {
      console.error("[bootstrap_first_super_admin]", error);
      return false;
    }
    if (data === "created") {
      toast.success("Primeiro Super Administrador configurado com sucesso.");
      return true;
    }
  } catch (e) {
    console.error("[bootstrap_first_super_admin] exception", e);
  }
  return false;
}

export type AppRole = "super_admin" | "rh" | "supervisor" | "compliance" | "operacao" | "visualizador";

export type ProfileRow = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  primeiro_acesso_pendente: boolean;
};


export type SessionState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  refresh: () => Promise<void>;
};

export function useSession(): SessionState {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  async function loadProfile(userId: string) {
    const [profRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, ativo").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const prof = (profRes.data as ProfileRow | null) ?? null;
    let rolesList = ((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role);

    // Bootstrap: primeiro Super Admin (executado no backend, uma única vez)
    if (
      rolesList.length === 0 &&
      prof?.email?.toLowerCase() === "automacaomk9@gmail.com"
    ) {
      const created = await tryBootstrapSuperAdmin();
      if (created) {
        const { data: r2 } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        rolesList = ((r2 ?? []) as { role: AppRole }[]).map((x) => x.role);
      }
    }

    setProfile(prof);
    setRoles(rolesList);
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) await loadProfile(data.session.user.id);
    else {
      setProfile(null);
      setRoles([]);
    }
  }

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        // defer to avoid deadlock inside supabase callback
        setTimeout(() => {
          loadProfile(s.user.id);
          if (event === "SIGNED_IN") {
            supabase.rpc("log_audit_event", {
              _modulo: "auth",
              _acao: "LOGIN",
              _entidade: "Sessão",
              _observacoes: null,
              _origem: "web",
              _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
            } as never).then(() => {}, () => {});
          }
        }, 0);
      } else {
        if (event === "SIGNED_OUT") {
          supabase.rpc("log_audit_event", {
            _modulo: "auth",
            _acao: "LOGOUT",
            _entidade: "Sessão",
            _origem: "web",
          } as never).then(() => {}, () => {});
        }
        setProfile(null);
        setRoles([]);
      }
    });

    (async () => {
      await refresh();
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const primaryRole: AppRole | null =
    roles.find((r) => r === "super_admin") ??
    roles.find((r) => r === "rh") ??
    roles.find((r) => r === "compliance") ??
    roles.find((r) => r === "supervisor") ??
    null;

  return {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    roles,
    primaryRole,
    refresh,
  };
}
