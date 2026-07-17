import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · CRM MK9" }] }),
  component: () => <PlaceholderPage title="Configurações" description="Preferências do sistema." />,
});
