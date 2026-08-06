import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  loader: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw redirect({ to: "/auth" });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, ativo, primeiro_acesso_pendente")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("[Root Loader] Erro RLS/Banco:", error);
      await supabase.auth.signOut();
      throw redirect({ 
        to: "/auth", 
        search: { error: "db_error", code: error.code, msg: error.message }
      });
    }

    if (!profile) {
      console.error("[Root Loader] Perfil não encontrado para UID:", session.user.id);
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { error: "no_profile" } });
    }

    if (profile.ativo === false) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { inactive: "true" } });
    }

    if (profile.primeiro_acesso_pendente) {
      throw redirect({ to: "/auth/nova-senha" });
    }

    throw redirect({ to: "/dashboard" });
  },
  component: () => (
    <div className="p-8 max-w-4xl mx-auto prose dark:prose-invert">
      <h1>CRM MK9 — NOTIFICAÇÃO DE LANÇAMENTO DE FALTA E ATESTADO</h1>
      <p><strong>PROJECT REF:</strong> wgozydjiuimxxddhodax</p>
      
      <h2>CONTEXTO</h2>
      <p>Atualmente o sistema registra faltas e atestados corretamente, porém os envolvidos não recebem comunicação sobre o lançamento.</p>
      
      <h2>OBJETIVO</h2>
      <p>Implementar um fluxo confiável, auditável e seguro de notificações após o registro de uma falta ou atestado.</p>
      
      <div className="bg-muted p-4 rounded-lg border">
        <p><strong>Status:</strong> Em Auditoria (Etapa 1)</p>
      </div>
    </div>
  ),
});