import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useSession, type AppRole } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  rh: "RH",
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

function PerfilPage() {
  const { profile, roles } = useSession();

  return (
    <AppShell title="Meu Perfil" breadcrumb={["Meu Perfil"]}>
      <Card className="max-w-2xl">
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
    </AppShell>
  );
}
