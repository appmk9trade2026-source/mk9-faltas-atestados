import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { Building2, ChevronRight, FolderKanban } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · CRM MK9" }] }),
  component: ConfiguracoesLayout,
});

type Section = {
  to: "/configuracoes/empresas" | "/configuracoes/projetos";
  icon: typeof Building2;
  title: string;
  desc: string;
};

const SECTIONS: Section[] = [
  {
    to: "/configuracoes/empresas",
    icon: Building2,
    title: "Empresas",
    desc: "Cadastro dos CNPJs utilizados pela MK9.",
  },
  {
    to: "/configuracoes/projetos",
    icon: FolderKanban,
    title: "Projetos",
    desc: "Projetos vinculados a cada empresa.",
  },
];

function ConfiguracoesLayout() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId.startsWith("/_authenticated/configuracoes/"));
  if (isChild) return <Outlet />;

  return (
    <AppShell title="Configurações" breadcrumb={["Configurações"]}>
      <p className="text-sm text-muted-foreground -mt-4">
        Preferências e cadastros gerais do sistema.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="group">
            <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
              <CardContent className="flex items-start gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{s.title}</p>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

