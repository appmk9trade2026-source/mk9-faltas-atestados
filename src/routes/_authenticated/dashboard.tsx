import { createFileRoute } from "@tanstack/react-router";
import { Activity, CheckCircle2, Clock, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · CRM MK9" }] }),
  component: DashboardPage,
});

const stats = [
  { label: "Ausências abertas", value: "—", icon: Activity, hint: "Em breve" },
  { label: "Pendentes de lançamento", value: "—", icon: Clock, hint: "Em breve" },
  { label: "Atestados no mês", value: "—", icon: FileText, hint: "Em breve" },
  { label: "Já lançadas", value: "—", icon: CheckCircle2, hint: "Em breve" },
];

function DashboardPage() {
  const { profile } = useSession();
  return (
    <AppShell title="Dashboard" breadcrumb={["Dashboard"]}>
      <p className="text-sm text-muted-foreground -mt-4">
        Olá, {profile?.nome?.split(" ")[0] ?? "usuário"} — bem-vindo ao CRM MK9.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{s.value}</div>
              <p className="text-[11px] text-muted-foreground mt-1">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Cadastro de empresas, projetos e colaboradores.</p>
          <p>• Formulário de nova ausência com upload de atestado.</p>
          <p>• Painel do RH e controle de lançamentos no sistema externo.</p>
          <p>• Alertas e relatórios.</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
