// Inteligência Analítica — módulo consolidado com abas.
// Concentra Dashboard Executivo, Rankings, Alertas Inteligentes,
// Governança, Qualidade dos Dados e Configuração em uma única tela.
// As rotas antigas continuam existindo e redirecionam para as abas.
// Não altera banco, RPCs, cálculos, score, RLS nem RBAC.
import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  Gauge,
  Trophy,
  UserCog,
  BellRing,
  ShieldCheck,
  ClipboardList,
  Settings,
  Brain,
} from "lucide-react";

import { AppShell, EmbeddedAppShellContext } from "@/components/layout/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";

import { DashboardPage } from "./inteligencia.dashboard";
import { RankingSupervisoresPage } from "./inteligencia.supervisores";
import { AlertasPage } from "./inteligencia.alertas";
import { GovernancaPage } from "./inteligencia.governanca";
import { QualidadePage } from "./inteligencia.qualidade";
import { ConfiguracaoPage } from "./inteligencia.configuracao";

const TAB_KEYS = [
  "dashboard",
  "colaboradores",
  "supervisores",
  "alertas",
  "governanca",
  "qualidade",
  "configuracao",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const searchSchema = z.object({
  tab: fallback(z.string(), "dashboard").optional(),
});

export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({
    meta: [
      { title: "Inteligência Analítica · CRM MK9" },
      {
        name: "description",
        content:
          "Módulo consolidado de inteligência do CRM MK9: dashboard executivo, rankings, alertas, governança, qualidade dos dados e configuração.",
      },
      { property: "og:title", content: "Inteligência Analítica · CRM MK9" },
      {
        property: "og:description",
        content:
          "Ponto único de análises: dashboard, rankings, alertas, governança, qualidade e configuração.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: InteligenciaAnaliticaPage,
});

type TabDef = {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
  roles?: readonly string[];
};

function InteligenciaAnaliticaPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { roles } = useSession();

  const canConfig = roles.includes("super_admin");

  const tabs: TabDef[] = React.useMemo(
    () => [
      { key: "dashboard", label: "Dashboard", icon: Gauge, render: () => <DashboardPage /> },
      { key: "colaboradores", label: "Ranking Colaboradores", icon: Trophy, render: () => <DashboardPage /> },
      { key: "supervisores", label: "Ranking Supervisores", icon: UserCog, render: () => <RankingSupervisoresPage /> },
      { key: "alertas", label: "Alertas Inteligentes", icon: BellRing, render: () => <AlertasPage /> },
      { key: "governanca", label: "Governança", icon: ShieldCheck, render: () => <GovernancaPage /> },
      { key: "qualidade", label: "Qualidade dos Dados", icon: ClipboardList, render: () => <QualidadePage /> },
      ...(canConfig
        ? [{ key: "configuracao" as const, label: "Configuração", icon: Settings, render: () => <ConfiguracaoPage /> }]
        : []),
    ],
    [canConfig],
  );

  const activeTab: TabKey = (search.tab && tabs.some((t) => t.key === search.tab) ? search.tab : "dashboard") as TabKey;

  const handleTabChange = React.useCallback(
    (value: string) => {
      navigate({
        to: "/inteligencia",
        search: { tab: value as TabKey },
        replace: true,
      });
    },
    [navigate],
  );

  return (
    <AppShell title="Inteligência Analítica">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Inteligência Analítica</h2>
            <p className="text-xs text-muted-foreground">
              Ponto único de análise: dashboard, rankings, alertas, governança, qualidade e configuração.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs">{t.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <EmbeddedAppShellContext.Provider value={true}>
            {tabs.map((t) => (
              <TabsContent key={t.key} value={t.key} className="mt-4 focus-visible:outline-none">
                {activeTab === t.key ? t.render() : null}
              </TabsContent>
            ))}
          </EmbeddedAppShellContext.Provider>
        </Tabs>
      </div>
    </AppShell>
  );
}
