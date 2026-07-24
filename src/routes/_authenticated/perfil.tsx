import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { useSession, type AppRole } from "@/hooks/use-session";
import { useSessionScope } from "@/hooks/use-session-scope";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCog, Users, Building2, Briefcase } from "lucide-react";

const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  rh: "RH",
  coordenador: "Coordenador",
  supervisor: "Supervisor",
  compliance: "Compliance",
  operacao: "Operação",
  visualizador: "Visualizador",
};

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu Perfil · CRM MK9" },
      { name: "description", content: "Informações da sua conta no CRM MK9." },
    ],
  }),
  component: PerfilPage,
});

type SupervisorRow = {
  supervisor_id: string;
  nome: string | null;
  colaboradores_count: number;
  empresas: Array<{ id: string; nome: string }> | null;
  projetos: Array<{ id: string; nome: string }> | null;
};

function PerfilPage() {
  const { profile, roles, user } = useSession();
  const scope = useSessionScope();
  const isCoordenador = roles.includes("coordenador");

  const coordQuery = useQuery({
    queryKey: ["perfil", "minha-coordenacao", ...scope.keyParts, user?.id],
    enabled: scope.ready && !!user?.id && isCoordenador,
    queryFn: async (): Promise<SupervisorRow[]> => {
      const { data, error } = await supabase.rpc(
        "coordenacao_supervisores_por_coordenador",
        { _coord_id: user!.id },
      );
      if (error) throw error;
      return (data ?? []) as unknown as SupervisorRow[];
    },
  });

  const supRows = coordQuery.data ?? [];
  const totalColabs = supRows.reduce((a, r) => a + (r.colaboradores_count ?? 0), 0);
  const empresas = new Map<string, string>();
  const projetos = new Map<string, string>();
  supRows.forEach((s) => {
    (s.empresas ?? []).forEach((e) => empresas.set(e.id, e.nome));
    (s.projetos ?? []).forEach((p) => projetos.set(p.id, p.nome));
  });

  return (
    <AppShell title="Meu Perfil" breadcrumb={["Meu Perfil"]}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações da conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Nome</Label>
              <div className="text-sm font-medium">{profile?.nome ?? "—"}</div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">E-mail</Label>
              <div className="text-sm">{profile?.email ?? "—"}</div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs">Papéis</Label>
              <div className="flex flex-wrap gap-1.5">
                {roles.length === 0 ? (
                  <Badge variant="outline">Sem papel atribuído</Badge>
                ) : (
                  roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {roleLabel[r]}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {isCoordenador && (
          <Card>
            <CardHeader>
              <CardTitle>Minha Coordenação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {coordQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat icon={<UserCog className="h-4 w-4" />} label="Supervisores" value={supRows.length} />
                    <Stat icon={<Users className="h-4 w-4" />} label="Colaboradores" value={totalColabs} />
                    <Stat icon={<Building2 className="h-4 w-4" />} label="Empresas" value={empresas.size} />
                    <Stat icon={<Briefcase className="h-4 w-4" />} label="Projetos" value={projetos.size} />
                  </div>
                  {supRows.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                      Você ainda não possui supervisores vinculados. Solicite ao RH ou Super Admin
                      que vincule sua coordenação.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="border-border bg-muted/30 flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
        <div className="mt-0.5 text-xl font-semibold">{value}</div>
      </div>
      <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-md">
        {icon}
      </div>
    </div>
  );
}
